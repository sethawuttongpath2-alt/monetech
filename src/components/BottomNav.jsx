import React from 'react';

export default function BottomNav({ currentScreen, onNavigate }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden h-[72px] bg-white/95 backdrop-blur-md border-t border-slate-200/80 flex justify-between items-center px-3 z-40 shadow-[0_-4px_16px_rgba(0,0,0,0.03)]">
      {/* 1. หน้าหลัก */}
      <button 
        type="button"
        onClick={() => onNavigate('home')} 
        className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
          currentScreen === 'home' ? 'text-emerald-600 font-bold' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <span className={`material-symbols-outlined text-[23px] ${currentScreen === 'home' ? 'icon-fill' : ''}`}>
          home
        </span>
        <span className="text-[11px] font-medium mt-0.5">หน้าหลัก</span>
      </button>

      {/* 2. เป้าหมาย */}
      <button 
        type="button"
        onClick={() => onNavigate('goals')} 
        className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
          currentScreen === 'goals' ? 'text-emerald-600 font-bold' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <span className={`material-symbols-outlined text-[23px] ${currentScreen === 'goals' ? 'icon-fill' : ''}`}>
          target
        </span>
        <span className="text-[11px] font-medium mt-0.5">เป้าหมาย</span>
      </button>

      {/* 3. Center Button (+) */}
      <div className="flex items-center justify-center px-1 relative -top-3">
        <button 
          type="button"
          onClick={() => onNavigate('expense')} 
          className="w-13 h-13 bg-[#0d1322] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-slate-800 active:scale-95 transition border-2 border-white"
          aria-label="เพิ่มรายการ"
        >
          <span className="material-symbols-outlined text-2xl font-bold">add</span>
        </button>
      </div>

      {/* 4. หารบิล */}
      <button 
        type="button"
        onClick={() => onNavigate('bills')} 
        className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
          currentScreen === 'bills' ? 'text-emerald-600 font-bold' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <span className={`material-symbols-outlined text-[23px] ${currentScreen === 'bills' ? 'icon-fill' : ''}`}>
          groups
        </span>
        <span className="text-[11px] font-medium mt-0.5">หารบิล</span>
      </button>

      {/* 5. สถิติ */}
      <button 
        type="button"
        onClick={() => onNavigate('stats')} 
        className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
          currentScreen === 'stats' ? 'text-emerald-600 font-bold' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <span className={`material-symbols-outlined text-[23px] ${currentScreen === 'stats' ? 'icon-fill' : ''}`}>
          bar_chart
        </span>
        <span className="text-[11px] font-medium mt-0.5">สถิติ</span>
      </button>
    </nav>
  );
}
