import React, { useState, useEffect } from 'react';
import StatusBar from './components/StatusBar';
import BottomNav from './components/BottomNav';
import {
  getSupabase,
  fetchUserProfile,
  logoutFromDatabase,
  fetchUserTransactions,
  insertUserTransaction,
  deleteUserTransaction,
  clearAllUserTransactions,
  syncUserSplitBills,
  updateUserOnlineStatus,
  subscribeToOnlinePresence,
  isEmailAdmin,
} from './lib/supabase';

// Views
import LoginView from './views/LoginView';
import ForgotPasswordView from './views/ForgotPasswordView';
import RegisterView from './views/RegisterView';
import HomeView from './views/HomeView';
import ExpenseView from './views/ExpenseView';
import ProfileView from './views/ProfileView';
import SettingsView from './views/SettingsView';
import ReportView from './views/ReportView';
import AboutView from './views/AboutView';
import GoalsView from './views/GoalsView';
import SplitBillView from './views/SplitBillView';
import StatsView from './views/StatsView';
import AdminDashboardView from './views/AdminDashboardView';

export default function App() {
  // โหลดข้อมูลผู้ใช้ปัจจุบัน (ถ้าเคยล็อกอินไว้แล้ว)
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('monetech_active_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [currentScreen, setCurrentScreen] = useState(() => {
    const savedUser = localStorage.getItem('monetech_active_user');
    if (!savedUser) return 'login';
    try {
      const parsed = JSON.parse(savedUser);
      const savedScreen = localStorage.getItem('monetech_current_screen');
      if (savedScreen) return savedScreen;
      return parsed?.role === 'admin' ? 'admin' : 'home';
    } catch {
      return 'home';
    }
  });

  // รายชื่อ ID ผู้ใช้ที่กำลังออนไลน์แบบ Realtime
  const [onlineUserIds, setOnlineUserIds] = useState([]);

  // Context สำหรับการสแกนสลิปเพื่อตัดยอดบิล
  const [billContext, setBillContext] = useState(null);

  // State เก็บรายการที่บันทึกจากสลิปและรายจ่ายจริงของผู้ใช้แต่ละคน
  const [transactions, setTransactions] = useState(() => {
    const savedUser = localStorage.getItem('monetech_active_user');
    let userId = null;
    if (savedUser) {
      try {
        userId = JSON.parse(savedUser)?.id;
      } catch {
        // ignore
      }
    }
    const key = userId ? `monetech_transactions_${userId}` : 'monetech_transactions';
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fallback
      }
    }
    return [];
  });

  // ตรวจสอบ Session จาก Supabase และดึงข้อมูลล่าสุดจาก Database เมื่อเปิดแอป
  useEffect(() => {
    let mounted = true;
    const initSession = async () => {
      const supabase = getSupabase();
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data?.session?.user;
        if (sessionUser && mounted) {
          const profile = await fetchUserProfile(sessionUser.id, sessionUser);
          setCurrentUser(profile);
          localStorage.setItem('monetech_active_user', JSON.stringify(profile));
          await updateUserOnlineStatus(sessionUser.id, true);
          const dbTx = await fetchUserTransactions(sessionUser.id);
          if (mounted) setTransactions(dbTx);
          return;
        }
      }

      if (currentUser?.id && mounted) {
        const dbTx = await fetchUserTransactions(currentUser.id);
        if (mounted) setTransactions(dbTx);
      }
    };

    initSession();
    return () => {
      mounted = false;
    };
  }, []);

  // ระบบ Realtime Presence & Heartbeat อัปเดตสถานะ ออนไลน์ / ออฟไลน์
  useEffect(() => {
    if (!currentUser?.id) return;

    updateUserOnlineStatus(currentUser.id, true);

    const unsubscribePresence = subscribeToOnlinePresence(currentUser, (ids) => {
      setOnlineUserIds(ids);
    });

    // ส่งสัญญาณออนไลน์ทุก 30 วินาที
    const heartbeatTimer = setInterval(() => {
      updateUserOnlineStatus(currentUser.id, true);
    }, 30000);

    const handleBeforeUnload = () => {
      updateUserOnlineStatus(currentUser.id, false);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(heartbeatTimer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      unsubscribePresence();
    };
  }, [currentUser?.id]);

  // บันทึก transactions ลง localStorage แยกตามรายบุคคลควบคู่กับ Database
  useEffect(() => {
    const key = currentUser?.id
      ? `monetech_transactions_${currentUser.id}`
      : 'monetech_transactions';
    localStorage.setItem(key, JSON.stringify(transactions));
  }, [transactions, currentUser?.id]);

  // แท็บหลักที่มีแถบเมนูด้านล่าง (Bottom Navigation)
  const mainTabs = ['home', 'goals', 'bills', 'stats'];

  const handleNavigate = (screen, context = null) => {
    setBillContext(context);
    setCurrentScreen(screen);
    localStorage.setItem('monetech_current_screen', screen);
  };

  // เมื่อ Login หรือ Register สำเร็จ -> โหลดข้อมูลของผู้ใช้นั้นจาก Database
  // ถ้าเป็น Role Admin จะเข้าสู่หน้า Admin Dashboard ทันที
  const handleLoginSuccess = async (userProfile) => {
    setCurrentUser(userProfile);
    localStorage.setItem('monetech_active_user', JSON.stringify(userProfile));
    if (userProfile?.id) {
      await updateUserOnlineStatus(userProfile.id, true);
      const userTx = await fetchUserTransactions(userProfile.id);
      setTransactions(userTx);
    }
    if (userProfile?.role === 'admin') {
      handleNavigate('admin');
    } else {
      handleNavigate('home');
    }
  };

  // ออกจากระบบ (ตั้งสถานะเป็นออฟไลน์ใน Database)
  const handleLogout = async () => {
    await logoutFromDatabase(currentUser?.id);
    setCurrentUser(null);
    setTransactions([]);
    handleNavigate('login');
  };

  // ฟังก์ชันรับรายการสลิป / รายจ่ายใหม่ และบันทึกลง Database
  const handleAddExpense = async (newExpense) => {
    setTransactions((prev) => [newExpense, ...prev]);
    if (currentUser?.id) {
      await insertUserTransaction(currentUser.id, newExpense);
    }
  };

  // ลบรายการรายจ่ายรายตัวออกจากทั้งแอปและ Database
  const handleDeleteTransaction = async (id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    if (currentUser?.id) {
      await deleteUserTransaction(currentUser.id, id);
    }
  };

  // สลับประเภทรายการระหว่าง รายรับ (income) และ รายจ่าย (expense)
  const handleToggleTransactionType = async (id) => {
    let updatedItem = null;
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const isCurrentlyIncome =
          t.type === 'income' || String(t.category || '').startsWith('income');
        const nextType = isCurrentlyIncome ? 'expense' : 'income';
        const nextCategory = isCurrentlyIncome ? 'other' : 'income_topup';
        updatedItem = { ...t, type: nextType, category: nextCategory };
        return updatedItem;
      })
    );
    if (currentUser?.id && updatedItem) {
      await insertUserTransaction(currentUser.id, updatedItem);
    }
  };

  // รีเซ็ตค่ารายจ่ายทั้งหมดเป็น 0
  const handleClearAllTransactions = async () => {
    setTransactions([]);
    const key = currentUser?.id
      ? `monetech_transactions_${currentUser.id}`
      : 'monetech_transactions';
    localStorage.setItem(key, JSON.stringify([]));
    if (currentUser?.id) {
      await clearAllUserTransactions(currentUser.id);
    }
  };

  // อัปเดตสถานะบิลเมื่อสแกนสลิปสำเร็จ
  const handleBillPaid = async (billId) => {
    const storageKey = currentUser?.id
      ? `monetech_split_bills_${currentUser.id}`
      : 'monetech_split_bills';
    const savedBills = localStorage.getItem(storageKey);
    if (savedBills) {
      try {
        const parsed = JSON.parse(savedBills);
        const updated = parsed.map((b) => {
          if (b.id === billId) {
            return {
              ...b,
              isPaid: true,
              statusBadge: 'ชำระแล้ว ✓',
              statusType: 'completed',
              members: b.members
                ? b.members.map((m) =>
                    !m.isPaid
                      ? {
                          ...m,
                          isPaid: true,
                          subtitle: 'โอนแล้วเมื่อสักครู่',
                          amountPaid: m.amountOwed || b.perPerson,
                        }
                      : m
                  )
                : [],
            };
          }
          return b;
        });
        await syncUserSplitBills(currentUser?.id, updated);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'login':
        return (
          <LoginView
            onNavigate={handleNavigate}
            onLoginSuccess={handleLoginSuccess}
          />
        );
      case 'forgot-password':
        return <ForgotPasswordView onNavigate={handleNavigate} />;
      case 'register':
        return (
          <RegisterView
            onNavigate={handleNavigate}
            onLoginSuccess={handleLoginSuccess}
          />
        );
      case 'admin':
        return (
          <AdminDashboardView
            onNavigate={handleNavigate}
            currentUser={currentUser}
            onlineUserIds={onlineUserIds}
            onLogout={handleLogout}
          />
        );
      case 'home':
        return (
          <HomeView
            onNavigate={handleNavigate}
            transactions={transactions}
            onDeleteTransaction={handleDeleteTransaction}
            onToggleTransactionType={handleToggleTransactionType}
            onClearAll={handleClearAllTransactions}
            currentUser={currentUser}
            onUpdateUser={setCurrentUser}
            onLogout={handleLogout}
          />
        );
      case 'expense':
        return (
          <ExpenseView
            onNavigate={handleNavigate}
            onAddExpense={handleAddExpense}
            billContext={billContext}
            onBillPaid={handleBillPaid}
          />
        );
      case 'profile':
        return (
          <ProfileView
            onNavigate={handleNavigate}
            currentUser={currentUser}
            onUpdateUser={setCurrentUser}
            onLogout={handleLogout}
          />
        );
      case 'settings':
        return <SettingsView onNavigate={handleNavigate} />;
      case 'report':
        return (
          <ReportView
            onNavigate={handleNavigate}
            transactions={transactions}
            currentUser={currentUser}
          />
        );
      case 'about':
        return <AboutView onNavigate={handleNavigate} />;
      case 'goals':
        return (
          <GoalsView
            onNavigate={handleNavigate}
            currentUser={currentUser}
            onUpdateUser={setCurrentUser}
          />
        );
      case 'bills':
        return (
          <SplitBillView
            onNavigate={handleNavigate}
            onAddExpense={handleAddExpense}
            currentUser={currentUser}
          />
        );
      case 'stats':
        return (
          <StatsView
            onNavigate={handleNavigate}
            transactions={transactions}
            onDeleteTransaction={handleDeleteTransaction}
            onClearAll={handleClearAllTransactions}
            onAddExpense={handleAddExpense}
            currentUser={currentUser}
            onUpdateUser={setCurrentUser}
          />
        );
      default:
        return (
          <LoginView
            onNavigate={handleNavigate}
            onLoginSuccess={handleLoginSuccess}
          />
        );
    }
  };

  const authScreens = ['login', 'register', 'forgot-password'];
  const isAuthScreen = authScreens.includes(currentScreen);
  const isAdminUser =
    currentUser?.role === 'admin' ||
    isEmailAdmin(currentUser?.email, currentUser?.fullName);

  // คำนวณยอดสรุปสำหรับแสดงบนแถบ Header ของหน้าเว็บ PC
  const isIncomeTx = (item) =>
    item?.type === 'income' || String(item?.category || '').startsWith('income');
  const totalIncomeSummary = transactions
    .filter((item) => isIncomeTx(item))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalExpenseSummary = transactions
    .filter((item) => !isIncomeTx(item))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const lockedSavingsSummary = Number(currentUser?.lockedSavings) || 0;
  const availableBalanceSummary = Math.max(
    0,
    totalIncomeSummary - lockedSavingsSummary - totalExpenseSummary
  );

  const screenTitles = {
    home: { title: 'หน้าหลัก (Dashboard)', subtitle: 'ภาพรวมกระเป๋าเงิน รายรับ-รายจ่าย และประวัติสลิป' },
    goals: { title: 'เป้าหมายเงินออม (Savings Goals)', subtitle: 'จัดการเงินออมล็อกอัตโนมัติและกระปุกเป้าหมายระยะสั้น' },
    bills: { title: 'บิลหารกับเพื่อน (Split Bills)', subtitle: 'สร้างบิลหารค่าใช้จ่าย ติดตามสถานะการโอนคืน และ QR PromptPay' },
    stats: { title: 'สถิติการเงิน (Financial Analytics)', subtitle: 'วิเคราะห์พฤติกรรมการใช้จ่ายรายวันและสัดส่วนตามหมวดหมู่' },
    expense: { title: 'สแกนสลิป / บันทึกรายการ', subtitle: 'อัปโหลดสลิปเพื่อสแกนด้วย AI หรือกรอกรายการรายรับ-รายจ่าย' },
    profile: { title: 'โปรไฟล์ผู้ใช้งาน', subtitle: 'จัดการข้อมูลส่วนตัว รูปโปรไฟล์ และรหัสผ่าน' },
    settings: { title: 'การตั้งค่าระบบ', subtitle: 'ปรับแต่งการแจ้งเตือนและตั้งค่าการใช้งานแอปพลิเคชัน' },
    report: { title: 'แจ้งปัญหา / ข้อเสนอแนะ', subtitle: 'ส่งรายงานปัญหาหรือข้อเสนอแนะถึงทีมผู้ดูแลระบบ' },
    about: { title: 'เกี่ยวกับ Monetech', subtitle: 'ข้อมูลระบบกระเป๋าเงินอัจฉริยะ Monetech Smart Wallet' },
    admin: { title: 'จัดการระบบ (Admin Dashboard)', subtitle: 'ตรวจสอบสถานะผู้ใช้งานออนไลน์ ยอดสลิป และรายการแจ้งปัญหา' },
  };

  const currentHeaderMeta = screenTitles[currentScreen] || screenTitles.home;

  return (
    <div className="min-h-screen bg-slate-100 md:bg-[#f8fafc] font-['Prompt',sans-serif] text-slate-900">
      {isAuthScreen ? (
        /* ==================== LAYOUT หน้า LOGIN / REGISTER ==================== */
        /* มือถือ (< md): แสดงเต็มจอเหมือนเดิม | PC (>= md): แสดงแบบหน้าเว็บ Split-Screen */
        <div className="min-h-screen flex flex-col md:grid md:grid-cols-12">
          {/* ฝั่งซ้ายบน PC: แบนเนอร์แนะนำเว็บแอป Monetech */}
          <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white p-12 flex-col justify-between relative overflow-hidden">
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-10 right-10 w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/30 flex items-center justify-center text-white">
                <span className="material-symbols-outlined text-3xl font-bold">query_stats</span>
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight">Monetech</h2>
                <p className="text-xs text-emerald-300 font-semibold tracking-wider uppercase">
                  Smart Wallet Web Application
                </p>
              </div>
            </div>

            <div className="relative z-10 max-w-xl space-y-6 my-auto">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                ระบบจัดการการเงินอัจฉริยะ สำหรับวัยเรียนและวัยทำงาน
              </span>
              <h1 className="text-4xl xl:text-5xl font-black leading-tight tracking-tight">
                จัดการรายรับ-รายจ่าย <br />
                <span className="text-emerald-400">สแกนสลิป & ออมเงิน</span> ในที่เดียว
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                เชื่อมต่อฐานข้อมูล Cloud แบบเรียลไทม์ ใช้งานได้ต่อเนื่องทั้งบนสมาร์ตโฟนและหน้าเว็บคอมพิวเตอร์
                พร้อมระบบล็อกเงินออมอัตโนมัติ หารบิลกับเพื่อน และวิเคราะห์สถิติรายวัน
              </p>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xs">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-xl">document_scanner</span>
                  </div>
                  <h4 className="text-sm font-bold">Smart Slip AI Scanner</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    อ่านยอดเงินและชื่อรายการจากรูปสลิปโอนเงินอัตโนมัติ
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xs">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-xl">savings</span>
                  </div>
                  <h4 className="text-sm font-bold">Auto-Lock Savings</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ล็อกเงินออมแยกไว้ทันที คำนวณงบใช้ได้ต่อวันให้อัตโนมัติ
                  </p>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 border-t border-white/10 pt-6">
              <span>© 2026 Monetech Smart Wallet</span>
              <span>รองรับการใช้งานทั้ง Mobile & PC Web</span>
            </div>
          </div>

          {/* ฝั่งขวาบน PC (หรือเต็มจอบนมือถือ): กล่องฟอร์ม Login / Register (ไม่มีกรอบโทรศัพท์และไม่มีจุดดำด้านบน) */}
          <div className="flex-1 md:col-span-12 lg:col-span-6 xl:col-span-5 flex flex-col justify-center items-center md:p-8 bg-white md:bg-slate-50/70 min-h-screen">
            <div className="w-full max-w-md md:max-w-lg bg-white min-h-screen md:min-h-0 md:rounded-3xl md:shadow-xl md:border md:border-slate-200/80 overflow-hidden flex flex-col relative">
              <div className="flex-1 overflow-y-auto flex flex-col relative pb-4 md:p-4">
                {renderScreen()}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== LAYOUT หน้าใช้งานแอปหลัก ==================== */
        /* มือถือ (< md): คงรูปแบบแอปมือถือเดิม 100% | PC (>= md): ขยายเป็น Web Dashboard เต็มจอ */
        <div className="min-h-screen flex flex-col md:flex-row">
          {/* 1. แถบเมนู Sidebar ด้านซ้าย (แสดงเฉพาะบน PC >= md) */}
          <aside className="hidden md:flex md:w-64 lg:w-72 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200/80 z-40 select-none">
            {/* โลโก้ด้านบน Sidebar */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div
                onClick={() => handleNavigate('home')}
                className="flex items-center gap-3 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-2xl bg-emerald-500 shadow-md shadow-emerald-500/25 flex items-center justify-center text-white">
                  <span className="material-symbols-outlined text-2xl font-bold">query_stats</span>
                </div>
                <div>
                  <h1 className="text-lg font-black text-slate-900 leading-none">Monetech</h1>
                  <p className="text-[10px] font-bold text-emerald-600 tracking-wider uppercase mt-1">
                    Smart Wallet Web
                  </p>
                </div>
              </div>
            </div>

            {/* ปุ่มด่วน + สแกนสลิป / บันทึกรายการ */}
            <div className="px-4 pt-4 pb-2">
              <button
                type="button"
                onClick={() => handleNavigate('expense')}
                className="w-full bg-[#0d1322] hover:bg-slate-800 active:scale-[0.99] text-white font-bold py-3 px-4 rounded-2xl shadow-md flex items-center justify-center gap-2 transition text-xs"
              >
                <span className="material-symbols-outlined text-lg">add_circle</span>
                <span>สแกนสลิป / บันทึกรายการ</span>
              </button>
            </div>

            {/* รายการเมนูหลัก */}
            <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
              <p className="px-3 pb-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                เมนูหลัก
              </p>
              {[
                { id: 'home', icon: 'home', label: 'หน้าหลัก (Dashboard)' },
                { id: 'goals', icon: 'target', label: 'เป้าหมายเงินออม' },
                { id: 'bills', icon: 'groups', label: 'บิลหารกับเพื่อน' },
                { id: 'stats', icon: 'bar_chart', label: 'สถิติการเงิน' },
              ].map((item) => {
                const active = currentScreen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                      active
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[20px] ${
                        active ? 'icon-fill text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}

              {isAdminUser && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleNavigate('admin')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                      currentScreen === 'admin'
                        ? 'bg-amber-100/90 text-amber-900 border border-amber-300 shadow-2xs'
                        : 'bg-amber-50/60 text-amber-800 hover:bg-amber-100/70 border border-amber-200/60'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px] text-amber-600">
                      shield_person
                    </span>
                    <span>👑 หน้า Admin Dashboard</span>
                  </button>
                </div>
              )}

              <div className="pt-4">
                <p className="px-3 pb-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  บัญชีและการตั้งค่า
                </p>
                {[
                  { id: 'profile', icon: 'person', label: 'โปรไฟล์ผู้ใช้งาน' },
                  { id: 'settings', icon: 'settings', label: 'การตั้งค่า' },
                  { id: 'report', icon: 'campaign', label: 'แจ้งปัญหาการใช้งาน' },
                  { id: 'about', icon: 'info', label: 'เกี่ยวกับแอป' },
                ].map((item) => {
                  const active = currentScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavigate(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                        active
                          ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/70'
                          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[19px] ${
                          active ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* การ์ดข้อมูลผู้ใช้ด้านล่าง Sidebar */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/60 space-y-2.5">
              <div
                onClick={() => handleNavigate('profile')}
                className="flex items-center gap-3 cursor-pointer p-1.5 rounded-xl hover:bg-white transition"
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-200 overflow-hidden flex items-center justify-center text-emerald-600">
                    {currentUser?.avatarUrl ? (
                      <img
                        src={currentUser.avatarUrl}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="material-symbols-outlined icon-fill text-xl">person</span>
                    )}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"></span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {currentUser?.fullName || 'ผู้ใช้งาน'}
                    </p>
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 ${
                        isAdminUser
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {isAdminUser ? '👑 ADMIN' : 'USER'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{currentUser?.email || ''}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <span className="material-symbols-outlined text-base">logout</span>
                <span>ออกจากระบบ</span>
              </button>
            </div>
          </aside>

          {/* 2. พื้นที่เนื้อหาหลัก (บนมือถือคือหน้าจอแอปเดิม | บน PC คือพื้นที่ Dashboard ด้านขวาของ Sidebar) */}
          <div className="flex-1 md:pl-64 lg:pl-72 flex flex-col min-h-screen">
            {/* แถบ Header ด้านบนสำหรับหน้าเว็บ PC */}
            <header className="hidden md:flex items-center justify-between px-8 py-4 bg-white/85 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">
                  {currentHeaderMeta.title}
                </h2>
                <p className="text-xs text-slate-500">{currentHeaderMeta.subtitle}</p>
              </div>

              <div className="flex items-center gap-3">
                {/* ป้ายสรุปยอดคงเหลือบนแถบด้านบน PC */}
                <div className="hidden xl:flex items-center gap-4 bg-slate-50 border border-slate-200/80 rounded-2xl px-4 py-2 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium">ใช้ได้จริง: </span>
                    <span className="font-extrabold text-emerald-600">
                      ฿{availableBalanceSummary.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="h-3.5 w-[1px] bg-slate-200"></div>
                  <div>
                    <span className="text-slate-400 font-medium">ล็อกเงินออม: </span>
                    <span className="font-extrabold text-indigo-600">
                      ฿{lockedSavingsSummary.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleNavigate('expense', { defaultType: 'income' })}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  <span>เติมรายรับ</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('expense', { defaultType: 'expense' })}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition"
                >
                  <span className="material-symbols-outlined text-base">photo_camera</span>
                  <span>บันทึกรายจ่าย</span>
                </button>
              </div>
            </header>

            {/* กล่องเนื้อหาหลัก (ไม่มีกรอบโทรศัพท์และไม่มีจุดดำด้านบน) */}
            <div className="w-full bg-white md:bg-transparent min-h-screen md:min-h-0 flex-1 flex flex-col relative">
              <main className="flex-1 overflow-y-auto flex flex-col relative pb-4 md:pb-12 md:px-8 lg:px-10 md:pt-7 w-full max-w-[1440px] mx-auto">
                {renderScreen()}
              </main>

              {mainTabs.includes(currentScreen) && (
                <div className="md:hidden">
                  <BottomNav currentScreen={currentScreen} onNavigate={handleNavigate} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
