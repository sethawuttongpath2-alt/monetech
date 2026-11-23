import React, { useState, useEffect } from 'react';
import { updateUserProfileInDatabase, isEmailAdmin } from '../lib/supabase';

export default function HomeView({
  onNavigate,
  transactions = [],
  onDeleteTransaction,
  onToggleTransactionType,
  onClearAll,
  currentUser,
  onUpdateUser,
  onLogout,
}) {
  const isAdmin =
    currentUser?.role === 'admin' ||
    isEmailAdmin(currentUser?.email, currentUser?.fullName);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // ดึงเงินออมที่เคยล็อกไว้จากข้อมูลผู้ใช้ใน Database หรือ localStorage
  const [lockedSavings, setLockedSavings] = useState(() => {
    if (currentUser?.lockedSavings !== undefined) {
      return Number(currentUser.lockedSavings) || 0;
    }
    return parseFloat(localStorage.getItem('monetech_locked_savings')) || 0;
  });

  useEffect(() => {
    if (currentUser?.lockedSavings !== undefined) {
      setLockedSavings(Number(currentUser.lockedSavings) || 0);
    }
  }, [currentUser?.lockedSavings]);

  // Modal สำหรับแก้ไขเงินออมที่ล็อกไว้
  const [isEditingSavings, setIsEditingSavings] = useState(false);
  const [tempSavings, setTempSavings] = useState('');

  // ตรวจสอบว่ารายการไหนเป็น "รายรับ (income)" หรือ "รายจ่าย (expense)"
  const isIncomeItem = (item) =>
    item?.type === 'income' || String(item?.category || '').startsWith('income');

  // 1. ยอดรายรับรวมทั้งหมด (งบทั้งเดือนที่เติมเข้ามา)
  const totalSlipBudget = transactions
    .filter((item) => isIncomeItem(item))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  // 2. ยอดรายจ่ายรวมทั้งหมด (ที่จะนำไปหักลบออก)
  const totalExpenseSpent = transactions
    .filter((item) => !isIncomeItem(item))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  // 3. ยอดเงินตั้งต้นหลังหักเงินออม และ ยอดคงเหลือที่ใช้ได้จริงหลังหักรายจ่ายแล้ว
  const netBudgetAfterSavings = Math.max(0, totalSlipBudget - lockedSavings);
  const availableBudget = Math.max(0, totalSlipBudget - lockedSavings - totalExpenseSpent);

  // 4. คำนวณจำนวนวันจริงทั้งหมดในเดือนปัจจุบัน
  const today = new Date();
  const totalDaysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  // เฉลี่ยตามจำนวนวันจริงเต็มทั้งเดือน (คิดจากยอดเงินคงเหลือจริงหลังหักรายจ่าย)
  const dailyAverageAvailable = availableBudget > 0 ? availableBudget / totalDaysInMonth : 0;

  // เปอร์เซ็นต์เงินที่เหลือใช้หลังจากหักเงินออมและรายจ่าย
  const remainingPercent =
    totalSlipBudget > 0
      ? Math.max(0, Math.min(100, Math.round((availableBudget / totalSlipBudget) * 100)))
      : 0;

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3000);
  };

  const handleOpenEditSavings = () => {
    setTempSavings(lockedSavings.toString());
    setIsEditingSavings(true);
  };

  const handleSaveSavings = async (e) => {
    e.preventDefault();
    const val = parseFloat(tempSavings) || 0;
    if (totalSlipBudget > 0 && val > totalSlipBudget) {
      alert('ยอดเงินออมที่ล็อกไว้ต้องไม่เกินงบรวมจากรายรับ');
      return;
    }
    setLockedSavings(val);
    localStorage.setItem('monetech_locked_savings', val.toString());
    setIsEditingSavings(false);

    if (currentUser?.id) {
      try {
        const updated = await updateUserProfileInDatabase(currentUser.id, { lockedSavings: val });
        if (onUpdateUser) onUpdateUser(updated);
      } catch (err) {
        console.error('Failed to sync lockedSavings:', err);
      }
    }
    showToast('💾 บันทึกเงินออมลง Database เรียบร้อยแล้ว');
  };

  const handleConfirmDelete = () => {
    if (!itemToDelete) return;
    if (onDeleteTransaction) {
      onDeleteTransaction(itemToDelete.id);
    }
    showToast(`🗑️ ลบรายการ "${itemToDelete.title}" แล้ว`);
    setItemToDelete(null);
  };

  const handleClearAllSlips = () => {
    if (window.confirm('คุณต้องการลบสลิป/รายการทั้งหมดในหน้าหลักหรือไม่?')) {
      if (onClearAll) {
        onClearAll();
      }
      showToast('🗑️ ล้างรายการทั้งหมดเป็น 0 เรียบร้อยแล้ว');
    }
  };

  return (
    <section className="flex-1 flex flex-col px-5 md:px-0 pt-2 md:pt-0 pb-24 md:pb-6 space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 max-w-xs w-full px-4">
          <div className="bg-slate-900/95 text-white text-xs font-semibold py-2.5 px-4 rounded-2xl shadow-xl backdrop-blur flex items-center justify-center text-center border border-slate-700 animate-fade-in">
            {toastMessage}
          </div>
        </div>
      )}

      {/* Header with Profile Dropdown (แสดงบนมือถือ ส่วนบน PC จะอยู่ใน Sidebar ซ้าย) */}
      <div className="flex md:hidden justify-between items-center py-2 relative">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-full bg-emerald-100 overflow-hidden flex items-center justify-center text-emerald-600 border border-emerald-200">
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined icon-fill text-2xl">person</span>
              )}
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"></span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-slate-500">
                สวัสดี,{' '}
                <span className="font-semibold text-slate-700">
                  {currentUser?.fullName || 'ผู้ใช้งาน'}
                </span>
              </p>
              <span
                className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${
                  isAdmin
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {isAdmin ? '👑 ADMIN' : 'USER'}
              </span>
            </div>
            <h2 className="text-base font-bold text-slate-900">Monetech</h2>
          </div>
        </div>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-11 h-11 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 transition"
            aria-label="เมนู"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-13 w-56 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-100 py-1.5 z-50 divide-y divide-slate-100/70">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('admin');
                    setIsMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3.5 text-left text-amber-800 bg-amber-50/70 hover:bg-amber-100/80 transition"
                >
                  <span className="material-symbols-outlined text-[20px] text-amber-600">
                    shield_person
                  </span>
                  <span className="text-sm font-bold">👑 หน้า Admin Dashboard</span>
                </button>
              )}
              {[
                { id: 'profile', icon: 'person', label: 'โปรไฟล์' },
                { id: 'settings', icon: 'settings', label: 'การตั้งค่า' },
                { id: 'report', icon: 'campaign', label: 'แจ้งปัญหา' },
                { id: 'about', icon: 'info', label: 'เกี่ยวกับแอป' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.id);
                    setIsMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3.5 text-left text-slate-800 hover:bg-emerald-50/70 transition"
                >
                  <span className="material-symbols-outlined text-[20px] text-slate-700">
                    {item.icon}
                  </span>
                  <span className="text-sm font-semibold">{item.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  if (onLogout) onLogout();
                  else onNavigate('login');
                }}
                className="w-full px-4 py-3 flex items-center gap-3.5 text-left text-rose-600 hover:bg-rose-50 transition"
              >
                <span className="material-symbols-outlined text-[20px] text-rose-600">logout</span>
                <span className="text-sm font-semibold">ออกจากระบบ</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ปุ่มด่วนสำหรับ Admin เพื่อสลับไปหน้า Admin Dashboard */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => onNavigate('admin')}
          className="w-full bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl px-4 py-2.5 flex items-center justify-between shadow-md hover:opacity-95 active:scale-[0.99] transition"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-lg">shield_person</span>
            <span className="text-xs font-bold">👑 เปิดหน้าจัดการระบบ (Admin Dashboard)</span>
          </div>
          <span className="material-symbols-outlined text-amber-300 text-base">chevron_right</span>
        </button>
      )}

      {/* โครงสร้าง Grid: มือถือเรียงลงมาเหมือนเดิม 100% | PC แบ่ง 2 คอลัมน์ซ้าย-ขวา */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
        {/* คอลัมน์ซ้ายบน PC: การ์ดยอดเงิน + งบทั้งเดือน/เงินออม + ปุ่มลัด */}
        <div className="space-y-4 lg:col-span-5">
          {/* กล่องสีเขียว: ยอดที่ใช้ได้หลังหักเงินออมและรายจ่าย + ค่าเฉลี่ยรายวัน */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-3xl p-5 md:p-6 shadow-lg relative overflow-hidden">
            <div className="flex justify-between items-center">
              <p className="text-xs text-emerald-100 font-medium">ยอดเงินที่ใช้ได้ในเดือนนี้</p>
              <span className="text-[11px] bg-white/20 px-2.5 py-1 rounded-full font-bold backdrop-blur-xs">
                เฉลี่ย ฿
                {dailyAverageAvailable.toLocaleString('th-TH', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                /วัน ({totalDaysInMonth} วัน)
              </span>
            </div>

            <div className="flex items-baseline gap-1 my-2">
              <span className="text-2xl font-bold">฿</span>
              <span className="text-4xl font-extrabold tracking-tight">
                {availableBudget.toLocaleString('th-TH', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            <div className="mt-3">
              <div className="w-full h-2 bg-black/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-500"
                  style={{ width: `${remainingPercent}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[11px] text-emerald-100 mt-2">
                <span>
                  {totalSlipBudget > 0 || totalExpenseSpent > 0
                    ? `รายรับ ฿${totalSlipBudget.toLocaleString('th-TH')} • จ่ายไป ฿${totalExpenseSpent.toLocaleString('th-TH')}`
                    : 'รอการเติมงบ / สแกนสลิป'}
                </span>
                <span className="font-bold">
                  {totalSlipBudget > 0 ? `เหลือใช้ ${remainingPercent}%` : '0%'}
                </span>
              </div>
            </div>
          </div>

          {/* กล่องสีขาวคู่: งบทั้งเดือน (รายรับ) & ล็อกเงินออมแล้ว 🔒 */}
          <div className="grid grid-cols-2 gap-3">
            {/* ช่องซ้าย: งบทั้งเดือน (กดเพื่อเติมงบรายรับได้) */}
            <div
              onClick={() => onNavigate('expense', { defaultType: 'income' })}
              className="bg-slate-50 md:bg-white hover:bg-emerald-50/50 cursor-pointer border border-slate-200/80 rounded-2xl p-3.5 md:p-4 transition active:scale-[0.98] md:shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-medium">รายรับ / งบทั้งเดือน</p>
                <span className="material-symbols-outlined text-xs text-emerald-500 font-bold">
                  add_circle
                </span>
              </div>
              <div className="text-lg font-bold text-slate-900 my-1 truncate">
                ฿ {totalSlipBudget.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-emerald-600 font-medium">
                {totalExpenseSpent > 0
                  ? `● ใช้จ่ายไปแล้ว -฿${totalExpenseSpent.toLocaleString('th-TH')}`
                  : '● กดเพื่อเติมงบ/รายรับ'}
              </span>
            </div>

            {/* ช่องขวา: ล็อกเงินออมแล้ว 🔒 (กดเพื่อตั้งค่าได้) */}
            <div
              onClick={handleOpenEditSavings}
              className="bg-slate-50 md:bg-white hover:bg-indigo-50/50 cursor-pointer border border-slate-200/80 rounded-2xl p-3.5 md:p-4 transition active:scale-[0.98] md:shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-medium">ล็อกเงินออมแล้ว 🔒</p>
                <span className="material-symbols-outlined text-xs text-indigo-400">edit</span>
              </div>
              <div className="text-lg font-bold text-indigo-600 my-1 truncate">
                ฿ {lockedSavings.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-indigo-500 font-medium">
                {lockedSavings === 0 ? 'กดเพื่อตั้งค่าเงินออม' : 'หักเก็บเรียบร้อย'}
              </p>
            </div>
          </div>

          {/* ปุ่มด่วนแยกชัดเจน: เติมรายรับ (+) vs บันทึกรายจ่าย (-) */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('expense', { defaultType: 'income' })}
              className="bg-emerald-50/80 border border-emerald-200 hover:bg-emerald-100/70 active:scale-[0.98] transition rounded-2xl p-3 flex items-center gap-2.5 text-left"
            >
              <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-lg">add</span>
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">เติมงบ / รายรับ</h4>
                <p className="text-[10px] text-emerald-700 truncate">เพิ่มยอดเงินเข้า (+)</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('expense', { defaultType: 'expense' })}
              className="bg-rose-50/80 border border-rose-200 hover:bg-rose-100/70 active:scale-[0.98] transition rounded-2xl p-3 flex items-center gap-2.5 text-left"
            >
              <div className="w-9 h-9 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-lg">photo_camera</span>
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">สแกนสลิป / จ่าย</h4>
                <p className="text-[10px] text-rose-600 truncate">หักยอดเงินออก (-)</p>
              </div>
            </button>
          </div>
        </div>

        {/* คอลัมน์ขวาบน PC: รายการสลิปและธุรกรรมที่บันทึกเข้ามา */}
        <div className="lg:col-span-7 md:bg-white md:border md:border-slate-200/80 md:rounded-3xl md:p-5 md:shadow-xs">
          <div className="flex justify-between items-center mb-2 md:mb-3">
            <h3 className="text-sm md:text-base font-bold text-slate-900">
              ประวัติรายการในระบบ {transactions.length > 0 && `(${transactions.length})`}
            </h3>
            {transactions.length > 0 && onClearAll && (
              <button
                type="button"
                onClick={handleClearAllSlips}
                className="text-[11px] font-bold text-rose-500 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full transition active:scale-95 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                <span>ล้างทั้งหมด</span>
              </button>
            )}
          </div>

          {transactions.length === 0 ? (
            <div className="bg-white md:bg-slate-50/70 border border-slate-100 rounded-2xl p-6 md:p-12 text-center text-xs text-slate-400 shadow-sm md:shadow-none flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-3xl text-slate-300">receipt_long</span>
              <p>ยังไม่มีรายการ กดปุ่มเพื่อเริ่มเติมงบหรือบันทึกรายจ่าย</p>
            </div>
          ) : (
            <div className="space-y-2 md:max-h-[540px] md:overflow-y-auto md:pr-1">
              {transactions.map((item) => {
                const isInc = isIncomeItem(item);
                return (
                  <div
                    key={item.id}
                    className="bg-white md:bg-slate-50/50 border border-slate-100 md:border-slate-200/70 rounded-2xl p-3.5 flex items-center justify-between shadow-sm md:shadow-none group hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isInc ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xl">
                          {isInc
                            ? 'account_balance_wallet'
                            : item.category === 'tea'
                            ? 'local_cafe'
                            : item.category === 'travel'
                            ? 'directions_car'
                            : item.category === 'study'
                            ? 'school'
                            : 'receipt'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h5 className="text-xs font-bold text-slate-900 leading-snug truncate">
                            {item.title}
                          </h5>
                          {onToggleTransactionType && (
                            <button
                              type="button"
                              onClick={() => {
                                onToggleTransactionType(item.id);
                                showToast(
                                  isInc
                                    ? `เปลี่ยน "${item.title}" เป็นรายจ่าย (-)`
                                    : `เปลี่ยน "${item.title}" เป็นรายรับ (+)`
                                );
                              }}
                              title="คลิกเพื่อสลับเป็น รายรับ / รายจ่าย"
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border transition shrink-0 ${
                                isInc
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                              }`}
                            >
                              {isInc ? 'รายรับ ⇄' : 'รายจ่าย ⇄'}
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">{item.date || 'วันนี้'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span
                          className={`text-sm font-extrabold ${
                            isInc ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isInc ? '+' : '-'}฿
                          {Number(item.amount).toLocaleString('th-TH', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>

                      {/* ปุ่มลบรายการรายตัว */}
                      <button
                        type="button"
                        onClick={() => setItemToDelete(item)}
                        className="w-7 h-7 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition active:scale-90 ml-1"
                        title="ลบรายการนี้"
                      >
                        <span className="material-symbols-outlined text-[17px]">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal ยืนยันการลบรายการในหน้าหลัก */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-4 border border-slate-100 animate-scale-up">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto text-2xl">
              <span className="material-symbols-outlined text-2xl">delete</span>
            </div>

            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">ยืนยันการลบรายการ?</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                ต้องการลบ <span className="font-bold text-slate-800">"{itemToDelete.title}"</span> (฿
                {Number(itemToDelete.amount).toLocaleString('th-TH')}) หรือไม่?
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition shadow-md shadow-rose-500/25"
              >
                ลบรายการ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ป๊อปอัปสำหรับตั้งค่า ล็อกเงินออม */}
      {isEditingSavings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-4">
            <h4 className="text-sm font-bold text-slate-900">ระบุเงินที่ต้องการล็อกออม</h4>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-400 font-bold">฿</span>
              <input
                type="number"
                value={tempSavings}
                onChange={(e) => setTempSavings(e.target.value)}
                autoFocus
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditingSavings(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveSavings}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition shadow-md shadow-indigo-500/25"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
