import React, { useState, useEffect, useRef } from 'react';
import {
  fetchUserSplitBills,
  syncUserSplitBills,
  deleteUserSplitBill,
  clearAllUserSplitBills,
} from '../lib/supabase';

export default function SplitBillView({ onNavigate, onAddExpense, currentUser }) {
  const storageKey = currentUser?.id ? `monetech_split_bills_${currentUser.id}` : 'monetech_split_bills';
  const isLoadedRef = useRef(false);

  const isMockBill = (b) => {
    const idStr = String(b?.id || '');
    const titleStr = String(b?.title || '').trim();
    return (
      idStr === 'bill-1' ||
      idStr === 'bill-2' ||
      idStr.endsWith('_bill-1') ||
      idStr.endsWith('_bill-2') ||
      titleStr === 'หมูกระทะหลัง ม. (4 คน)' ||
      titleStr === 'ค่าไฟหอพักเดือนนี้ (หาร 2)'
    );
  };

  // เริ่มต้นเป็นหน้าว่างเปล่า [] เพื่อให้ผู้ใช้สร้างบิลเอง
  const [bills, setBills] = useState(() => {
    localStorage.removeItem('monetech_split_bills');
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((b) => !isMockBill(b));
          localStorage.setItem(storageKey, JSON.stringify(cleaned));
          return cleaned;
        }
      } catch {
        return [];
      }
    }
    return [];
  });

  // โหลดรายการหารบิลจาก Supabase Database
  useEffect(() => {
    let active = true;
    isLoadedRef.current = false;
    if (currentUser?.id) {
      fetchUserSplitBills(currentUser.id).then((dbBills) => {
        if (active && Array.isArray(dbBills)) {
          setBills((prev) => {
            const mergedMap = new Map();
            prev.filter((b) => !isMockBill(b)).forEach((b) => mergedMap.set(String(b.id), b));
            dbBills.filter((b) => !isMockBill(b)).forEach((b) => {
              if (!mergedMap.has(String(b.id))) {
                mergedMap.set(String(b.id), b);
              }
            });
            return Array.from(mergedMap.values());
          });
          isLoadedRef.current = true;
        }
      });
    } else {
      isLoadedRef.current = true;
    }
    return () => {
      active = false;
    };
  }, [currentUser?.id]);

  // Modals & Feedback
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPromptPayModal, setShowPromptPayModal] = useState(false);
  const [selectedBillForPay, setSelectedBillForPay] = useState(null);
  const [billToDelete, setBillToDelete] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // ฟอร์มสำหรับสร้างบิลใหม่
  const [newTitle, setNewTitle] = useState('');
  const [newTotal, setNewTotal] = useState('');
  const [newPeopleCount, setNewPeopleCount] = useState(3);
  const [newIcon, setNewIcon] = useState('🍲');
  const [friendNames, setFriendNames] = useState(['เพื่อน 1', 'เพื่อน 2']);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    syncUserSplitBills(currentUser?.id, bills);
  }, [bills, currentUser?.id]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3200);
  };

  // ลบบิลทั้งใบ
  const handleDeleteBill = async (billId) => {
    const targetBill = bills.find((b) => b.id === billId);
    const nextBills = bills.filter((b) => b.id !== billId);
    setBills(nextBills);
    await deleteUserSplitBill(currentUser?.id, billId);
    setBillToDelete(null);
    showToast(`🗑️ ลบบิล "${targetBill?.title || 'รายการบิล'}" เรียบร้อยแล้ว`);
  };

  // ล้างบิลทั้งหมด
  const handleClearAllBills = async () => {
    if (!window.confirm('ต้องการลบบิลหารทั้งหมดในหน้านี้หรือไม่?')) return;
    setBills([]);
    await clearAllUserSplitBills(currentUser?.id);
    showToast('🗑️ ล้างรายการบิลทั้งหมดเรียบร้อยแล้ว');
  };

  // ลบเพื่อนคนใดคนหนึ่งออกจากบิล
  const handleDeleteMember = (billId, memberId, memberName) => {
    setBills((prev) =>
      prev.map((b) => {
        if (b.id !== billId) return b;
        const updatedMembers = b.members.filter((m) => m.id !== memberId);
        const unpaidCount = updatedMembers.filter((m) => !m.isPaid).length;
        return {
          ...b,
          members: updatedMembers,
          statusBadge: unpaidCount === 0 ? 'ครบทุกคนแล้ว ✓' : `รอ ${unpaidCount} คน`,
          statusType: unpaidCount === 0 ? 'completed' : 'pending',
        };
      })
    );
    showToast(`ลบ ${memberName} ออกจากบิลแล้ว`);
  };

  const handleNudge = (billId, memberId, memberName) => {
    showToast(`📢 สะกิดทวง ${memberName} สำเร็จ! ส่งแจ้งเตือนผ่าน LINE / Notification แล้ว`);
  };

  const handleMarkMemberPaid = (billId, memberId) => {
    setBills((prev) =>
      prev.map((b) => {
        if (b.id !== billId) return b;
        const updatedMembers = b.members.map((m) => {
          if (m.id !== memberId) return m;
          return {
            ...m,
            isPaid: true,
            subtitle: 'โอนแล้วเมื่อสักครู่',
            amountPaid: m.amountOwed || b.perPerson,
          };
        });
        const unpaidCount = updatedMembers.filter((m) => !m.isPaid).length;
        return {
          ...b,
          members: updatedMembers,
          statusBadge: unpaidCount === 0 ? 'ครบทุกคนแล้ว ✓' : `รอ ${unpaidCount} คน`,
          statusType: unpaidCount === 0 ? 'completed' : 'pending',
        };
      })
    );
    showToast('✓ บันทึกสถานะว่าชำระเงินเรียบร้อยแล้ว');
  };

  // เปิดสแกนสลิปด้วย Smart Slip Scanner เดียวกับหน้าหลัก
  const handleOpenSmartSlipScanner = (bill) => {
    onNavigate('expense', {
      billId: bill.id,
      title: bill.title,
      icon: bill.icon,
      amount: bill.perPerson,
    });
  };

  const handleOpenPayModal = (bill) => {
    setSelectedBillForPay(bill);
    setShowPromptPayModal(true);
  };

  const handleConfirmPayment = () => {
    if (!selectedBillForPay) return;
    setBills((prev) =>
      prev.map((b) => {
        if (b.id !== selectedBillForPay.id) return b;
        return {
          ...b,
          isPaid: true,
          statusBadge: 'ชำระแล้ว ✓',
          statusType: 'completed',
        };
      })
    );

    // บันทึกลงในรายการรายจ่ายจริงของแอป เพื่อให้แสดงในหน้าสถิติ
    if (onAddExpense) {
      onAddExpense({
        id: `bill-pay-${Date.now()}`,
        title: `ชำระ ${selectedBillForPay.title}`,
        amount: selectedBillForPay.perPerson,
        category: 'other',
        type: 'expense',
        date: new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
        timestamp: Date.now(),
        dayOfWeek: new Date().getDay(),
      });
    }

    setShowPromptPayModal(false);
    showToast('🎉 โอนเงินคืนสำเร็จเรียบร้อยแล้ว!');
  };

  const handlePeopleCountChange = (count) => {
    const val = Math.max(2, Math.min(10, count));
    setNewPeopleCount(val);
    const newNames = [];
    for (let i = 1; i < val; i++) {
      newNames.push(friendNames[i - 1] || `เพื่อน ${i}`);
    }
    setFriendNames(newNames);
  };

  const handleCreateBill = (e) => {
    e.preventDefault();
    const total = parseFloat(newTotal);
    if (!newTitle.trim() || isNaN(total) || total <= 0) {
      alert('กรุณากรอกชื่อบิลและยอดเงินรวมให้ถูกต้อง');
      return;
    }

    const perPerson = Math.round(total / newPeopleCount);
    const avatars = ['👩', '👨', '👦', '👧', '🧑‍🦰', '🧑‍🦱'];
    const bgs = ['bg-[#dbeafe]', 'bg-[#ffe4e6]', 'bg-[#ffedd5]', 'bg-[#dcfce7]', 'bg-[#ede9fe]'];

    const members = friendNames.map((name, idx) => ({
      id: `m-${Date.now()}-${idx}`,
      name: name.trim() || `เพื่อน ${idx + 1}`,
      avatar: avatars[idx % avatars.length],
      avatarBg: bgs[idx % bgs.length],
      subtitle: `ยังไม่โอนคืน (฿${perPerson.toLocaleString('th-TH')})`,
      isPaid: false,
      amountOwed: perPerson,
    }));

    const newBill = {
      id: `split-${Date.now()}`,
      title: `${newTitle.trim()} (${newPeopleCount} คน)`,
      icon: newIcon,
      iconBg: 'bg-[#ffedd5]/80',
      totalAmount: total,
      perPerson: perPerson,
      statusBadge: `รอ ${members.length} คน`,
      statusType: 'pending',
      members: members,
      actionType: 'scan_promptpay',
      actionLabel: 'สแกนสลิป PromptPay คืนคนสำรองจ่าย',
    };

    const updatedBills = [newBill, ...bills];
    setBills(updatedBills);
    syncUserSplitBills(currentUser?.id, updatedBills);
    setNewTitle('');
    setNewTotal('');
    setNewPeopleCount(3);
    setShowCreateModal(false);
    showToast('✨ สร้างบิลหารใหม่เรียบร้อยแล้ว!');
  };

  return (
    <section className="flex-1 flex flex-col px-4 md:px-0 pt-3 md:pt-0 pb-24 md:pb-6 space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 max-w-xs w-full px-4">
          <div className="bg-slate-900/95 text-white text-xs font-semibold py-2.5 px-4 rounded-2xl shadow-xl backdrop-blur flex items-center justify-center text-center border border-slate-700 animate-fade-in">
            {toastMessage}
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex justify-between items-center pt-1 pb-1">
        <h1 className="text-[25px] font-black text-slate-900 tracking-tight">
          บิลหารกับเพื่อน
        </h1>
        <div className="flex items-center gap-2">
          {bills.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllBills}
              className="bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 transition"
            >
              <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
              <span>ล้างทั้งหมด</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="bg-[#0f172a] hover:bg-slate-800 active:scale-95 text-white text-xs font-bold px-3.5 py-1.5 rounded-full flex items-center gap-1 shadow-sm transition"
          >
            <span className="material-symbols-outlined text-[16px] font-extrabold leading-none">add</span>
            <span>สร้างบิล</span>
          </button>
        </div>
      </div>

      {/* รายการบิล */}
      <div className={bills.length === 0 ? 'space-y-4' : 'space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start'}>
        {bills.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-3xl p-8 text-center space-y-3 shadow-xs">
            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-2xl">
              <span className="material-symbols-outlined text-3xl">receipt_long</span>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">ยังไม่มีรายการบิลหาร</h3>
              <p className="text-xs text-slate-400">กดปุ่ม "+ สร้างบิล" เพื่อเริ่มหารค่าใช้จ่ายกับเพื่อน</p>
            </div>
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition"
              >
                + สร้างบิลใหม่
              </button>
            </div>
          </div>
        ) : (
          bills.map((bill) => {
            return (
              <div
                key={bill.id}
                className="bg-white border border-[#d1fae5]/60 sm:border-slate-200/90 rounded-3xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.03)] space-y-4 transition group"
              >
                {/* Header ของแต่ละการ์ดบิล */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-full ${bill.iconBg || 'bg-[#ffedd5]/80'} flex items-center justify-center text-2xl shrink-0 ${
                        bill.iconColor || ''
                      }`}
                    >
                      {bill.icon}
                    </div>
                    <div>
                      <h2 className="text-[15px] font-bold text-slate-900 leading-tight">
                        {bill.title}
                      </h2>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        ยอดรวม ฿{bill.totalAmount.toLocaleString('th-TH')} (คนละ ฿
                        {bill.perPerson.toLocaleString('th-TH')})
                      </p>
                    </div>
                  </div>

                  {/* Badge สถานะ + ปุ่มลบบิล */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {bill.statusType === 'pending' && (
                      <span className="inline-block bg-[#fee2e2]/70 text-[#ef4444] text-[11px] font-bold px-3 py-1 rounded-full">
                        {bill.statusBadge}
                      </span>
                    )}
                    {bill.statusType === 'must_pay' && (
                      <span className="inline-block bg-[#fef3c7]/80 text-[#d97706] text-[11px] font-bold px-3 py-1 rounded-full">
                        {bill.statusBadge}
                      </span>
                    )}
                    {bill.statusType === 'completed' && (
                      <span className="inline-block bg-[#dcfce7] text-[#15803d] text-[11px] font-bold px-3 py-1 rounded-full">
                        {bill.statusBadge}
                      </span>
                    )}

                    {/* ปุ่มลบบิล */}
                    <button
                      type="button"
                      onClick={() => setBillToDelete(bill)}
                      className="w-7 h-7 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition active:scale-90"
                      title="ลบบิลนี้"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>

                {/* รายชื่อสมาชิกที่ต้องหาร */}
                {bill.members && bill.members.length > 0 && (
                  <div className="space-y-3 pt-1">
                    {bill.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        {/* Avatar + ชื่อ */}
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-10 h-10 rounded-full ${member.avatarBg || 'bg-[#dbeafe]'} flex items-center justify-center text-xl shrink-0`}
                          >
                            {member.avatar}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-xs leading-none">
                              {member.name}
                            </h3>
                            <p
                              className={`text-[11px] mt-1 font-medium ${
                                member.isPaid ? 'text-slate-400' : 'text-[#ef4444]'
                              }`}
                            >
                              {member.subtitle}
                            </p>
                          </div>
                        </div>

                        {/* สถานะ หรือ ปุ่มสะกิดทวง + ปุ่มสแกนสลิป */}
                        <div className="flex items-center gap-1.5">
                          {member.isPaid ? (
                            <div className="flex items-center gap-1 text-[#15803d] font-bold text-xs mr-1">
                              <span className="text-sm font-extrabold">✓</span>
                              <span>จ่ายแล้ว ฿{member.amountPaid || bill.perPerson}</span>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleNudge(bill.id, member.id, member.name)}
                                className="bg-[#f1f5f9] hover:bg-slate-200 active:scale-95 text-slate-700 text-[11px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 transition"
                              >
                                <span>📢</span>
                                <span>สะกิดทวง</span>
                              </button>
                              {/* ปุ่มสแกนสลิปเพื่อน (ใช้ Smart Slip Scanner เดียวกับหน้าหลัก) */}
                              <button
                                type="button"
                                onClick={() =>
                                  onNavigate('expense', {
                                    billId: bill.id,
                                    title: `${bill.title} (${member.name})`,
                                    icon: bill.icon,
                                    amount: member.amountOwed || bill.perPerson,
                                  })
                                }
                                title="สแกนสลิปตัดยอดของเพื่อนคนนี้"
                                className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center text-xs font-bold transition"
                              >
                                <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMarkMemberPaid(bill.id, member.id)}
                                title="ทำเครื่องหมายว่าจ่ายแล้ว"
                                className="w-7 h-7 rounded-full bg-[#dcfce7] text-[#15803d] hover:bg-[#bbf7d0] flex items-center justify-center text-xs font-bold transition"
                              >
                                ✓
                              </button>
                            </>
                          )}

                          {/* ปุ่มลบเพื่อนออกจากบิล */}
                          <button
                            type="button"
                            onClick={() => handleDeleteMember(bill.id, member.id, member.name)}
                            title="ลบเพื่อนคนนี้ออกจากบิล"
                            className="w-6 h-6 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center text-xs transition ml-0.5"
                          >
                            <span className="material-symbols-outlined text-[15px]">close</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ปุ่ม Action ด้านล่างของการ์ด (ใช้ Smart Slip Scanner เดียวกับหน้าหลัก) */}
                {bill.actionType === 'scan_promptpay' && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenSmartSlipScanner(bill)}
                      className="w-full py-2.5 px-3 rounded-xl border border-slate-200/90 bg-[#f8fafc]/50 hover:bg-slate-100 active:scale-[0.99] transition text-slate-800 text-xs font-bold flex items-center justify-center gap-2 shadow-2xs"
                    >
                      <span className="material-symbols-outlined text-base text-[#0284c7]">
                        photo_camera
                      </span>
                      <span>สแกนสลิป PromptPay คืนคนสำรองจ่าย</span>
                    </button>
                  </div>
                )}

                {bill.actionType === 'pay_now' && (
                  <div className="pt-1">
                    {bill.isPaid ? (
                      <div className="w-full py-3 px-4 rounded-2xl bg-[#dcfce7] text-[#15803d] text-xs font-bold flex items-center justify-center gap-2 border border-[#bbf7d0]">
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        <span>โอนเงินคืน ฿{bill.perPerson} สำเร็จแล้ว</span>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {/* ปุ่มเปิดสแกนสลิปเหมือนหน้าหลัก */}
                        <button
                          type="button"
                          onClick={() => handleOpenSmartSlipScanner(bill)}
                          className="flex-1 py-3 px-4 rounded-2xl bg-[#dcfce7] hover:bg-[#bbf7d0] active:scale-[0.99] transition text-[#166534] text-xs font-extrabold flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-base font-bold">photo_camera</span>
                          <span>สแกนสลิปโอนคืน ฿{bill.perPerson}</span>
                        </button>
                        {/* ปุ่มดู QR Code */}
                        <button
                          type="button"
                          onClick={() => handleOpenPayModal(bill)}
                          title="ดู QR Code PromptPay"
                          className="w-12 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition"
                        >
                          <span className="material-symbols-outlined text-lg">qr_code_2</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal ยืนยันการลบบิล */}
      {billToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-4 border border-slate-100 animate-scale-up">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto text-2xl">
              <span className="material-symbols-outlined text-2xl">delete</span>
            </div>

            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">ยืนยันการลบบิล?</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                ต้องการลบ <span className="font-bold text-slate-800">"{billToDelete.title}"</span> ออกจากรายการหรือไม่?
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBillToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBill(billToDelete.id)}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition shadow-md shadow-rose-500/25"
              >
                ลบบิล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ชำระเงินผ่าน PromptPay */}
      {showPromptPayModal && selectedBillForPay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-3.5 border border-slate-100 animate-scale-up">
            <div className="flex justify-between items-center">
              <h4 className="text-base font-bold text-slate-900">ชำระเงินผ่าน PromptPay</h4>
              <button
                type="button"
                onClick={() => setShowPromptPayModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-center space-y-3">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col items-center">
                <div className="w-36 h-36 bg-white border-2 border-indigo-600 rounded-xl p-2 flex flex-col items-center justify-center shadow-inner relative">
                  <div className="text-[10px] font-bold text-indigo-700 tracking-wider mb-1">
                    PROMPTPAY QR
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 w-24 h-24 bg-slate-900 p-2 rounded-lg">
                    <div className="bg-white rounded-sm col-span-2 row-span-2"></div>
                    <div className="bg-white rounded-sm col-span-1"></div>
                    <div className="bg-white rounded-sm col-span-2 row-span-2"></div>
                    <div className="bg-white rounded-sm col-span-1"></div>
                    <div className="bg-white rounded-sm col-span-1"></div>
                    <div className="bg-white rounded-sm col-span-2 row-span-2"></div>
                    <div className="bg-white rounded-sm col-span-1"></div>
                    <div className="bg-white rounded-sm col-span-2 row-span-2"></div>
                  </div>
                </div>

                <div className="mt-2.5">
                  <p className="text-xs text-slate-500 font-medium">ยอดเงินที่ต้องโอน</p>
                  <p className="text-2xl font-extrabold text-slate-900">
                    ฿{selectedBillForPay.perPerson.toLocaleString('th-TH')}.00
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ผู้รับ: สมชาย ใจดี (คนสำรองจ่าย)
                  </p>
                </div>
              </div>
            </div>

            {/* ปุ่มเปิด Smart Slip Scanner เดียวกับหน้าหลัก */}
            <button
              type="button"
              onClick={() => {
                setShowPromptPayModal(false);
                handleOpenSmartSlipScanner(selectedBillForPay);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center gap-2 border border-indigo-200 transition"
            >
              <span className="material-symbols-outlined text-base">photo_camera</span>
              <span>สแกนสลิปโอนเงิน (Smart Slip) เพื่อตัดยอด</span>
            </button>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowPromptPayModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleConfirmPayment}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition shadow-md shadow-emerald-500/25"
              >
                ยืนยันการโอน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal สร้างบิลใหม่ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h4 className="text-base font-bold text-slate-900">สร้างบิลหารกับเพื่อน</h4>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBill} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">เลือกไอคอนบิล</label>
                <div className="flex gap-2">
                  {['🍲', '⚡', '☕', '🍕', '🚗', '🛒', '🍻', '🎬'].map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setNewIcon(icon)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border transition ${
                        newIcon === icon
                          ? 'border-emerald-500 bg-emerald-50 scale-105 shadow-xs'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ชื่อบิล / รายการ</label>
                <input
                  type="text"
                  placeholder="เช่น ชาบูกับเพื่อน, ค่าห้อง, บิลค่าไฟ"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ยอดเงินรวมทั้งหมด (฿)</label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400 font-bold">฿</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newTotal}
                    onChange={(e) => setNewTotal(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-slate-700">จำนวนคนหาร (รวมตัวคุณ)</label>
                  <span className="font-extrabold text-emerald-600">{newPeopleCount} คน</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handlePeopleCountChange(newPeopleCount - 1)}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-sm"
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min="2"
                    max="8"
                    value={newPeopleCount}
                    onChange={(e) => handlePeopleCountChange(parseInt(e.target.value))}
                    className="flex-1 accent-emerald-500 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => handlePeopleCountChange(newPeopleCount + 1)}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-sm"
                  >
                    +
                  </button>
                </div>
              </div>

              {parseFloat(newTotal) > 0 && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[11px]">ยอดหารเฉลี่ย</p>
                  <p className="text-lg font-black text-emerald-700">
                    คนละ ฿{Math.round(parseFloat(newTotal) / newPeopleCount).toLocaleString('th-TH')}
                  </p>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">รายชื่อเพื่อนที่หาร</label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {friendNames.map((name, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={name}
                        placeholder={`ชื่อเพื่อนคนที่ ${index + 1}`}
                        onChange={(e) => {
                          const updated = [...friendNames];
                          updated[index] = e.target.value;
                          setFriendNames(updated);
                        }}
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-slate-950 text-white font-bold hover:bg-slate-800 transition shadow-md"
                >
                  สร้างบิล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
