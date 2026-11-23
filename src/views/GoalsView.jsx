import React, { useState, useEffect } from 'react';
import {
  fetchUserGoals,
  upsertUserGoal,
  deleteUserGoal,
  updateUserProfileInDatabase,
} from '../lib/supabase';

export default function GoalsView({ onNavigate, currentUser, onUpdateUser }) {
  // ดึงเงินออมที่ล็อกไว้จากข้อมูลผู้ใช้ใน Database หรือ localStorage
  const [lockedSavings, setLockedSavings] = useState(() => {
    if (currentUser?.lockedSavings !== undefined) {
      return Number(currentUser.lockedSavings) || 0;
    }
    const saved = localStorage.getItem('monetech_locked_savings');
    return saved !== null ? parseFloat(saved) : 1500;
  });

  useEffect(() => {
    if (currentUser?.lockedSavings !== undefined) {
      setLockedSavings(Number(currentUser.lockedSavings) || 0);
    }
  }, [currentUser?.lockedSavings]);

  // รายการเป้าหมายกระปุกออมเริ่มต้น (หน้าว่างให้ผู้ใช้สร้างเอง)
  const initialGoals = [];

  const storageKey = currentUser?.id ? `monetech_goals_${currentUser.id}` : 'monetech_goals';

  const [goals, setGoals] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed)
          ? parsed.filter((g) => g.id !== 'goal-1' && g.id !== 'goal-2' && !String(g.id).endsWith('_goal-1') && !String(g.id).endsWith('_goal-2'))
          : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  // โหลดข้อมูลเป้าหมายจาก Supabase Database เมื่อเข้าหน้านี้
  useEffect(() => {
    let active = true;
    if (currentUser?.id) {
      fetchUserGoals(currentUser.id, initialGoals).then((dbGoals) => {
        if (active && Array.isArray(dbGoals)) {
          setGoals(
            dbGoals.filter(
              (g) => g.id !== 'goal-1' && g.id !== 'goal-2' && !String(g.id).endsWith('_goal-1') && !String(g.id).endsWith('_goal-2')
            )
          );
        }
      });
    }
    return () => {
      active = false;
    };
  }, [currentUser?.id]);

  // Modal สำหรับสร้างเป้าหมายใหม่
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newCurrent, setNewCurrent] = useState('');
  const [newIcon, setNewIcon] = useState('🎯');

  // Modal สำหรับเติมเงินเข้ากระปุก
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');

  // Modal สำหรับแก้ไขเงินล็อกอัตโนมัติ
  const [isEditingLocked, setIsEditingLocked] = useState(false);
  const [tempLocked, setTempLocked] = useState('');

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(goals));
  }, [goals, storageKey]);

  const handleSaveLocked = async (e) => {
    e.preventDefault();
    const val = parseFloat(tempLocked);
    if (!isNaN(val) && val >= 0) {
      setLockedSavings(val);
      localStorage.setItem('monetech_locked_savings', val.toString());
      if (currentUser?.id) {
        try {
          const updated = await updateUserProfileInDatabase(currentUser.id, { lockedSavings: val });
          if (onUpdateUser) onUpdateUser(updated);
        } catch (err) {
          console.error('Failed to update lockedSavings in DB:', err);
        }
      }
    }
    setIsEditingLocked(false);
  };

  const handleAddGoal = async (e) => {
    e.preventDefault();
    const target = parseFloat(newTarget);
    const current = parseFloat(newCurrent) || 0;
    if (!newTitle.trim() || isNaN(target) || target <= 0) {
      alert('กรุณากรอกชื่อและยอดเป้าหมายให้ถูกต้อง');
      return;
    }

    const remaining = Math.max(0, target - current);
    const newGoalObj = {
      id: `goal-${Date.now()}`,
      title: newTitle.trim(),
      icon: newIcon || '🎯',
      current: current,
      target: target,
      color: ['rose', 'amber', 'emerald', 'indigo', 'sky'][goals.length % 5],
      note: remaining === 0 ? '🎉 บรรลุเป้าหมายแล้ว!' : `เหลืออีกเพียง ฿${remaining.toLocaleString('th-TH')} จะครบเป้าหมาย!`,
    };

    setGoals([...goals, newGoalObj]);
    if (currentUser?.id) {
      await upsertUserGoal(currentUser.id, newGoalObj);
    }
    setNewTitle('');
    setNewTarget('');
    setNewCurrent('');
    setNewIcon('🎯');
    setShowAddModal(false);
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0 || !selectedGoal) return;

    let updatedGoalObj = null;
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id === selectedGoal.id) {
          const updatedCurrent = g.current + amount;
          const remaining = Math.max(0, g.target - updatedCurrent);
          updatedGoalObj = {
            ...g,
            current: updatedCurrent,
            note: remaining === 0 ? '🎉 บรรลุเป้าหมายแล้ว!' : `เหลืออีกเพียง ฿${remaining.toLocaleString('th-TH')} จะครบเป้าหมาย!`,
          };
          return updatedGoalObj;
        }
        return g;
      })
    );
    if (currentUser?.id && updatedGoalObj) {
      await upsertUserGoal(currentUser.id, updatedGoalObj);
    }
    setSelectedGoal(null);
    setDepositAmount('');
  };

  const handleDeleteGoal = async (id) => {
    if (window.confirm('คุณต้องการลบเป้าหมายนี้หรือไม่?')) {
      setGoals((prev) => prev.filter((g) => g.id !== id));
      if (currentUser?.id) {
        await deleteUserGoal(currentUser.id, id);
      }
      setSelectedGoal(null);
    }
  };

  return (
    <section className="flex-1 flex flex-col px-5 md:px-0 pt-3 md:pt-0 pb-28 md:pb-6 space-y-4 font-['Prompt',sans-serif]">
      {/* 1. Header: ชื่อหน้า + ปุ่มเพิ่มเป้าหมาย */}
      <div className="flex justify-between items-center pt-1">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">เป้าหมายเงินออม</h1>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="bg-slate-900 hover:bg-slate-800 active:scale-95 text-white px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          <span>เป้าหมาย</span>
        </button>
      </div>

      {/* 2. การ์ดสีน้ำเงิน/ม่วง: ล็อกเงินออมอัตโนมัติ */}
      <div className="bg-[#4f46e5] text-white rounded-[26px] p-5 md:p-6 shadow-lg shadow-indigo-500/25 relative overflow-hidden">
        {/* แบดจ์ล็อกอัตโนมัติ */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white shadow-xs">
            <span className="material-symbols-outlined text-xs text-amber-300 icon-fill">lock</span>
            <span>ล็อกเงินออมอัตโนมัติ</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setTempLocked(lockedSavings.toString());
              setIsEditingLocked(true);
            }}
            className="text-[11px] text-indigo-200 hover:text-white underline underline-offset-2 transition"
          >
            แก้ไข
          </button>
        </div>

        {/* ข้อความอธิบาย + ยอดเงิน */}
        <p className="text-xs text-indigo-100/90 font-medium mt-3.5">เงินที่ถูกล็อกแยกไว้ตั้งแต่เงินเข้าบัญชี</p>
        <div className="flex items-baseline gap-1.5 my-1">
          <span className="text-2xl font-bold">฿</span>
          <span className="text-3xl sm:text-4xl font-black tracking-tight">
            {lockedSavings.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* เครื่องหมายถูก + การันตี */}
        <div className="flex items-center gap-1.5 text-[11px] text-indigo-100 font-medium mt-3">
          <span className="material-symbols-outlined text-sm text-indigo-200">check</span>
          <span>หักเข้าเป้าหมายล่วงหน้าแล้ว การันตีมีเงินเก็บชัวร์</span>
        </div>
      </div>


      {/* 4. หัวข้อ: กระปุกเป้าหมายระยะสั้น */}
      <div className="pt-1">
        <h3 className="text-base font-bold text-slate-900">กระปุกเป้าหมายระยะสั้น</h3>
      </div>

      {/* 5. รายการกระปุกเป้าหมาย */}
      {goals.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-8 text-center space-y-3 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto text-2xl">
            <span className="material-symbols-outlined text-3xl">savings</span>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-800">ยังไม่มีกระปุกเป้าหมาย</h4>
            <p className="text-xs text-slate-400">กดปุ่ม "+ เป้าหมาย" ด้านบนเพื่อสร้างกระปุกออมเงินของคุณ</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
          {goals.map((item) => {
            const percent = Math.min(100, Math.round((item.current / item.target) * 100)) || 0;
            const isRose = item.color === 'rose';
            const isAmber = item.color === 'amber';
            const isEmerald = item.color === 'emerald';

            const textColorClass = isRose
              ? 'text-rose-500'
              : isAmber
              ? 'text-amber-500'
              : isEmerald
              ? 'text-emerald-500'
              : 'text-indigo-600';

            const barColorClass = isRose
              ? 'bg-rose-500'
              : isAmber
              ? 'bg-amber-500'
              : isEmerald
              ? 'bg-emerald-500'
              : 'bg-indigo-600';

            const bgCircleClass = isRose
              ? 'bg-pink-50'
              : isAmber
              ? 'bg-amber-50'
              : isEmerald
              ? 'bg-emerald-50'
              : 'bg-indigo-50';

            return (
              <div
                key={item.id}
                onClick={() => setSelectedGoal(item)}
                className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2.5 cursor-pointer hover:border-slate-300 hover:shadow transition active:scale-[0.99]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full ${bgCircleClass} flex items-center justify-center shrink-0 text-xl`}>
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                      <p className="text-xs text-slate-500 font-medium">
                        ฿{item.current.toLocaleString('th-TH')} / ฿{item.target.toLocaleString('th-TH')}
                      </p>
                    </div>
                  </div>
                  <span className={`text-base font-black ${textColorClass}`}>{percent}%</span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`${barColorClass} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${percent}%` }}
                  ></div>
                </div>

                {/* ข้อความสถานะด้านล่าง */}
                {item.note && (
                  <div className="text-right text-[11px] text-slate-500 font-medium">
                    {item.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: เติมเงินเข้ากระปุก หรือ ลบเป้าหมาย */}
      {selectedGoal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedGoal(null)}
        >
          <div
            className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{selectedGoal.icon}</span>
                <h3 className="text-base font-bold text-slate-900">{selectedGoal.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGoal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3.5 mb-4 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>ยอดเงินปัจจุบัน:</span>
                <span className="font-bold text-slate-900">฿{selectedGoal.current.toLocaleString('th-TH')}</span>
              </div>
              <div className="flex justify-between">
                <span>ยอดเป้าหมาย:</span>
                <span className="font-bold text-slate-900">฿{selectedGoal.target.toLocaleString('th-TH')}</span>
              </div>
              <div className="flex justify-between text-indigo-600 font-semibold pt-1 border-t border-slate-200/60">
                <span>ขาดอีก:</span>
                <span>฿{Math.max(0, selectedGoal.target - selectedGoal.current).toLocaleString('th-TH')}</span>
              </div>
            </div>

            <form onSubmit={handleDeposit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">เติมเงินออมเพิ่ม (บาท)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="เช่น 500"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteGoal(selectedGoal.id)}
                  className="px-3 py-2.5 text-xs text-rose-600 hover:bg-rose-50 font-semibold rounded-xl transition"
                >
                  ลบเป้าหมาย
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl transition shadow-md shadow-indigo-600/20"
                >
                  บันทึกเงินออม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: เพิ่มเป้าหมายใหม่ */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">เพิ่มกระปุกเป้าหมายใหม่</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleAddGoal} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">เลือกไอคอน</label>
                <div className="flex gap-2 text-xl">
                  {['🎤', '🏕️', '💻', '✈️', '🎮', '🚗', '🏠'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewIcon(emoji)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                        newIcon === emoji ? 'bg-indigo-100 border-2 border-indigo-500 scale-105' : 'bg-slate-100 hover:bg-slate-200'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">ชื่อเป้าหมาย</label>
                <input
                  type="text"
                  placeholder="เช่น ซื้อหูฟังใหม่, ค่าตั๋วเครื่องบิน"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">ยอดเงินเป้าหมาย (บาท)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="เช่น 3500"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">เงินเริ่มต้นที่มีแล้ว (บาท) ถ้ามี</label>
                <input
                  type="number"
                  step="any"
                  placeholder="เช่น 0"
                  value={newCurrent}
                  onChange={(e) => setNewCurrent(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition shadow-md"
                >
                  สร้างเป้าหมาย
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: แก้ไขเงินล็อกอัตโนมัติ */}
      {isEditingLocked && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setIsEditingLocked(false)}
        >
          <div
            className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-900 mb-3">แก้ไขยอดเงินล็อกอัตโนมัติ</h3>
            <form onSubmit={handleSaveLocked} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  ยอดเงินที่ต้องการล็อกเก็บไว้ (บาท)
                </label>
                <input
                  type="number"
                  step="any"
                  value={tempLocked}
                  onChange={(e) => setTempLocked(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingLocked(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-xs hover:bg-slate-200"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 shadow-md shadow-indigo-600/20"
                >
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}