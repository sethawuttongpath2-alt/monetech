import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchAllUsersForAdmin,
  updateUserRoleByAdmin,
  deleteUserByAdmin,
  fetchAllIssueReportsForAdmin,
  updateIssueReportStatusByAdmin,
  deleteIssueReportByAdmin,
  getAdminEmails,
  addCustomAdminEmail,
  removeCustomAdminEmail,
  DEFAULT_ADMIN_EMAILS,
} from '../lib/supabase';

export default function AdminDashboardView({
  onNavigate,
  currentUser,
  onlineUserIds = [],
  onLogout,
}) {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'reports' | 'admins'
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [adminEmails, setAdminEmails] = useState(() => getAdminEmails());
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'online' | 'offline' | 'admin' | 'user'
  const [selectedUserForTx, setSelectedUserForTx] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const [allUsers, allReports] = await Promise.all([
        fetchAllUsersForAdmin(),
        fetchAllIssueReportsForAdmin(),
      ]);
      setUsers(allUsers);
      setReports(allReports);
      setAdminEmails(getAdminEmails());
    } catch (err) {
      console.error('Admin load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
    // รีเฟรชสถานะออนไลน์และข้อมูลทุก 15 วินาทีอัตโนมัติ
    const timer = setInterval(() => {
      fetchAllUsersForAdmin().then(setUsers).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // รวมสถานะออนไลน์จากทั้ง Realtime Presence และ Database Heartbeat
  const enrichedUsers = useMemo(() => {
    return users.map((u) => {
      const isLivePresent =
        onlineUserIds.includes(String(u.id)) ||
        (currentUser?.id && String(u.id) === String(currentUser.id));
      return {
        ...u,
        isCurrentlyOnline: Boolean(isLivePresent || u.isOnline),
      };
    });
  }, [users, onlineUserIds, currentUser?.id]);

  // กรองรายชื่อผู้ใช้ตามคำค้นหาและตัวกรอง
  const filteredUsers = useMemo(() => {
    return enrichedUsers.filter((u) => {
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q);

      if (!matchSearch) return false;
      if (statusFilter === 'online') return u.isCurrentlyOnline;
      if (statusFilter === 'offline') return !u.isCurrentlyOnline;
      if (statusFilter === 'admin') return u.role === 'admin';
      if (statusFilter === 'user') return u.role !== 'admin';
      return true;
    });
  }, [enrichedUsers, searchQuery, statusFilter]);

  const totalOnlineCount = useMemo(
    () => enrichedUsers.filter((u) => u.isCurrentlyOnline).length,
    [enrichedUsers]
  );
  const totalOfflineCount = enrichedUsers.length - totalOnlineCount;
  const totalSystemMoney = useMemo(
    () => enrichedUsers.reduce((sum, u) => sum + (Number(u.totalSlipAmount) || 0), 0),
    [enrichedUsers]
  );
  const pendingReportsCount = useMemo(
    () => reports.filter((r) => r.status !== 'resolved').length,
    [reports]
  );

  // แปลงเวลาใช้งานล่าสุดให้อ่านง่าย
  const formatLastSeen = (isoStr, isOnline) => {
    if (isOnline) return 'กำลังใช้งานขณะนี้';
    if (!isoStr) return 'ไม่มีข้อมูลเวลา';
    const diffSec = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (diffSec < 60) return 'เพิ่งออฟไลน์เมื่อสักครู่';
    if (diffSec < 3600) return `ออฟไลน์เมื่อ ${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
    if (diffSec < 86400) return `ออฟไลน์เมื่อ ${Math.floor(diffSec / 3600)} ชั่วโมงที่แล้ว`;
    return new Date(isoStr).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleToggleRole = async (targetUser) => {
    const nextRole = targetUser.role === 'admin' ? 'user' : 'admin';
    if (
      !window.confirm(
        `ต้องการเปลี่ยนสิทธิ์ของ "${targetUser.fullName}" (${targetUser.email}) เป็น "${nextRole.toUpperCase()}" หรือไม่?`
      )
    ) {
      return;
    }

    try {
      await updateUserRoleByAdmin(targetUser.id, nextRole, targetUser.email);
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: nextRole } : u))
      );
      setAdminEmails(getAdminEmails());
      showToast(`✅ เปลี่ยนสิทธิ์ของ ${targetUser.fullName} เป็น ${nextRole.toUpperCase()} แล้ว`);
    } catch (err) {
      alert('ไม่สามารถเปลี่ยนสิทธิ์ได้: ' + err.message);
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (String(targetUser.id) === String(currentUser?.id)) {
      alert('ไม่สามารถลบบัญชี Admin ที่กำลังล็อกอินอยู่ได้');
      return;
    }
    if (
      !window.confirm(
        `ยืนยันการลบข้อมูลผู้ใช้ "${targetUser.fullName}" (${targetUser.email}) และประวัติธุรกรรมทั้งหมดหรือไม่?`
      )
    ) {
      return;
    }

    try {
      await deleteUserByAdmin(targetUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
      showToast(`🗑️ ลบข้อมูลของ ${targetUser.fullName} เรียบร้อยแล้ว`);
    } catch (err) {
      alert('ลบข้อมูลไม่สำเร็จ: ' + err.message);
    }
  };

  const handleToggleReportStatus = async (report) => {
    const nextStatus = report.status === 'resolved' ? 'pending' : 'resolved';
    try {
      await updateIssueReportStatusByAdmin(report.id, nextStatus);
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status: nextStatus } : r))
      );
      showToast(
        nextStatus === 'resolved'
          ? '✅ ทำเครื่องหมายว่าแก้ไขปัญหาแล้ว'
          : '🔄 เปลี่ยนสถานะเป็นรอดำเนินการ'
      );
    } catch (err) {
      alert('อัปเดตสถานะไม่สำเร็จ: ' + err.message);
    }
  };

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm('ต้องการลบรายการแจ้งปัญหานี้หรือไม่?')) return;
    try {
      await deleteIssueReportByAdmin(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      showToast('🗑️ ลบรายการแจ้งปัญหาแล้ว');
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message);
    }
  };

  const handleAddAdminEmail = async (e) => {
    e.preventDefault();
    const clean = newAdminEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      alert('กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }
    const updatedList = addCustomAdminEmail(clean);
    setAdminEmails(updatedList);
    setNewAdminEmail('');

    // ถ้ามีผู้ใช้อีเมลนี้อยู่ในระบบแล้ว อัปเดต role ใน DB ให้เป็น admin ทันที
    const matchUser = users.find((u) => (u.email || '').toLowerCase() === clean);
    if (matchUser) {
      await updateUserRoleByAdmin(matchUser.id, 'admin', clean);
      setUsers((prev) =>
        prev.map((u) => (u.id === matchUser.id ? { ...u, role: 'admin' } : u))
      );
    }
    showToast(`👑 เพิ่ม ${clean} เป็น Admin เรียบร้อยแล้ว`);
  };

  const handleRemoveAdminEmail = async (emailToRemove) => {
    if (DEFAULT_ADMIN_EMAILS.includes(emailToRemove.toLowerCase())) {
      alert('ไม่สามารถลบอีเมล Admin หลักของระบบได้');
      return;
    }
    const updatedList = removeCustomAdminEmail(emailToRemove);
    setAdminEmails(updatedList);
    showToast(`ลบ ${emailToRemove} ออกจากรายการ Admin อัตโนมัติแล้ว`);
  };

  return (
    <section className="flex-1 flex flex-col px-4 md:px-0 pt-2 md:pt-0 pb-16 md:pb-6 space-y-3.5 bg-slate-50/60 md:bg-transparent">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 max-w-xs w-full px-4">
          <div className="bg-slate-900/95 text-white text-xs font-semibold py-2.5 px-4 rounded-2xl shadow-xl text-center">
            {toastMsg}
          </div>
        </div>
      )}

      {/* Top Admin Header Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-4 md:p-6 shadow-lg space-y-3 md:space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 md:gap-4">
            <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <span className="material-symbols-outlined text-xl md:text-3xl">shield_person</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 md:gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2 md:px-3 py-0.5 rounded-full">
                  👑 ADMIN ROLE
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  ออนไลน์
                </span>
              </div>
              <h1 className="text-sm md:text-xl font-bold mt-0.5 truncate max-w-[180px] md:max-w-md">
                {currentUser?.fullName || 'ผู้ดูแลระบบ'}
              </h1>
              <p className="text-[10px] md:text-xs text-slate-300 truncate max-w-[190px] md:max-w-md">
                {currentUser?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2.5">
            <button
              type="button"
              onClick={loadAdminData}
              className="w-8 h-8 md:w-11 md:h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
              title="รีเฟรชข้อมูล"
            >
              <span className={`material-symbols-outlined text-base md:text-xl ${isLoading ? 'animate-spin' : ''}`}>
                refresh
              </span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="w-8 h-8 md:w-11 md:h-11 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center transition"
              title="ออกจากระบบ"
            >
              <span className="material-symbols-outlined text-base md:text-xl">logout</span>
            </button>
          </div>
        </div>

        {/* ปุ่มสลับไปหน้าใช้งานแอปปกติ */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="w-full py-2 md:py-3 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs md:text-sm font-bold text-emerald-300 flex items-center justify-center gap-1.5 transition active:scale-[0.99]"
        >
          <span className="material-symbols-outlined text-base md:text-xl">swap_horiz</span>
          <span>สลับไปหน้าใช้งานกระเป๋าเงินปกติ (User View)</span>
        </button>
      </div>

      {/* Summary Stat Cards (3 ช่อง) */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3 md:p-5 shadow-xs">
          <p className="text-[10px] md:text-xs text-slate-500 font-semibold">ผู้ใช้ทั้งหมด</p>
          <p className="text-xl md:text-3xl font-black text-slate-900 mt-0.5 md:mt-1">{enrichedUsers.length}</p>
          <div className="flex items-center gap-1.5 md:gap-3 text-[10px] md:text-xs font-bold mt-1 md:mt-2">
            <span className="text-emerald-600">🟢 {totalOnlineCount}</span>
            <span className="text-slate-400">⚪ {totalOfflineCount}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-3 md:p-5 shadow-xs">
          <p className="text-[10px] md:text-xs text-slate-500 font-semibold">ยอดเงินรวมในระบบ</p>
          <p className="text-sm md:text-2xl font-black text-emerald-600 mt-1 truncate">
            ฿{totalSystemMoney.toLocaleString('th-TH')}
          </p>
          <p className="text-[10px] md:text-xs text-slate-400 font-medium mt-1 md:mt-2">จากสลิปทุกบัญชี</p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-3 md:p-5 shadow-xs">
          <p className="text-[10px] md:text-xs text-slate-500 font-semibold">แจ้งปัญหาเข้า</p>
          <p className="text-xl md:text-3xl font-black text-rose-500 mt-0.5 md:mt-1">{reports.length}</p>
          <p className="text-[10px] md:text-xs text-amber-600 font-bold mt-1 md:mt-2">
            รอตรวจ {pendingReportsCount} รายการ
          </p>
        </div>
      </div>

      {/* Navigation Tabs สำหรับ Admin */}
      <div className="bg-slate-200/80 p-1 rounded-2xl grid grid-cols-3 gap-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`py-2 rounded-xl transition flex items-center justify-center gap-1 ${
            activeTab === 'users'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-sm">group</span>
          <span>ผู้ใช้ ({enrichedUsers.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`py-2 rounded-xl transition flex items-center justify-center gap-1 ${
            activeTab === 'reports'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-sm">campaign</span>
          <span>ปัญหา ({reports.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('admins')}
          className={`py-2 rounded-xl transition flex items-center justify-center gap-1 ${
            activeTab === 'admins'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
          <span>สิทธิ์ Admin</span>
        </button>
      </div>

      {/* ==================== TAB 1: รายชื่อผู้ใช้ & สถานะออนไลน์ ==================== */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          {/* ช่องค้นหา */}
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-3.5 text-slate-400 text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="ค้นหาชื่อ หรือ อีเมลผู้ใช้..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* ปุ่มกรองสถานะ ออนไลน์ / ออฟไลน์ / Role */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'all', label: `ทั้งหมด (${enrichedUsers.length})` },
              { id: 'online', label: `🟢 ออนไลน์ (${totalOnlineCount})` },
              { id: 'offline', label: `⚪ ออฟไลน์ (${totalOfflineCount})` },
              { id: 'admin', label: '👑 Admin' },
              { id: 'user', label: '👤 User' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 transition ${
                  statusFilter === f.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* รายการการ์ดผู้ใช้ */}
          {isLoading ? (
            <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400">
              กำลังโหลดข้อมูลผู้ใช้จาก Supabase...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400">
              ไม่พบข้อมูลผู้ใช้ตามเงื่อนไขที่เลือก
            </div>
          ) : (
            <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs space-y-2.5"
                >
                  {/* แถวบน: รูป + ชื่อ/อีเมล + Badge สถานะ Online/Offline & Role */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-500">
                          {u.avatarUrl ? (
                            <img
                              src={u.avatarUrl}
                              alt={u.fullName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-2xl">person</span>
                          )}
                        </div>
                        {/* จุดสีบอกสถานะออนไลน์/ออฟไลน์ที่มุมรูป */}
                        <span
                          className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
                            u.isCurrentlyOnline ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        ></span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {u.fullName}
                          </h4>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                              u.role === 'admin'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {u.role === 'admin' ? '👑 ADMIN' : '👤 USER'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {formatLastSeen(u.lastSeen, u.isCurrentlyOnline)}
                        </p>
                      </div>
                    </div>

                    {/* ป้ายสถานะ ออนไลน์ / ออฟไลน์ */}
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        u.isCurrentlyOnline
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          u.isCurrentlyOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                        }`}
                      ></span>
                      {u.isCurrentlyOnline ? 'ออนไลน์' : 'ออฟไลน์'}
                    </span>
                  </div>

                  {/* แถวกลาง: สรุปข้อมูลการเงินของผู้ใช้คนนี้ */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-center">
                    <div>
                      <p className="text-[10px] text-slate-400">ยอดสลิปสะสม</p>
                      <p className="text-xs font-extrabold text-emerald-600">
                        ฿{Number(u.totalSlipAmount || 0).toLocaleString('th-TH')}
                      </p>
                    </div>
                    <div className="border-x border-slate-200/70">
                      <p className="text-[10px] text-slate-400">ล็อกเงินออม</p>
                      <p className="text-xs font-extrabold text-indigo-600">
                        ฿{Number(u.lockedSavings || 0).toLocaleString('th-TH')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">จำนวนสลิป</p>
                      <p className="text-xs font-extrabold text-slate-800">
                        {u.transactionCount || 0} รายการ
                      </p>
                    </div>
                  </div>

                  {/* แถวล่าง: ปุ่มจัดการของผู้ดูแลระบบ */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setSelectedUserForTx(u)}
                      className="flex-1 py-1.5 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">receipt_long</span>
                      <span>ดูประวัติ ({u.transactionCount || 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleRole(u)}
                      className="py-1.5 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold transition"
                    >
                      {u.role === 'admin' ? 'ปรับเป็น User' : 'ตั้งเป็น Admin'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u)}
                      className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition"
                      title="ลบผู้ใช้"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: รายการแจ้งปัญหา (Issue Reports) ==================== */}
      {activeTab === 'reports' && (
        <div className="space-y-2.5">
          {reports.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 border border-slate-100">
              ยังไม่มีรายการแจ้งปัญหาจากผู้ใช้งาน
            </div>
          ) : (
            reports.map((rep) => (
              <div
                key={rep.id}
                className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    ประเภท: {rep.issue_type}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      rep.status === 'resolved'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {rep.status === 'resolved' ? 'แก้ไขแล้ว ✓' : 'รอดำเนินการ'}
                  </span>
                </div>

                <p className="text-xs text-slate-800 font-medium leading-relaxed bg-slate-50 p-2.5 rounded-xl">
                  {rep.description}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>ผู้แจ้ง: {rep.user_name || rep.user_email || 'ผู้ใช้ในระบบ'}</span>
                  <span>
                    {rep.created_at
                      ? new Date(rep.created_at).toLocaleDateString('th-TH', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </span>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleToggleReportStatus(rep)}
                    className="flex-1 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold transition"
                  >
                    {rep.status === 'resolved' ? 'เปลี่ยนเป็นรอดำเนินการ' : '✓ ทำเครื่องหมายว่าแก้ไขแล้ว'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteReport(rep.id)}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-bold transition"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ==================== TAB 3: จัดการรายชื่ออีเมล Admin ==================== */}
      {activeTab === 'admins' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              กำหนดอีเมลที่ได้สิทธิ์ Admin อัตโนมัติ
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              ผู้ที่เข้าสู่ระบบหรือสมัครด้วยอีเมลในรายการนี้ จะได้รับ Role เป็น <b>Admin</b> ทันที
            </p>
          </div>

          <form onSubmit={handleAddAdminEmail} className="flex gap-2">
            <input
              type="email"
              placeholder="เพิ่มอีเมล Admin ใหม่ เช่น friend@email.com"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
            <button
              type="submit"
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shrink-0 transition"
            >
              + เพิ่ม
            </button>
          </form>

          <div className="space-y-2">
            {adminEmails.map((email) => {
              const isDefault = DEFAULT_ADMIN_EMAILS.includes(email.toLowerCase());
              return (
                <div
                  key={email}
                  className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-amber-500 text-base">
                      verified_user
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate">{email}</span>
                    {isDefault && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                        หลัก
                      </span>
                    )}
                  </div>
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAdminEmail(email)}
                      className="text-xs text-rose-500 hover:text-rose-700 font-bold"
                    >
                      ลบ
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal ดูประวัติธุรกรรมของผู้ใช้รายคน */}
      {selectedUserForTx && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedUserForTx(null)}
        >
          <div
            className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-3.5 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  ประวัติสลิปของ {selectedUserForTx.fullName}
                </h3>
                <p className="text-[11px] text-slate-400">{selectedUserForTx.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserForTx(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {!selectedUserForTx.transactions || selectedUserForTx.transactions.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-8">
                  ผู้ใช้คนนี้ยังไม่มีรายการสลิปในระบบ
                </p>
              ) : (
                selectedUserForTx.transactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-800">{t.title}</p>
                      <p className="text-[10px] text-slate-400">{t.date || 'วันนี้'}</p>
                    </div>
                    <span className="text-xs font-extrabold text-emerald-600">
                      ฿{Number(t.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
