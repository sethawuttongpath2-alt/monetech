import React, { useState } from 'react';
import { registerWithDatabase, isSupabaseConfigured } from '../lib/supabase';

export default function RegisterView({ onNavigate, onLoginSuccess, isDarkMode }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const dbConnected = isSupabaseConfigured();

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!fullName.trim()) {
      setErrorMsg('กรุณากรอกชื่อ-นามสกุล');
      return;
    }
    if (!email.trim()) {
      setErrorMsg('กรุณากรอกอีเมล');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setIsLoading(true);
    try {
      const result = await registerWithDatabase({
        fullName,
        email,
        password,
      });

      if (result.requiresEmailConfirmation) {
        setSuccessMsg(
          'สมัครสมาชิกและบันทึกข้อมูลเข้า Database สำเร็จ! กรุณายืนยันอีเมลในกล่องข้อความของคุณก่อนเข้าสู่ระบบ (หรือปิด Confirm Email ใน Supabase Auth)'
        );
      } else {
        setSuccessMsg('สมัครสมาชิกและบันทึกข้อมูลเข้า Database สำเร็จ!');
        setTimeout(() => {
          if (onLoginSuccess) {
            onLoginSuccess(result.user);
          } else {
            onNavigate('home');
          }
        }, 700);
      }
    } catch (err) {
      setErrorMsg(err.message || 'ไม่สามารถสร้างบัญชีได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="flex-1 flex flex-col px-6 pt-5 pb-8 justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center relative mb-4">
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 transition flex items-center justify-center text-slate-700"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <h2 className={`text-lg font-bold text-center flex-1 pr-10 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            สร้างบัญชีใหม่
          </h2>
        </div>

        {/* Hero Badge */}
        <div className="flex flex-col items-center text-center space-y-2 pb-3">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500 shadow-lg shadow-emerald-500/25 flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-3xl font-bold">person_add</span>
          </div>
          <div>
            <h3 className={`text-xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              เริ่มต้นใช้งาน Monetech
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              ข้อมูลกระเป๋าเงินและประวัติของคุณจะถูกเก็บไว้ใน{' '}
              <span className="font-semibold text-emerald-600">
                {dbConnected ? 'Supabase Cloud Database' : 'Database'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form className="space-y-3.5 my-auto py-2" onSubmit={handleRegister}>
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-3.5 py-2.5 rounded-2xl flex items-center gap-2">
            <span className="material-symbols-outlined text-base shrink-0">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3.5 py-2.5 rounded-2xl flex items-center gap-2">
            <span className="material-symbols-outlined text-base shrink-0">check_circle</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* ชื่อ-นามสกุล */}
        <div>
          <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
            ชื่อ-นามสกุล
          </label>
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-4 text-emerald-500 text-xl pointer-events-none">
              badge
            </span>
            <input
              type="text"
              placeholder="เช่น สมชาย ใจดี"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-2xl text-sm bg-slate-50/70 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-xs"
              required
            />
          </div>
        </div>

        {/* อีเมล */}
        <div>
          <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
            อีเมล
          </label>
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-4 text-slate-400 text-xl pointer-events-none">
              mail
            </span>
            <input
              type="email"
              placeholder="name@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-2xl text-sm bg-slate-50/70 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-xs"
              required
            />
          </div>
        </div>

        {/* รหัสผ่าน */}
        <div>
          <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
            รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)
          </label>
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-4 text-amber-500 text-xl pointer-events-none">
              lock
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-11 py-3 border border-slate-200 rounded-2xl text-sm bg-slate-50/70 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-xs"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 text-slate-400 hover:text-slate-600 flex items-center"
              tabIndex={-1}
            >
              <span className="material-symbols-outlined text-lg">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        {/* ยืนยันรหัสผ่าน */}
        <div>
          <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
            ยืนยันรหัสผ่านอีกครั้ง
          </label>
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-4 text-indigo-500 text-xl pointer-events-none">
              verified_user
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-2xl text-sm bg-slate-50/70 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-xs"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-emerald-500/25 active:scale-[0.99] transition text-sm mt-3 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>กำลังบันทึกข้อมูลลง Database...</span>
            </>
          ) : (
            <span>ลงทะเบียนสร้างบัญชี (SIGN UP)</span>
          )}
        </button>
      </form>

      {/* Footer */}
      <div className="text-center pt-2">
        <p className="text-xs text-slate-600">
          มีบัญชีอยู่แล้ว?{' '}
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="font-bold text-emerald-600 hover:text-emerald-700 underline ml-1"
          >
            เข้าสู่ระบบที่นี่
          </button>
        </p>
      </div>
    </section>
  );
}