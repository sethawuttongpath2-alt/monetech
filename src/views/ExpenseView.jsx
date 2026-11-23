import React, { useRef, useState, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default function ExpenseView({
  onNavigate,
  onAddExpense,
  billContext = null,
  onBillPaid,
}) {
  // ประเภทรายการ: 'expense' (รายจ่าย - หักเงินออก) หรือ 'income' (รายรับ/เติมงบ - เพิ่มเงินเข้า)
  const [txType, setTxType] = useState(() => {
    if (billContext?.defaultType === 'income') return 'income';
    return 'expense';
  });

  const [expenseVal, setExpenseVal] = useState(() => {
    return billContext?.amount ? billContext.amount.toString() : '0';
  });
  const [slipPreview, setSlipPreview] = useState('');
  const [slipFileName, setSlipFileName] = useState('');
  const [slipStatus, setSlipStatus] = useState('อัปโหลดสลิปเพื่ออ่านยอดเงิน');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(() => {
    if (billContext?.defaultType === 'income') return 'income_topup';
    return billContext?.billId ? 'other' : 'food';
  });
  const [expenseNote, setExpenseNote] = useState(
    billContext?.billId ? `ชำระ ${billContext.title}` : ''
  );
  const fileInputRef = useRef(null);

  // อัปเดตเมื่อ billContext เปลี่ยนแปลง
  useEffect(() => {
    if (billContext?.defaultType === 'income') {
      setTxType('income');
      setSelectedCategory('income_topup');
    } else if (billContext?.defaultType === 'expense') {
      setTxType('expense');
      setSelectedCategory('food');
    }
    if (billContext?.amount) {
      setExpenseVal(billContext.amount.toString());
      setExpenseNote(`ชำระ ${billContext.title}`);
    }
  }, [billContext]);

  const expenseCategories = [
    { id: 'food', label: 'อาหาร', icon: '🍲' },
    { id: 'tea', label: 'ชานม/คาเฟ่', icon: '🧋' },
    { id: 'travel', label: 'เดินทาง', icon: '🚗' },
    { id: 'study', label: 'การเรียน', icon: '✏️' },
    { id: 'other', label: 'อื่นๆ/บิล', icon: '💳' },
  ];

  const incomeCategories = [
    { id: 'income_topup', label: 'เติมงบ/โอนเข้า', icon: '💰' },
    { id: 'income_salary', label: 'เงินเดือน/ค่าขนม', icon: '🏦' },
    { id: 'income_other', label: 'รายรับอื่นๆ', icon: '🎁' },
  ];

  const activeCategories = txType === 'income' ? incomeCategories : expenseCategories;

  const handleSwitchType = (nextType) => {
    setTxType(nextType);
    if (nextType === 'income') {
      setSelectedCategory('income_topup');
    } else {
      setSelectedCategory('food');
    }
  };

  // จัดการดึง API Key ผ่าน Environment Variable
  const GEMINI_API_KEY =
    import.meta.env.VITE_GEMINI_API_KEY ||
    (typeof process !== 'undefined' ? process.env?.REACT_APP_GEMINI_API_KEY : '');

  // แปลงไฟล์รูปภาพเป็น Base64
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result;
        const base64Data = result.split(',')[1];
        resolve({
          dataUrl: result,
          base64: base64Data,
          mimeType: file.type || 'image/jpeg',
        });
      };
      reader.onerror = (error) => reject(error);
    });

  // เรียกใช้ Google Gemini API เพื่อวิเคราะห์สลิป
  const analyzeSlipWithGemini = async (file) => {
    if (!GEMINI_API_KEY) {
      throw new Error('VITE_GEMINI_API_KEY_NOT_FOUND');
    }

    const { dataUrl, base64, mimeType } = await fileToBase64(file);
    setSlipPreview(dataUrl);

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const systemInstruction =
      'คุณเป็น AI ผู้ช่วยวิเคราะห์ข้อมูลสลิปการโอนเงิน ให้วิเคราะห์เฉพาะ "ยอดเงินที่โอนสำเร็จ" จากภาพสลิป และตอบกลับมาเป็นตัวเลขทศนิยม 2 ตำแหน่งเท่านั้น (เช่น "150.00") โดยไม่ต้องมีตัวหนังสือ สกุลเงิน หรือคำอธิบายอื่นใดทั้งสิ้น';

    const imagePart = {
      inlineData: {
        data: base64,
        mimeType: mimeType,
      },
    };

    const prompt =
      'จงวิเคราะห์ยอดเงินที่โอนสำเร็จจากสลิปนี้ และตอบกลับมาเฉพาะตัวเลขทศนิยม 2 ตำแหน่งเท่านั้น เช่น "150.00"';

    let result;
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash', systemInstruction });
      result = await model.generateContent([imagePart, prompt]);
    } catch (modelErr) {
      console.warn('Fallback to gemini-flash-latest model due to:', modelErr);
      const fallbackModel = genAI.getGenerativeModel({
        model: 'gemini-flash-latest',
        systemInstruction,
      });
      result = await fallbackModel.generateContent([imagePart, prompt]);
    }

    const responseText = result.response.text().trim();
    const cleanedText = responseText.replace(/,/g, '');
    const match = cleanedText.match(/\d+(?:\.\d{1,2})?/);

    if (match) {
      const parsed = parseFloat(match[0]);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed.toFixed(2);
      }
    }

    throw new Error('UNABLE_TO_PARSE_AMOUNT');
  };

  const pressKey = (val) => {
    if (val === 'del') {
      setExpenseVal((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
    } else if (val === '.') {
      setExpenseVal((prev) => (prev.includes('.') ? prev : prev + '.'));
    } else {
      setExpenseVal((prev) => {
        if (prev === '0') return val;
        if (prev.includes('.') && prev.split('.')[1]?.length >= 2) return prev;
        if (prev.replace('.', '').length < 8) return prev + val;
        return prev;
      });
    }
  };

  const handleSlip = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSlipFileName(file.name);
    setSlipStatus('กำลังให้ AI วิเคราะห์สลิป...');
    setExpenseVal('...');
    setIsLoading(true);

    try {
      const amount = await analyzeSlipWithGemini(file);
      setExpenseVal(amount);
      setSlipStatus('AI วิเคราะห์ยอดเงินสำเร็จ!');
    } catch (err) {
      console.error('Gemini slip analysis error:', err);
      setExpenseVal(billContext?.amount ? billContext.amount.toString() : '0');
      const errMessage = err?.message || '';

      if (errMessage === 'VITE_GEMINI_API_KEY_NOT_FOUND') {
        setSlipStatus('ไม่พบ API Key ใน .env (สามารถตรวจสอบและกดยืนยันยอดได้)');
      } else {
        setSlipStatus('AI อ่านยอดไม่ชัดเจน (กรุณาตรวจสอบยอดตัวเลขด้านบน)');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const clearSlip = () => {
    setSlipPreview('');
    setSlipFileName('');
    setSlipStatus('อัปโหลดสลิปเพื่ออ่านยอดเงิน');
    setExpenseVal(billContext?.amount ? billContext.amount.toString() : '0');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = () => {
    const num = parseFloat(expenseVal);
    if (isNaN(num) || num <= 0) {
      alert('กรุณาระบุยอดเงินที่มากกว่า 0 บาท');
      return;
    }

    const catObj = activeCategories.find((c) => c.id === selectedCategory) || activeCategories[0];
    const today = new Date();
    const isBillPay = Boolean(billContext?.billId);
    const finalType = isBillPay ? 'expense' : txType;

    // 1. ถ้าเป็นการสแกนเพื่อตัดยอดหารบิล ให้ส่งแจ้งไปยังระบบหารบิล
    if (isBillPay && onBillPaid) {
      onBillPaid(billContext.billId);
    }

    // 2. บันทึกยอดเงินเข้า Transactions จริงของแอป (แยกชัดเจนระหว่าง income และ expense)
    if (onAddExpense) {
      onAddExpense({
        id: `t-${Date.now()}`,
        title:
          expenseNote.trim() ||
          (slipFileName
            ? `สลิป: ${billContext?.title || (finalType === 'income' ? 'เติมงบเข้า' : catObj.label)}`
            : catObj.label),
        amount: num,
        category: isBillPay ? 'other' : selectedCategory,
        type: finalType, // 'income' = เพิ่มเงิน | 'expense' = ลดเงิน
        date: today.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
        timestamp: Date.now(),
        dayOfWeek: today.getDay(),
      });
    }

    if (isBillPay) {
      alert(
        `🎉 สแกนสลิปชำระ "${billContext.title}" ยอด -฿${num.toLocaleString('th-TH', {
          minimumFractionDigits: 2,
        })} เรียบร้อยแล้ว!`
      );
      onNavigate('bills');
    } else if (finalType === 'income') {
      alert(
        `💰 บันทึกรายรับ/เติมงบ +฿${num.toLocaleString('th-TH', {
          minimumFractionDigits: 2,
        })} สำเร็จ!`
      );
      onNavigate('home');
    } else {
      alert(
        `💸 บันทึกรายจ่าย -฿${num.toLocaleString('th-TH', {
          minimumFractionDigits: 2,
        })} (หักออกจากยอดเงินที่ใช้ได้) สำเร็จ!`
      );
      onNavigate('home');
    }
  };

  const isBillPay = Boolean(billContext?.billId);

  return (
    <section className="flex-1 flex flex-col px-5 pt-3 pb-6 space-y-2.5 md:max-w-xl md:mx-auto md:w-full md:bg-white md:border md:border-slate-200/80 md:rounded-3xl md:p-7 md:shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onNavigate(isBillPay ? 'bills' : 'home')}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>
        <h2 className="text-base font-bold text-slate-900">
          {isBillPay
            ? 'สแกนสลิปตัดยอดหารบิล'
            : txType === 'income'
            ? 'บันทึกรายรับ / เติมงบ'
            : 'บันทึกรายจ่าย (หักจากงบ)'}
        </h2>
        <div className="w-10"></div>
      </div>

      {/* ปุ่มสลับโหมด รายจ่าย (ลดเงิน) vs รายรับ (เพิ่มเงิน) */}
      {!isBillPay && (
        <div className="bg-slate-100 p-1 rounded-2xl grid grid-cols-2 gap-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => handleSwitchType('expense')}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              txType === 'expense'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>💸 รายจ่าย (ลดเงิน)</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchType('income')}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              txType === 'income'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>💰 รายรับ / เติมงบ</span>
          </button>
        </div>
      )}

      {/* แบนเนอร์แสดงข้อมูลบิลที่กำลังจะจ่าย (ถ้ามาจากการหารบิล) */}
      {isBillPay && (
        <div className="bg-gradient-to-r from-indigo-50 via-emerald-50 to-teal-50 border border-indigo-200/80 rounded-2xl p-3 flex items-center justify-between shadow-xs animate-fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-white shadow-xs flex items-center justify-center text-xl shrink-0">
              {billContext.icon || '🍲'}
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 leading-tight">
                {billContext.title}
              </h4>
              <p className="text-[11px] text-indigo-700 font-semibold mt-0.5">
                ยอดที่ต้องชำระคืน: ฿{Number(billContext.amount).toLocaleString('th-TH')}
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-emerald-600 text-white px-2.5 py-1 rounded-full font-bold shadow-xs shrink-0">
            ตัดยอดอัตโนมัติ
          </span>
        </div>
      )}

      {/* ยอดเงินตัวเลขใหญ่ */}
      <div className="flex flex-col items-center py-0.5">
        <p className="text-xs text-slate-400 mb-0.5">
          {isBillPay
            ? 'ยอดเงินที่อ่านได้จากสลิป'
            : txType === 'income'
            ? 'ระบุยอดเงินรายรับ (จะไปเพิ่มยอดเงินที่ใช้ได้)'
            : 'ระบุยอดเงินที่จ่าย (จะไปหักลดยอดเงินที่ใช้ได้)'}
        </p>
        <div
          className={`flex items-center font-extrabold text-4xl tracking-tight ${
            txType === 'income' && !isBillPay ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          <span className="text-2xl mr-1">
            {txType === 'income' && !isBillPay ? '+฿' : '-฿'}
          </span>
          <span>{expenseVal}</span>
        </div>
      </div>

      {/* อัปโหลดสลิป Smart Slip (AI Gemini) */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleSlip}
        disabled={isLoading}
      />
      <button
        type="button"
        disabled={isLoading}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full border-2 border-dashed border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50/80 transition rounded-2xl p-2.5 flex items-center justify-center gap-3 text-indigo-700 shadow-2xs ${
          isLoading ? 'opacity-70 cursor-wait' : ''
        }`}
      >
        <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
          <span className={`material-symbols-outlined text-lg ${isLoading ? 'animate-spin' : ''}`}>
            {isLoading ? 'progress_activity' : 'photo_camera'}
          </span>
        </div>
        <div className="text-left flex-1">
          <p className="text-xs font-bold leading-tight">
            {isBillPay
              ? 'อัปโหลดสลิปโอนเงิน PromptPay คืนเพื่อน'
              : 'อัปโหลดสลิปโอนเงิน (Smart Slip AI)'}
          </p>
          <p className="text-[10px] text-indigo-500 font-medium leading-tight mt-0.5">
            {slipStatus}
          </p>
        </div>
      </button>

      {/* ตัวอย่างรูปสลิปที่อัปโหลด */}
      {slipPreview && (
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2 animate-fade-in">
          <img
            src={slipPreview}
            alt="Slip"
            className="w-10 h-10 object-cover rounded-lg border border-slate-200 shadow-2xs"
          />
          <div className="flex-1 text-xs">
            <p className="font-bold text-slate-800 truncate max-w-[180px]">{slipFileName}</p>
            <p
              className={`text-[10px] font-medium ${
                isLoading ? 'text-indigo-500' : 'text-emerald-600'
              }`}
            >
              {isLoading ? 'กำลังวิเคราะห์สลิป...' : '✓ AI ตรวจพบยอดเงินแล้ว'}
            </p>
          </div>
          <button
            type="button"
            onClick={clearSlip}
            disabled={isLoading}
            className="text-slate-400 hover:text-rose-500 p-1 transition"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* เลือกหมวดหมู่ */}
      {!isBillPay && (
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            {txType === 'income' ? 'เลือกหมวดหมู่รายรับ' : 'เลือกหมวดหมู่รายจ่าย'}
          </label>
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {activeCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* บันทึกข้อความโน้ต */}
      <div>
        <input
          type="text"
          placeholder={
            txType === 'income'
              ? 'ชื่อรายการรายรับ (เช่น เงินเดือนเข้า, แม่โอนให้)'
              : 'ชื่อรายการรายจ่าย (เช่น ข้าวกะเพรา, ชานมไข่มุก)'
          }
          value={expenseNote}
          onChange={(e) => setExpenseNote(e.target.value)}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {/* Keypad ตัวเลข */}
      <div className="grid grid-cols-3 gap-1.5 mt-auto pt-1">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => pressKey(key)}
            className="py-2 bg-slate-100 text-slate-800 rounded-xl font-bold text-lg active:bg-slate-200 flex items-center justify-center transition shadow-2xs"
          >
            {key === 'del' ? (
              <span className="material-symbols-outlined text-lg">backspace</span>
            ) : (
              key
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isLoading}
        className={`w-full disabled:opacity-50 text-white font-bold py-3 rounded-2xl shadow-lg active:scale-[0.98] transition text-sm flex items-center justify-center gap-2 ${
          txType === 'income' && !isBillPay
            ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25'
            : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/25'
        }`}
      >
        <span className="material-symbols-outlined text-base">check_circle</span>
        <span>
          {isBillPay
            ? 'ยืนยันและตัดยอดหารบิลทันที'
            : txType === 'income'
            ? 'บันทึกรายรับ / เติมงบ (+)'
            : 'บันทึกรายจ่าย / หักเงิน (-)'}
        </span>
      </button>
    </section>
  );
}
