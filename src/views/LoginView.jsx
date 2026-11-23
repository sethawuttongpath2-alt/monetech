import React, { useState } from 'react';
import {
  loginWithDatabase,
  isSupabaseConfigured,
  saveSupabaseConfig,
  clearSupabaseConfig,
} from '../lib/supabase';

export default function LoginView({ onNavigate, onLoginSuccess, isDarkMode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Modal สำหรับตั้งค่า Supabase URL / Key จากหน้าแอปได้ทันที (หรือใส่ใน .env ก็ได้)
  const [showDbModal, setShowDbModal] = useState(false);
  const [sbUrl, setSbUrl] = useState(
    () => import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('monetech_supabase_url') || ''
  );
  const [sbKey, setSbKey] = useState(
    () => import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('monetech_supabase_anon_key') || ''
  );
  const [dbConnected, setDbConnected] = useState(() => isSupabaseConfigured());

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password) {
      setErrorMsg('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    setIsLoading(true);
    try {
      const result = await loginWithDatabase({ email, password });
      if (onLoginSuccess) {
        await onLoginSuccess(result.user);
      } else {
        onNavigate('home');
      }
    } catch (err) {
      setErrorMsg(err.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลอีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricLogin = () => {
    const savedUser = localStorage.getItem('monetech_active_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (onLoginSuccess) {
          onLoginSuccess(parsed);
          return;
        }
      } catch {
        // ignore
      }
    }
    setErrorMsg('กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่านในครั้งแรกก่อนใช้สแกนนิ้ว');
  };

  const handleSaveDbConfig = (e) => {
    e.preventDefault();
    if (!sbUrl.trim() || !sbKey.trim()) {
      clearSupabaseConfig();
      setDbConnected(isSupabaseConfigured());
      setShowDbModal(false);
      return;
    }
    saveSupabaseConfig(sbUrl, sbKey);
    setDbConnected(isSupabaseConfigured());
    setShowDbModal(false);
  };

  return (
    <section className="flex-1 flex flex-col justify-between px-6 pt-6 pb-8 relative">
      {/* แถบสถานะ Database มุมขวาบน */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowDbModal(true)}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border transition ${
            dbConnected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              dbConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          ></span>
          <span>{dbConnected ? 'Supabase Connected' : 'ตั้งค่า Supabase DB'}</span>
        </button>
      </div>

      {/* Brand & Logo Header */}
      <div className="flex flex-col items-center text-center space-y-3 pt-1">
        <div className="w-20 h-20 rounded-3xl bg-emerald-500 shadow-xl shadow-emerald-500/30 flex items-center justify-center text-white">
          <span className="material-symbols-outlined text-4xl font-bold">query_stats</span>
        </div>
        <div>
          <h1 className={`text-3xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Monetech
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            จัดการเรื่องเงินในชีวิตประจำวัน ให้เป็นเรื่องง่าย
          </p>
        </div>
      </div>

      {/* Form Section */}
      <form onSubmit={handleLogin} className="space-y-4 my-auto py-2">
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-3.5 py-2.5 rounded-2xl flex items-center gap-2">
            <span className="material-symbols-outlined text-base shrink-0">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ช่องกรอกอีเมล */}
        <div>
          <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
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
              className={`w-full pl-12 pr-4 py-3.5 border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-slate-50/70 border-slate-200 text-slate-900'
              }`}
              required
            />
          </div>
        </div>

        {/* ช่องกรอกรหัสผ่าน */}
        <div>
          <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
            รหัสผ่าน
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
              className={`w-full pl-12 pr-11 py-3.5 border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-slate-50/70 border-slate-200 text-slate-900'
              }`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className=" absolute right-3.5 text-slate-400 hover:text-slate-600 flex items-center"
              tabIndex={-1}
            >
              <span className="material-symbols-outlined text-lg">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          {/* ลิงก์ลืมรหัสผ่าน */}
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={() => onNavigate('forgot-password')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-500 transition"
            >
              ลืมรหัสผ่าน?
            </button>
          </div>
        </div>

        {/* ปุ่มเข้าสู่ระบบ */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#0d1322] disabled:opacity-60 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-slate-800 active:scale-[0.99] transition text-sm tracking-wide mt-2 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>กำลังเข้าสู่ระบบ...</span>
            </>
          ) : (
            <span>เข้าสู่ระบบ (LOG IN)</span>
          )}
        </button>
      </form>

      {/* Footer สแกนนิ้ว & สมัครสมาชิก */}
      <div className="flex flex-col items-center space-y-3 pt-2">
        <button
          type="button"
          onClick={handleBiometricLogin}
          className={`w-14 h-14 rounded-full border flex items-center justify-center transition shadow-sm hover:scale-105 active:scale-95 ${
            isDarkMode
              ? 'bg-slate-800 border-slate-700 text-indigo-400 hover:bg-slate-700'
              : 'bg-indigo-50/60 border-indigo-100 text-indigo-600 hover:bg-indigo-100'
          }`}
          title="สแกนนิ้วเข้าใช้งาน"
        >
          <span className="material-symbols-outlined text-2xl">fingerprint</span>
        </button>
        <span className="text-xs text-slate-400 font-medium">สแกนนิ้วเข้าใช้งานด่วน</span>

        <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          ยังไม่มีบัญชี?{' '}
          <button
            type="button"
            onClick={() => onNavigate('register')}
            className="font-bold text-emerald-500 hover:text-emerald-600 underline ml-1"
          >
            ลงทะเบียนใหม่
          </button>
        </p>
      </div>

      {/* Modal ตั้งค่าการเชื่อมต่อ Supabase */}
      {showDbModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setShowDbModal(false)}
        >
          <div
            className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-3.5 border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-emerald-500 text-lg">database</span>
                <span>ตั้งค่าเชื่อมต่อ Supabase Database</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowDbModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              นำค่าจากเมนู <b>Project Settings → API</b> บนเว็บ Supabase มาใส่ด้านล่าง (หรือใส่ในไฟล์ <code>.env</code> ก็ได้)
            </p>

            <form onSubmit={handleSaveDbConfig} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Project URL (VITE_SUPABASE_URL)
                </label>
                <input
                  type="url"
                  placeholder="https://xxxxxxxxxxxx.supabase.co"
                  value={sbUrl}
                  onChange={(e) => setSbUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Anon Public Key (VITE_SUPABASE_ANON_KEY)
                </label>
                <input
                  type="text"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  value={sbKey}
                  onChange={(e) => setSbKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDbModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 shadow-md shadow-emerald-500/20"
                >
                  บันทึกการเชื่อมต่อ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}