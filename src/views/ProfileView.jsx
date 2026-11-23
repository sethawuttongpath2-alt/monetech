import React, { useState, useRef, useEffect } from 'react';
import { updateUserProfileInDatabase } from '../lib/supabase';

export default function ProfileView({ onNavigate, currentUser, onUpdateUser, onLogout }) {
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileImg, setProfileImg] = useState(currentUser?.avatarUrl || null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.fullName || '');
      setProfileImg(currentUser.avatarUrl || null);
    }
  }, [currentUser]);

  // จัดการอัปโหลดรูปโปรไฟล์
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setProfileImg(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // จัดการบันทึกข้อมูลลง Database
  const handleSave = async (e) => {
    e.preventDefault();
    setStatusMsg({ type: '', text: '' });

    if (newPassword) {
      if (newPassword.length < 6) {
        setStatusMsg({ type: 'error', text: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
        return;
      }
      if (newPassword !== confirmPassword) {
        setStatusMsg({ type: 'error', text: 'รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน' });
        return;
      }
    }

    setIsSaving(true);
    try {
      const updated = await updateUserProfileInDatabase(currentUser?.id, {
        fullName: fullName.trim(),
        avatarUrl: profileImg,
        currentPassword: currentPassword ? currentPassword.trim() : undefined,
        newPassword: newPassword ? newPassword.trim() : undefined,
        email: currentUser?.email,
      });

      if (onUpdateUser) {
        onUpdateUser(updated);
      }

      setStatusMsg({
        type: 'success',
        text: newPassword
          ? '🎉 เปลี่ยนรหัสผ่านและอัปเดตโปรไฟล์เรียบร้อยแล้ว!'
          : 'บันทึกข้อมูลโปรไฟล์ลง Database เรียบร้อย!',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        onNavigate('home');
      }, 1000);
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'บันทึกข้อมูลไม่สำเร็จ' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoutClick = async () => {
    if (onLogout) {
      await onLogout();
    } else {
      onNavigate('login');
    }
  };

  return (
    <section className="flex-1 flex flex-col px-5 pt-3 pb-8 space-y-4 md:max-w-xl md:mx-auto md:w-full md:bg-white md:border md:border-slate-200/80 md:rounded-3xl md:p-7 md:shadow-xs">
      {/* Header */}
      <div className="flex items-center relative mb-1">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200 transition"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <h2 className="text-lg font-bold text-center flex-1 pr-10 text-slate-900 flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-xl">person</span> โปรไฟล์
        </h2>
      </div>

      <form onSubmit={handleSave} className="space-y-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
          <h3 className="text-base font-bold text-slate-900">จัดการโปรไฟล์ผู้ใช้</h3>
          {currentUser?.email && (
            <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-semibold">
              {currentUser.email}
            </span>
          )}
        </div>

        {statusMsg.text && (
          <div
            className={`px-3.5 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 border ${
              statusMsg.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-600'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {statusMsg.type === 'error' ? 'error' : 'check_circle'}
            </span>
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* ชื่อและนามสกุล */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">• ชื่อและนามสกุล</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
        </div>

        {/* เปลี่ยนรหัสผ่าน */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">• เปลี่ยนรหัสผ่าน (เว้นว่างได้หากไม่เปลี่ยน)</label>
          <input
            type="password"
            placeholder="รหัสผ่านปัจจุบัน (Current Password)"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            type="password"
            placeholder="รหัสผ่านใหม่ (New Password)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            type="password"
            placeholder="ยืนยันรหัสผ่านใหม่ (Confirm New Password)"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* อัปเดตรูปถ่าย และ การตั้งค่าภาษา/ธีม */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">• อัปเดตรูปถ่าย</label>
          <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            {/* กล่องรูปภาพและปุ่มเปลี่ยนรูป */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="w-14 h-14 rounded-full bg-slate-200 overflow-hidden border-2 border-white shadow flex items-center justify-center text-slate-400">
                {profileImg ? (
                  <img src={profileImg} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-3xl">account_circle</span>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] bg-slate-900 text-white px-2 py-0.5 rounded-full font-medium hover:bg-slate-800 transition"
              >
                Change Photo
              </button>
            </div>

            {/* การตั้งค่าภาษา */}
            <div className="flex-1 text-xs">
              <div className="flex justify-between items-center bg-white px-3 py-2.5 rounded-xl border border-slate-200">
                <span className="text-[11px] font-medium text-slate-600">ภาษา</span>
                <span className="text-[11px] font-bold text-emerald-600">ไทย / English</span>
              </div>
            </div>
          </div>
        </div>

        {/* ปุ่มบันทึก และ ปุ่มออกจากระบบ */}
        <div className="mt-auto space-y-2 pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 rounded-2xl shadow hover:bg-emerald-600 active:scale-[0.99] transition text-sm"
          >
            {isSaving ? 'กำลังบันทึกลง Database...' : 'บันทึกการเปลี่ยนแปลง'}
          </button>
          <button
            type="button"
            onClick={handleLogoutClick}
            className="w-full bg-slate-100 text-rose-600 font-bold py-3 rounded-2xl hover:bg-rose-50 active:scale-[0.99] transition text-sm"
          >
            ออกจากระบบ
          </button>
        </div>
      </form>
    </section>
  );
}