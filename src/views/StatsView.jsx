import React, { useState, useMemo, useEffect } from 'react';
import { updateUserProfileInDatabase } from '../lib/supabase';

export default function StatsView({
  onNavigate,
  transactions = [],
  onDeleteTransaction,
  onClearAllTransactions,
  onAddExpense,
  currentUser,
  onUpdateUser,
}) {
  const [period, setPeriod] = useState('month'); // 'week' | 'month'
  const [activeDay, setActiveDay] = useState(null);
  const [showTransactionList, setShowTransactionList] = useState(false);

  // ตรวจสอบและเคลียร์ mock data เก่าให้เป็น 0
  useEffect(() => {
    const saved = localStorage.getItem('monetech_transactions');
    if (saved && saved.includes('"id":"t1"')) {
      if (onClearAllTransactions) {
        onClearAllTransactions();
      }
    }
  }, []);

  // ตั้งค่างบประมาณที่ดึงจาก Database (currentUser) หรือ localStorage
  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    if (currentUser?.monthlyBudget !== undefined) return Number(currentUser.monthlyBudget) || 9000;
    return parseFloat(localStorage.getItem('monetech_monthly_budget')) || 9000;
  });
  const [dailyLimit, setDailyLimit] = useState(() => {
    if (currentUser?.dailyLimit !== undefined) return Number(currentUser.dailyLimit) || 400;
    return parseFloat(localStorage.getItem('monetech_daily_limit')) || 400;
  });

  useEffect(() => {
    if (currentUser?.monthlyBudget !== undefined) {
      setMonthlyBudget(Number(currentUser.monthlyBudget) || 9000);
    }
    if (currentUser?.dailyLimit !== undefined) {
      setDailyLimit(Number(currentUser.dailyLimit) || 400);
    }
  }, [currentUser?.monthlyBudget, currentUser?.dailyLimit]);

  // Modal สำหรับแก้ไขงบและลิมิต
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState(monthlyBudget.toString());
  const [tempLimit, setTempLimit] = useState(dailyLimit.toString());

  // คัดแยกเฉพาะรายการที่เป็น "รายจ่าย (expense)" เท่านั้น ไม่นำรายรับมารวมเป็นรายจ่าย
  const expenseTransactions = useMemo(() => {
    return transactions.filter(
      (t) => t.type !== 'income' && !String(t.category || '').startsWith('income')
    );
  }, [transactions]);

  // 1. กรองรายการตามช่วงเวลา
  const currentTransactions = useMemo(() => {
    if (period === 'week') {
      return expenseTransactions.filter(
        (t) => t.dayOfWeek !== undefined && !t.title?.includes('ต้นเดือน')
      );
    }
    return expenseTransactions;
  }, [expenseTransactions, period]);

  // 2. คำนวณยอดใช้จ่ายรวมจริง (ถ้าไม่มีรายการจะเป็น 0)
  const totalSpent = useMemo(() => {
    return currentTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [currentTransactions]);

  const targetBudget = period === 'month' ? monthlyBudget : dailyLimit * 7;
  const spentRatio = targetBudget > 0 ? totalSpent / targetBudget : 0;

  // 3. คำนวณยอดรายจ่ายแยกตาม 7 วันจริง (จ - อา)
  const maxScale = Math.max(600, dailyLimit * 1.5);
  const dayDefinitions = [
    { key: 1, day: 'จ', name: 'จันทร์' },
    { key: 2, day: 'อ', name: 'อังคาร' },
    { key: 3, day: 'พ', name: 'พุธ' },
    { key: 4, day: 'พฤ', name: 'พฤหัสบดี' },
    { key: 5, day: 'ศ', name: 'ศุกร์' },
    { key: 6, day: 'ส', name: 'เสาร์' },
    { key: 0, day: 'อา', name: 'อาทิตย์' },
  ];

  const dailyData = useMemo(() => {
    return dayDefinitions.map((def) => {
      const dayTransactions = expenseTransactions.filter(
        (t) => t.dayOfWeek === def.key && !t.title?.includes('ต้นเดือน')
      );
      const dayAmount = dayTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const isOver = dayAmount > dailyLimit;

      return {
        ...def,
        amount: dayAmount,
        isOver: isOver,
        isRedText: isOver,
        itemsCount: dayTransactions.length,
      };
    });
  }, [expenseTransactions, dailyLimit]);

  // 4. หมวดหมู่รายจ่ายมาตรฐาน
  const categoryMeta = [
    {
      id: 'food',
      name: 'อาหาร & มื้อหลัก',
      shortLabel: 'อาหาร',
      color: '#ec4899', // Pink
      dotClass: 'bg-[#ec4899]',
    },
    {
      id: 'tea',
      name: 'ชานม & คาเฟ่ 🧋',
      shortLabel: 'ชานม/คาเฟ่',
      color: '#f97316', // Orange
      dotClass: 'bg-[#f97316]',
    },
    {
      id: 'travel',
      name: 'ค่าเดินทาง / วิน ม.',
      shortLabel: 'เดินทาง',
      color: '#3b82f6', // Blue
      dotClass: 'bg-[#3b82f6]',
    },
    {
      id: 'study',
      name: 'อุปกรณ์การเรียน',
      shortLabel: 'การเรียน',
      color: '#10b981', // Green
      dotClass: 'bg-[#10b981]',
    },
    {
      id: 'other',
      name: 'บิลและค่าใช้จ่ายอื่นๆ',
      shortLabel: 'อื่นๆ',
      color: '#8b5cf6', // Purple
      dotClass: 'bg-[#8b5cf6]',
    },
  ];

  const categoryBreakdown = useMemo(() => {
    const list = categoryMeta.map((cat) => {
      const catTransactions = expenseTransactions.filter(
        (t) => (t.category || 'other') === cat.id
      );
      const catAmount = catTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const percent = totalSpent > 0 ? Math.round((catAmount / totalSpent) * 100) : 0;

      return {
        ...cat,
        amount: catAmount,
        percent: percent,
        count: catTransactions.length,
      };
    });

    // ถ้ามีรายจ่าย แสดงหมวดที่มีการจ่าย หรือถ้าเป็น 0 แสดง 4 หมวดหลัก
    if (totalSpent === 0) {
      return list.filter((c) => c.id !== 'other');
    }
    return list.filter((c) => c.amount > 0 || c.id !== 'other');
  }, [expenseTransactions, totalSpent]);

  // หาหมวดหมู่อันดับ 1 จริง
  const topCategory = useMemo(() => {
    if (totalSpent === 0) return { name: '-', shortLabel: '-' };
    const sorted = [...categoryBreakdown].sort((a, b) => b.amount - a.amount);
    return sorted[0] || { name: '-', shortLabel: '-' };
  }, [categoryBreakdown, totalSpent]);

  // คำนวณ Donut Chart Stroke
  const radius = 38;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;
  const donutSegments = categoryBreakdown.map((cat) => {
    const strokeDasharray = `${(cat.percent / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
    accumulatedPercent += cat.percent;
    return {
      ...cat,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  const teaCategory = categoryBreakdown.find((c) => c.id === 'tea');
  const teaAvgDaily = teaCategory && teaCategory.amount > 0 ? Math.round(teaCategory.amount / 30) : 0;

  const handleSaveBudget = async (e) => {
    e.preventDefault();
    const b = parseFloat(tempBudget) || 9000;
    const l = parseFloat(tempLimit) || 400;
    setMonthlyBudget(b);
    setDailyLimit(l);
    localStorage.setItem('monetech_monthly_budget', b.toString());
    localStorage.setItem('monetech_daily_limit', l.toString());
    setIsEditingBudget(false);

    if (currentUser?.id) {
      try {
        const updated = await updateUserProfileInDatabase(currentUser.id, {
          monthlyBudget: b,
          dailyLimit: l,
        });
        if (onUpdateUser) onUpdateUser(updated);
      } catch (err) {
        console.error('Failed to sync budget to DB:', err);
      }
    }
  };

  return (
    <section className="flex-1 flex flex-col px-4 md:px-0 pt-3 md:pt-0 pb-24 md:pb-6 space-y-4">
      {/* Header Bar */}
      <div className="flex justify-between items-center pt-1 pb-1">
        <h1 className="text-[25px] font-black text-slate-900 tracking-tight">
          สถิติการเงิน
        </h1>

        {/* Toggle สัปดาห์ / เดือนนี้ */}
        <div className="bg-[#e2e8f0]/80 p-1 rounded-full flex items-center text-xs font-semibold">
          <button
            type="button"
            onClick={() => setPeriod('week')}
            className={`px-3 py-1 rounded-full transition ${
              period === 'week'
                ? 'bg-white text-slate-900 font-bold shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            สัปดาห์
          </button>
          <button
            type="button"
            onClick={() => setPeriod('month')}
            className={`px-3 py-1 rounded-full transition ${
              period === 'month'
                ? 'bg-white text-slate-900 font-bold shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            เดือนนี้
          </button>
        </div>
      </div>

      {/* โครงสร้าง Grid: มือถือเรียงลงมาเหมือนเดิม 100% | PC แบ่ง 2 คอลัมน์ซ้าย-ขวา */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
        <div className="space-y-4 lg:col-span-7">
          {/* การ์ดที่ 1: ยอดใช้จ่ายสะสม (เริ่มต้นเป็น 0) */}
          <div className="bg-white border border-[#d1fae5]/60 sm:border-slate-200/90 rounded-3xl p-4 md:p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] space-y-2 relative">
            <div className="flex justify-between items-center">
              <p className="text-xs text-slate-500 font-medium">
                {period === 'month' ? 'ยอดใช้จ่ายสะสมเดือนนี้' : 'ยอดใช้จ่ายสะสมสัปดาห์นี้'}
              </p>

              {/* Badge ประเมินงบประมาณ */}
              <div className="flex items-center gap-1.5">
                {spentRatio <= 0.7 && (
                  <span className="inline-flex items-center gap-1.5 bg-[#dcfce7] text-[#15803d] text-[11px] font-bold px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]"></span>
                    {totalSpent === 0 ? 'ยังไม่มีรายจ่าย' : 'คุมงบได้ดี'}
                  </span>
                )}
                {spentRatio > 0.7 && spentRatio <= 1.0 && (
                  <span className="inline-flex items-center gap-1.5 bg-[#fef3c7] text-[#d97706] text-[11px] font-bold px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]"></span>
                    ใกล้เต็มงบ
                  </span>
                )}
                {spentRatio > 1.0 && (
                  <span className="inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#ef4444] text-[11px] font-bold px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]"></span>
                    เกินงบที่ตั้งไว้
                  </span>
                )}

                {/* ปุ่มแก้ไขงบประมาณ */}
                <button
                  type="button"
                  onClick={() => {
                    setTempBudget(monthlyBudget.toString());
                    setTempLimit(dailyLimit.toString());
                    setIsEditingBudget(true);
                  }}
                  title="ตั้งค่างบประมาณ"
                  className="w-6 h-6 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                </button>
              </div>
            </div>

            {/* ยอดเงินจริง */}
            <div className="flex items-baseline pt-0.5">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                ฿ {totalSpent.toLocaleString('th-TH')}
              </span>
              <span className="text-sm font-semibold text-slate-400 ml-2">
                / ฿{targetBudget.toLocaleString('th-TH')}
              </span>
            </div>

            {/* หลอดแสดงสัดส่วนงบ */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  spentRatio > 1.0
                    ? 'bg-rose-500'
                    : spentRatio > 0.7
                    ? 'bg-amber-400'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, spentRatio * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* การ์ดที่ 2: รายจ่ายรอบ 7 วันที่ผ่านมา */}
          <div className="bg-white border border-[#d1fae5]/60 sm:border-slate-200/90 rounded-3xl p-4 md:p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-900">
                รายจ่ายรอบ 7 วันที่ผ่านมา
              </h2>
              <span className="text-xs font-semibold text-slate-500">
                ลิมิต ฿{dailyLimit.toLocaleString('th-TH')}/วัน
              </span>
            </div>

            {/* กราฟแท่ง 7 วัน + เส้นประลิมิต */}
            <div className="pt-2 pb-1 relative">
              {activeDay && (
                <div className="mb-2 bg-slate-900 text-white text-[11px] font-semibold py-1.5 px-3 rounded-xl flex items-center justify-between shadow-md animate-fade-in">
                  <span>วัน{activeDay.name}: ฿{activeDay.amount.toLocaleString('th-TH')}</span>
                  <span className={activeDay.isOver ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {activeDay.isOver
                      ? `เกินลิมิต ฿${(activeDay.amount - dailyLimit).toLocaleString('th-TH')}`
                      : activeDay.amount === 0
                      ? 'ยังไม่มีการใช้จ่าย'
                      : `เหลืองบ ฿${(dailyLimit - activeDay.amount).toLocaleString('th-TH')}`}
                  </span>
                </div>
              )}

              <div className="h-36 w-full relative flex items-end justify-between px-2">
                {/* เส้นประลิมิตสีแดง (฿400/วัน) */}
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-[#fca5a5] pointer-events-none z-10"
                  style={{ bottom: `${Math.min(95, (dailyLimit / maxScale) * 100)}%` }}
                ></div>

                {/* แท่งกราฟแต่ละวัน */}
                {dailyData.map((item, index) => {
                  const heightPercent = item.amount > 0 ? Math.min(100, (item.amount / maxScale) * 100) : 4;
                  const isSelected = activeDay?.day === item.day;

                  return (
                    <div
                      key={index}
                      onClick={() => setActiveDay(item)}
                      className="flex flex-col items-center flex-1 cursor-pointer group"
                    >
                      <div className="w-full flex justify-center items-end h-28 relative">
                        <div
                          className={`w-4.5 md:w-7 rounded-t-md transition-all duration-300 relative ${
                            item.isOver
                              ? 'bg-[#fb7185]/80 hover:bg-[#f43f5e]'
                              : item.amount > 0
                              ? 'bg-[#34d399]/70 hover:bg-[#10b981]'
                              : 'bg-slate-100 hover:bg-slate-200'
                          } ${isSelected ? 'ring-2 ring-slate-900 scale-105' : ''}`}
                          style={{ height: `${heightPercent}%` }}
                        ></div>
                      </div>

                      {/* ชื่อวัน จ, อ, พ, พฤ, ศ, ส, อา */}
                      <span
                        className={`text-xs mt-2 transition ${
                          item.isRedText
                            ? 'text-[#ef4444] font-black'
                            : item.amount > 0
                            ? 'text-slate-800 font-bold'
                            : 'text-slate-400 font-medium'
                        }`}
                      >
                        {item.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* การ์ดที่ 4: คาดการณ์เงินเก็บสิ้นเดือน */}
          <div className="bg-[#ecfdf5] border border-[#a7f3d0] rounded-3xl p-4 md:p-5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#10b981] text-white flex items-center justify-center text-lg shrink-0">
                <span className="material-symbols-outlined text-xl">savings</span>
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 leading-tight">
                  คาดการณ์เงินเก็บสิ้นเดือน
                </h3>
                <p className="text-[11px] text-[#047857] font-medium mt-0.5">
                  {monthlyBudget >= totalSpent ? (
                    <>คุมงบดีเยี่ยม มีโอกาสออมได้ถึง ฿{(monthlyBudget - totalSpent).toLocaleString('th-TH')}</>
                  ) : (
                    <>⚠️ ใช้จ่ายเกินงบไปแล้ว ฿{(totalSpent - monthlyBudget).toLocaleString('th-TH')}</>
                  )}
                </p>
              </div>
            </div>
            <span className="text-xs font-extrabold text-[#047857] bg-white px-2.5 py-1 rounded-full shadow-xs">
              {((monthlyBudget > 0 ? (totalSpent / monthlyBudget) * 100 : 0)).toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-5">
          {/* การ์ดที่ 3: เงินหายไปกับอะไรมากที่สุด? */}
          <div className="bg-white border border-[#d1fae5]/60 sm:border-slate-200/90 rounded-3xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-900">
                เงินหายไปกับอะไรมากที่สุด?
              </h2>
              <span className="text-[11px] text-slate-400 font-medium">
                รวม {expenseTransactions.length} รายการ
              </span>
            </div>

            {/* Donut Chart ตรงกลาง */}
            <div className="flex justify-center items-center py-2">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke={totalSpent === 0 ? '#e2e8f0' : '#f8fafc'}
                    strokeWidth="15"
                  />
                  {totalSpent > 0 &&
                    donutSegments.map((segment) => (
                      <circle
                        key={segment.id}
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="transparent"
                        stroke={segment.color}
                        strokeWidth="15"
                        strokeDasharray={segment.strokeDasharray}
                        strokeDashoffset={segment.strokeDashoffset}
                        className="transition-all duration-500"
                      />
                    ))}
                </svg>

                {/* ข้อความกลาง Donut */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {totalSpent === 0 ? 'ยอดรวม' : 'อันดับ 1'}
                  </span>
                  <span className="text-base font-extrabold text-slate-900 mt-0.5">
                    {totalSpent === 0 ? '฿0' : topCategory.shortLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Legend รายละเอียดแต่ละหมวด */}
            <div className="space-y-2.5 pt-1 text-xs">
              {categoryBreakdown.map((cat) => (
                <div key={cat.id} className="flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-3 h-3 rounded-full ${cat.dotClass} shrink-0`}></span>
                    <span className="font-semibold text-slate-800">{cat.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-extrabold text-slate-900">{cat.percent}% </span>
                    <span className="text-slate-400 font-normal">
                      (฿{cat.amount.toLocaleString('th-TH')})
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* กล่องคำแนะนำประหยัดเงินสีเหลืองอ่อน */}
            <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-2xl p-3.5 flex items-start gap-2.5">
              <span className="text-base leading-tight">💡</span>
              <p className="text-xs text-[#92400e] font-medium leading-relaxed">
                {totalSpent === 0 ? (
                  <>ยังไม่มีการบันทึกรายจ่าย กดปุ่ม "+" เพื่อเริ่มบันทึกรายการแรก!</>
                ) : teaAvgDaily > 0 ? (
                  <>คุณจ่ายค่าชานมเฉลี่ยวันละ ฿{teaAvgDaily} ลดลงอีกนิดมีเงินเก็บเพิ่ม!</>
                ) : (
                  <>หมวดที่ใช้จ่ายเยอะสุดคือ {topCategory.name} (฿{topCategory.amount?.toLocaleString('th-TH')})</>
                )}
              </p>
            </div>
          </div>

          {/* แถบจัดการรายการรายจ่าย */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-4 md:p-5 shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setShowTransactionList(!showTransactionList)}
                className="flex items-center gap-2 text-xs font-bold text-slate-800 hover:text-emerald-600 transition"
              >
                <span className="material-symbols-outlined text-base">receipt_long</span>
                <span>รายการรายจ่ายจริง ({expenseTransactions.length} รายการ)</span>
                <span className="material-symbols-outlined text-sm">
                  {showTransactionList ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              <div className="flex items-center gap-2">
                {expenseTransactions.length > 0 && onClearAllTransactions && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('ต้องการล้างค่ารายจ่ายทั้งหมดให้เป็น 0 หรือไม่?')) {
                        onClearAllTransactions();
                      }
                    }}
                    className="text-[11px] font-bold text-rose-500 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full transition"
                  >
                    ล้างเป็น 0
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate('expense', { defaultType: 'expense' })}
                  className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1 transition"
                >
                  <span>+ บันทึกรายจ่าย</span>
                </button>
              </div>
            </div>

            {showTransactionList && (
              <div className="space-y-2 pt-1 max-h-52 overflow-y-auto pr-1">
                {expenseTransactions.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-3">ยังไม่มีรายการรายจ่าย (ยอดรวม ฿0)</p>
                ) : (
                  expenseTransactions.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          {item.category === 'tea'
                            ? '🧋'
                            : item.category === 'travel'
                            ? '🚗'
                            : item.category === 'study'
                            ? '✏️'
                            : '🍲'}
                        </span>
                        <div>
                          <p className="font-bold text-slate-800 leading-none">{item.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{item.date || 'วันนี้'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">
                          -฿{Number(item.amount).toLocaleString('th-TH')}
                        </span>
                        {onDeleteTransaction && (
                          <button
                            type="button"
                            onClick={() => onDeleteTransaction(item.id)}
                            title="ลบรายการนี้"
                            className="w-5 h-5 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal แก้ไขงบประมาณและลิมิต */}
      {isEditingBudget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-4 border border-slate-100 animate-scale-up">
            <div className="flex justify-between items-center">
              <h4 className="text-base font-bold text-slate-900">ตั้งค่างบประมาณ</h4>
              <button
                type="button"
                onClick={() => setIsEditingBudget(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  งบประมาณรวมทั้งเดือน (฿)
                </label>
                <input
                  type="number"
                  value={tempBudget}
                  onChange={(e) => setTempBudget(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ลิมิตรายจ่ายต่อวัน (฿/วัน)
                </label>
                <input
                  type="number"
                  value={tempLimit}
                  onChange={(e) => setTempLimit(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingBudget(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition shadow-md"
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
