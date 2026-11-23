import { createClient } from '@supabase/supabase-js';

// ============================================================================
// รายชื่ออีเมลที่ได้สิทธิ์ Admin อัตโนมัติ (สามารถเพิ่มในอนาคตได้ที่นี่, ใน .env หรือในหน้า Admin)
// ============================================================================
export const DEFAULT_ADMIN_EMAILS = [
  'sethawut.ton@spumail.net',
  'sethawut.ton@spumail.com',
  'sethawuttongpath2@gmail.com',
];

export const getAdminEmails = () => {
  const envEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  let customEmails = [];
  try {
    customEmails = JSON.parse(localStorage.getItem('monetech_custom_admin_emails') || '[]');
  } catch {
    customEmails = [];
  }

  return Array.from(
    new Set([
      ...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()),
      ...envEmails,
      ...customEmails.map((e) => String(e).trim().toLowerCase()),
    ])
  ).filter(Boolean);
};

export const isEmailAdmin = (email, fullName = '') => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(fullName || '').trim().toLowerCase();
  if (cleanEmail && getAdminEmails().includes(cleanEmail)) return true;
  if (cleanName.includes('admin')) return true;
  return false;
};

export const addCustomAdminEmail = (email) => {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return getAdminEmails();
  let customEmails = [];
  try {
    customEmails = JSON.parse(localStorage.getItem('monetech_custom_admin_emails') || '[]');
  } catch {
    customEmails = [];
  }
  if (!customEmails.includes(clean)) {
    customEmails.push(clean);
    localStorage.setItem('monetech_custom_admin_emails', JSON.stringify(customEmails));
  }
  return getAdminEmails();
};

export const removeCustomAdminEmail = (email) => {
  const clean = String(email || '').trim().toLowerCase();
  let customEmails = [];
  try {
    customEmails = JSON.parse(localStorage.getItem('monetech_custom_admin_emails') || '[]');
  } catch {
    customEmails = [];
  }
  const filtered = customEmails.filter((e) => e.toLowerCase() !== clean);
  localStorage.setItem('monetech_custom_admin_emails', JSON.stringify(filtered));
  return getAdminEmails();
};

// อ่านค่าจาก .env หรือค่าที่ตั้งไว้ผ่านหน้าเว็บ (localStorage)
const getSupabaseConfig = () => {
  const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

  const localUrl = localStorage.getItem('monetech_supabase_url')?.trim() || '';
  const localKey = localStorage.getItem('monetech_supabase_anon_key')?.trim() || '';

  const url = envUrl || localUrl;
  const anonKey = envKey || localKey;

  const isConfigured =
    Boolean(url && anonKey) &&
    url.startsWith('http') &&
    !url.includes('YOUR_SUPABASE');

  return { url, anonKey, isConfigured };
};

let supabaseInstance = null;

export const getSupabase = () => {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  if (!supabaseInstance) {
    supabaseInstance = createClient(url, anonKey);
  }
  return supabaseInstance;
};

export const isSupabaseConfigured = () => getSupabaseConfig().isConfigured;

export const saveSupabaseConfig = (url, anonKey) => {
  localStorage.setItem('monetech_supabase_url', url.trim());
  localStorage.setItem('monetech_supabase_anon_key', anonKey.trim());
  supabaseInstance = null;
};

export const clearSupabaseConfig = () => {
  localStorage.removeItem('monetech_supabase_url');
  localStorage.removeItem('monetech_supabase_anon_key');
  supabaseInstance = null;
};

// ============================================================================
// 1. ระบบสมาชิก (Authentication: Register / Login / Logout / Profile / Role)
// ============================================================================

export async function registerWithDatabase({ fullName, email, password }) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName.trim();
  const assignedRole = isEmailAdmin(cleanEmail, cleanName) ? 'admin' : 'user';
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
          role: assignedRole,
        },
      },
    });

    if (error) {
      throw new Error(translateAuthError(error.message));
    }

    const user = data?.user;
    if (user) {
      const nowIso = new Date().toISOString();
      const profilePayload = {
        id: user.id,
        email: cleanEmail,
        full_name: cleanName,
        role: assignedRole,
        is_online: true,
        last_seen: nowIso,
        locked_savings: 0,
        monthly_budget: 9000,
        daily_limit: 400,
        updated_at: nowIso,
      };

      // พยายามบันทึกโปรไฟล์พร้อมคอลัมน์ role / is_online (และ fallback หากตารางยังไม่ได้รัน SQL อัปเกรด)
      const { error: upsertErr } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      if (upsertErr) {
        await supabase.from('profiles').upsert(
          {
            id: user.id,
            email: cleanEmail,
            full_name: cleanName,
            locked_savings: 0,
            monthly_budget: 9000,
            daily_limit: 400,
            updated_at: nowIso,
          },
          { onConflict: 'id' }
        );
      }

      const userProfile = {
        id: user.id,
        email: cleanEmail,
        fullName: cleanName,
        role: assignedRole,
        isOnline: true,
        lastSeen: nowIso,
        avatarUrl: null,
        lockedSavings: 0,
        monthlyBudget: 9000,
        dailyLimit: 400,
      };

      localStorage.setItem('monetech_active_user', JSON.stringify(userProfile));

      return {
        user: userProfile,
        session: data.session,
        requiresEmailConfirmation: !data.session,
        source: 'supabase',
      };
    }
  }

  // Fallback กรณีที่ยังไม่ได้ใส่ Supabase URL/Key
  const usersDb = JSON.parse(localStorage.getItem('monetech_local_users_db') || '[]');
  const existing = usersDb.find((u) => u.email === cleanEmail);
  if (existing) {
    throw new Error('อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่นหรือเข้าสู่ระบบ');
  }

  const nowIso = new Date().toISOString();
  const newUser = {
    id: `local-${Date.now()}`,
    email: cleanEmail,
    password,
    fullName: cleanName,
    role: assignedRole,
    isOnline: true,
    lastSeen: nowIso,
    avatarUrl: null,
    lockedSavings: 0,
    monthlyBudget: 9000,
    dailyLimit: 400,
    createdAt: nowIso,
  };

  usersDb.push(newUser);
  localStorage.setItem('monetech_local_users_db', JSON.stringify(usersDb));
  const { password: _, ...safeUser } = newUser;
  localStorage.setItem('monetech_active_user', JSON.stringify(safeUser));

  return {
    user: safeUser,
    session: { user: safeUser },
    requiresEmailConfirmation: false,
    source: 'local',
  };
}

export async function loginWithDatabase({ email, password }) {
  const cleanEmail = email.trim().toLowerCase();
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      throw new Error(translateAuthError(error.message));
    }

    const user = data?.user;
    const profile = await fetchUserProfile(user.id, user);
    await updateUserOnlineStatus(user.id, true);
    localStorage.setItem('monetech_active_user', JSON.stringify(profile));

    return {
      user: profile,
      session: data.session,
      source: 'supabase',
    };
  }

  // Fallback กรณีที่ยังไม่ได้ใส่ Supabase URL/Key
  const usersDb = JSON.parse(localStorage.getItem('monetech_local_users_db') || '[]');
  const foundUser = usersDb.find((u) => u.email === cleanEmail && u.password === password);

  if (!foundUser) {
    throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง (หรือยังไม่ได้ลงทะเบียน)');
  }

  const role = isEmailAdmin(cleanEmail) ? 'admin' : foundUser.role || 'user';
  const nowIso = new Date().toISOString();
  const updatedUser = { ...foundUser, role, isOnline: true, lastSeen: nowIso };
  const { password: _, ...safeUser } = updatedUser;
  localStorage.setItem('monetech_active_user', JSON.stringify(safeUser));

  return {
    user: safeUser,
    session: { user: safeUser },
    source: 'local',
  };
}

export async function logoutFromDatabase(userId) {
  if (userId) {
    await updateUserOnlineStatus(userId, false);
  }
  const supabase = getSupabase();
  if (supabase) {
    await supabase.auth.signOut();
  }
  localStorage.removeItem('monetech_active_user');
}

export async function fetchUserProfile(userId, authUser = null) {
  const supabase = getSupabase();
  const fallbackEmail = (authUser?.email || '').trim().toLowerCase();

  if (supabase && userId && !String(userId).startsWith('local-')) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      const email = (data.email || fallbackEmail).toLowerCase();
      const fullName = data.full_name || authUser?.user_metadata?.full_name || 'ผู้ใช้งาน';
      const shouldBeAdmin = isEmailAdmin(email, fullName) || data.role === 'admin';
      const resolvedRole = shouldBeAdmin ? 'admin' : data.role || 'user';

      // หากอีเมลอยู่ในรายชื่อ Admin แต่ใน DB ยังเป็น user ให้อัปเดตเป็น admin ทันที
      if (shouldBeAdmin && data.role !== 'admin') {
        await supabase
          .from('profiles')
          .update({ role: 'admin', is_online: true, last_seen: new Date().toISOString() })
          .eq('id', userId);
      }

      return {
        id: data.id,
        email,
        fullName,
        role: resolvedRole,
        isOnline: true,
        lastSeen: data.last_seen || new Date().toISOString(),
        avatarUrl: data.avatar_url || null,
        lockedSavings: Number(data.locked_savings) || 0,
        monthlyBudget: Number(data.monthly_budget) || 9000,
        dailyLimit: Number(data.daily_limit) || 400,
        createdAt: data.created_at,
      };
    }

    // ถ้ายังไม่มีแถวใน profiles ให้สร้างอัตโนมัติ
    const assignedRole = isEmailAdmin(fallbackEmail) ? 'admin' : 'user';
    const nowIso = new Date().toISOString();
    const defaultProfile = {
      id: userId,
      email: fallbackEmail,
      full_name: authUser?.user_metadata?.full_name || 'ผู้ใช้งาน',
      role: assignedRole,
      is_online: true,
      last_seen: nowIso,
      locked_savings: 0,
      monthly_budget: 9000,
      daily_limit: 400,
    };
    await supabase.from('profiles').upsert(defaultProfile, { onConflict: 'id' });

    return {
      id: userId,
      email: defaultProfile.email,
      fullName: defaultProfile.full_name,
      role: assignedRole,
      isOnline: true,
      lastSeen: nowIso,
      avatarUrl: null,
      lockedSavings: 0,
      monthlyBudget: 9000,
      dailyLimit: 400,
    };
  }

  const saved = localStorage.getItem('monetech_active_user');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && isEmailAdmin(parsed.email)) {
        parsed.role = 'admin';
      }
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export async function updateUserOnlineStatus(userId, isOnline) {
  if (!userId) return;
  const nowIso = new Date().toISOString();
  const supabase = getSupabase();

  if (supabase && !String(userId).startsWith('local-')) {
    await supabase
      .from('profiles')
      .update({
        is_online: Boolean(isOnline),
        last_seen: nowIso,
      })
      .eq('id', userId);
  }
}

// ระบบ Realtime Presence ตรวจจับผู้ใช้ออนไลน์แบบสด (Live Online Users)
export function subscribeToOnlinePresence(currentUser, onPresenceSync) {
  const supabase = getSupabase();
  if (!supabase || !currentUser?.id) return () => {};

  const channel = supabase.channel('monetech-online-users', {
    config: {
      presence: {
        key: String(currentUser.id),
      },
    },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const onlineIds = Object.keys(state);
      if (onPresenceSync) {
        onPresenceSync(onlineIds, state);
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: currentUser.id,
          email: currentUser.email,
          full_name: currentUser.fullName,
          role: currentUser.role || 'user',
          online_at: new Date().toISOString(),
        });
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function checkUserEmailExists(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return false;

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (!error && data) return true;
  }

  const localDb = JSON.parse(localStorage.getItem('monetech_local_users_db') || '[]');
  return localDb.some((u) => u.email?.toLowerCase() === cleanEmail);
}

export async function resetUserPasswordDirect({ email, currentPassword, newPassword, userId }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(newPassword || '').trim();

  if (!cleanPassword || cleanPassword.length < 6) {
    throw new Error('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
  }

  const supabase = getSupabase();
  let updatedInSupabase = false;

  if (supabase && cleanEmail) {
    // 1. ถ้ามี currentPassword ให้ตรวจสอบก่อนว่ารหัสผ่านปัจจุบันถูกต้องหรือไม่
    if (currentPassword) {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: currentPassword,
      });
      if (verifyErr) {
        throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
      }
    }

    // 2. พยายามอัปเดตรหัสผ่านผ่าน Supabase Auth Client
    try {
      const { data: updateData, error: updateErr } = await supabase.auth.updateUser({
        password: cleanPassword,
      });
      if (!updateErr && updateData?.user) {
        updatedInSupabase = true;
      }
    } catch (e) {
      console.warn('supabase.auth.updateUser notice:', e);
    }

    // 3. เรียก RPC reset_password_direct ใน PostgreSQL เพื่ออัปเดตรหัสผ่านตรงเข้า auth.users
    try {
      const { data: rpcSuccess, error: rpcErr } = await supabase.rpc('reset_password_direct', {
        user_email: cleanEmail,
        new_password: cleanPassword,
      });
      if (!rpcErr && rpcSuccess) {
        updatedInSupabase = true;
      }
    } catch (rpcEx) {
      console.warn('RPC reset_password_direct notice:', rpcEx);
    }
  }

  // 4. อัปเดตใน Local Database เสมอ
  let updatedInLocal = false;
  try {
    const localDb = JSON.parse(localStorage.getItem('monetech_local_users_db') || '[]');
    let found = false;
    const updatedDb = localDb.map((u) => {
      const match = (cleanEmail && u.email?.toLowerCase() === cleanEmail) || (userId && u.id === userId);
      if (match) {
        found = true;
        updatedInLocal = true;
        return { ...u, password: cleanPassword };
      }
      return u;
    });
    if (found) {
      localStorage.setItem('monetech_local_users_db', JSON.stringify(updatedDb));
    }
  } catch (err) {
    console.error('Local db password update error:', err);
  }

  // 5. อัปเดต active user ใน localStorage
  try {
    const active = JSON.parse(localStorage.getItem('monetech_active_user') || '{}');
    if (active && ((cleanEmail && active.email?.toLowerCase() === cleanEmail) || (userId && active.id === userId))) {
      active.password = cleanPassword;
      localStorage.setItem('monetech_active_user', JSON.stringify(active));
    }
  } catch {}

  if (!updatedInSupabase && !updatedInLocal && !supabase) {
    throw new Error('ไม่พบข้อมูลบัญชีผู้ใช้ในระบบ');
  }

  return true;
}

export async function updateUserProfileInDatabase(userId, updates) {
  const current = JSON.parse(localStorage.getItem('monetech_active_user') || '{}');
  const userEmail = updates.email || current?.email;

  // จัดการเปลี่ยนรหัสผ่านถ้ามีการส่ง newPassword เข้ามา
  if (updates.newPassword) {
    await resetUserPasswordDirect({
      email: userEmail,
      currentPassword: updates.currentPassword,
      newPassword: updates.newPassword,
      userId,
    });
  }

  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    const dbPayload = {
      updated_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    };
    if (updates.fullName !== undefined) dbPayload.full_name = updates.fullName;
    if (updates.avatarUrl !== undefined) dbPayload.avatar_url = updates.avatarUrl;
    if (updates.lockedSavings !== undefined) dbPayload.locked_savings = Number(updates.lockedSavings) || 0;
    if (updates.monthlyBudget !== undefined) dbPayload.monthly_budget = Number(updates.monthlyBudget) || 9000;
    if (updates.dailyLimit !== undefined) dbPayload.daily_limit = Number(updates.dailyLimit) || 400;
    if (updates.role !== undefined) dbPayload.role = updates.role;

    const { error } = await supabase
      .from('profiles')
      .update(dbPayload)
      .eq('id', userId);

    if (error) {
      throw new Error(error.message);
    }
  } else if (userId) {
    const usersDb = JSON.parse(localStorage.getItem('monetech_local_users_db') || '[]');
    const updatedDb = usersDb.map((u) => {
      if (u.id === userId) {
        return {
          ...u,
          fullName: updates.fullName !== undefined ? updates.fullName : u.fullName,
          avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : u.avatarUrl,
          lockedSavings: updates.lockedSavings !== undefined ? updates.lockedSavings : u.lockedSavings,
          monthlyBudget: updates.monthlyBudget !== undefined ? updates.monthlyBudget : u.monthlyBudget,
          dailyLimit: updates.dailyLimit !== undefined ? updates.dailyLimit : u.dailyLimit,
          role: updates.role !== undefined ? updates.role : u.role,
        };
      }
      return u;
    });
    localStorage.setItem('monetech_local_users_db', JSON.stringify(updatedDb));
  }

  const nextUser = {
    ...current,
    ...(updates.fullName !== undefined ? { fullName: updates.fullName } : {}),
    ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
    ...(updates.lockedSavings !== undefined ? { lockedSavings: updates.lockedSavings } : {}),
    ...(updates.monthlyBudget !== undefined ? { monthlyBudget: updates.monthlyBudget } : {}),
    ...(updates.dailyLimit !== undefined ? { dailyLimit: updates.dailyLimit } : {}),
    ...(updates.role !== undefined ? { role: updates.role } : {}),
  };
  localStorage.setItem('monetech_active_user', JSON.stringify(nextUser));
  return nextUser;
}

// ============================================================================
// 2. ระบบจัดการข้อมูลสำหรับ Admin (Admin Dashboard Queries & Actions)
// ============================================================================

export async function fetchAllUsersForAdmin() {
  const supabase = getSupabase();
  if (supabase) {
    const [{ data: profilesData, error: pErr }, { data: txData }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('transactions').select('*'),
    ]);

    if (!pErr && Array.isArray(profilesData)) {
      const txList = Array.isArray(txData) ? txData : [];
      const now = Date.now();

      const mappedUsers = profilesData
        .map((p) => {
          const userTxs = txList.filter((t) => String(t.user_id) === String(p.id));
          const totalAmount = userTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
          const totalIncome = userTxs
            .filter((t) => t.type === 'income')
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
          const totalExpense = userTxs
            .filter((t) => t.type !== 'income')
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
          const lockedSavings = Number(p.locked_savings) || 0;
          const availableBalance = Math.max(0, totalIncome - lockedSavings - totalExpense);
          const lastSeenTime = p.last_seen ? new Date(p.last_seen).getTime() : 0;
          // ถือว่าออนไลน์ถ้า is_online = true และมีการอัปเดตภายใน 3 นาทีล่าสุด
          const isRecentlyActive = Boolean(p.is_online) && (now - lastSeenTime < 3 * 60 * 1000);
          const displayFullName =
            p.full_name ||
            p.username ||
            p.name ||
            p.display_name ||
            (p.email ? p.email.split('@')[0] : 'ไม่ระบุชื่อ');
          const emailLower = (p.email || '').toLowerCase();
          const role =
            isEmailAdmin(emailLower, displayFullName) || p.role === 'admin' ? 'admin' : 'user';

          return {
            id: p.id,
            email: p.email || '-',
            fullName: displayFullName,
            avatarUrl: p.avatar_url || null,
            role,
            isOnline: isRecentlyActive,
            rawIsOnline: Boolean(p.is_online),
            lastSeen: p.last_seen || p.updated_at || p.created_at,
            createdAt: p.created_at || p.updated_at,
            lockedSavings,
            monthlyBudget: Number(p.monthly_budget) || 9000,
            dailyLimit: Number(p.daily_limit) || 400,
            transactionCount: userTxs.length,
            totalSlipAmount: totalAmount,
            totalIncome,
            totalExpense,
            availableBalance,
            transactions: userTxs.map((t) => ({
              id: t.id,
              title: t.title,
              amount: Number(t.amount) || 0,
              category: t.category || 'other',
              type: t.type || 'expense',
              date: t.date || 'วันนี้',
              timestamp: Number(t.timestamp) || Date.now(),
            })),
          };
        })
        .sort((a, b) => {
          const tA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
          const tB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
          return tB - tA;
        });

      // ซิงก์ข้อมูลสรุปลงตาราง admin_user_dashboard บน Supabase เพื่อให้เปิดดูใน Table Editor ได้เหมือนหน้า Admin เป๊ะๆ
      if (mappedUsers.length > 0) {
        const dashboardRows = mappedUsers.map((u) => ({
          user_id: u.id,
          full_name: u.fullName,
          email: u.email,
          role_badge: u.role === 'admin' ? '👑 ADMIN' : '👤 USER',
          online_status: u.isOnline ? '🟢 ออนไลน์' : '⚪ ออฟไลน์',
          total_slip_amount: u.totalSlipAmount,
          locked_savings: u.lockedSavings,
          transaction_count: u.transactionCount,
          total_income: u.totalIncome,
          total_expense: u.totalExpense,
          available_balance: u.availableBalance,
          last_seen: u.lastSeen || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        Promise.resolve(
          supabase
            .from('admin_user_dashboard')
            .upsert(dashboardRows, { onConflict: 'user_id' })
        ).catch(() => {});
      }

      return mappedUsers;
    }
  }

  // Fallback local
  const usersDb = JSON.parse(localStorage.getItem('monetech_local_users_db') || '[]');
  return usersDb.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName || 'ผู้ใช้งาน',
    avatarUrl: u.avatarUrl || null,
    role: isEmailAdmin(u.email) ? 'admin' : u.role || 'user',
    isOnline: Boolean(u.isOnline),
    lastSeen: u.lastSeen || u.createdAt,
    createdAt: u.createdAt,
    lockedSavings: Number(u.lockedSavings) || 0,
    monthlyBudget: Number(u.monthlyBudget) || 9000,
    dailyLimit: Number(u.dailyLimit) || 400,
    transactionCount: 0,
    totalSlipAmount: 0,
    transactions: [],
  }));
}

export async function updateUserRoleByAdmin(targetUserId, newRole, targetEmail = '') {
  if (newRole === 'admin' && targetEmail) {
    addCustomAdminEmail(targetEmail);
  } else if (newRole === 'user' && targetEmail) {
    removeCustomAdminEmail(targetEmail);
  }

  const supabase = getSupabase();
  if (supabase && targetUserId && !String(targetUserId).startsWith('local-')) {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', targetUserId);
    if (error) throw new Error(error.message);
  }
}

export function cleanupLocalUserData(targetUserId) {
  if (!targetUserId) return;
  try {
    const localDb = JSON.parse(localStorage.getItem('monetech_local_users_db') || '[]');
    const filtered = localDb.filter((u) => String(u.id) !== String(targetUserId));
    localStorage.setItem('monetech_local_users_db', JSON.stringify(filtered));
  } catch {}

  localStorage.removeItem(`monetech_transactions_${targetUserId}`);
  localStorage.removeItem(`monetech_goals_${targetUserId}`);
  localStorage.removeItem(`monetech_split_bills_${targetUserId}`);
  localStorage.removeItem(`monetech_deleted_split_bills_${targetUserId}`);
}

export async function deleteUserByAdmin(targetUserId) {
  const supabase = getSupabase();
  if (supabase && targetUserId && !String(targetUserId).startsWith('local-')) {
    // 1. เรียกใช้ RPC delete_user_by_admin เพื่อลบอย่างหมดจดถึง auth.users และข้ามข้อจำกัด RLS
    let rpcDeleted = false;
    try {
      const { data: rpcSuccess, error: rpcErr } = await supabase.rpc('delete_user_by_admin', {
        target_user_id: targetUserId,
      });
      if (!rpcErr && rpcSuccess) {
        rpcDeleted = true;
      } else if (rpcErr) {
        console.warn('RPC delete_user_by_admin notice:', rpcErr.message);
      }
    } catch (e) {
      console.warn('RPC delete notice:', e);
    }

    // 2. ลบออกจากทุกตารางที่เกี่ยวข้อง เพื่อความมั่นใจว่าข้อมูลไม่ค้าง
    try {
      await supabase.from('admin_user_dashboard').delete().eq('user_id', targetUserId);
    } catch {}
    try {
      await supabase.from('issue_reports').delete().eq('user_id', targetUserId);
    } catch {}
    try {
      await supabase.from('transactions').delete().eq('user_id', targetUserId);
    } catch {}
    try {
      await supabase.from('goals').delete().eq('user_id', targetUserId);
    } catch {}
    try {
      await supabase.from('split_bills').delete().eq('user_id', targetUserId);
    } catch {}

    const { error: profileErr } = await supabase.from('profiles').delete().eq('id', targetUserId);
    if (profileErr && !rpcDeleted) {
      console.error('Delete user profiles error:', profileErr);
      throw new Error(profileErr.message);
    }
  }

  // 3. เคลียร์ข้อมูลในเครื่อง LocalStorage เสมอ
  cleanupLocalUserData(targetUserId);
  return true;
}

export async function fetchAllIssueReportsForAdmin() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('issue_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      return data;
    }
  }
  return [];
}

export async function updateIssueReportStatusByAdmin(reportId, status) {
  const supabase = getSupabase();
  if (supabase && reportId) {
    const { error } = await supabase
      .from('issue_reports')
      .update({ status })
      .eq('id', reportId);
    if (error) throw new Error(error.message);
  }
}

export async function deleteIssueReportByAdmin(reportId) {
  const supabase = getSupabase();
  if (supabase && reportId) {
    const { error } = await supabase.from('issue_reports').delete().eq('id', reportId);
    if (error) throw new Error(error.message);
  }
}

// ============================================================================
// 3. ระบบจัดการข้อมูลธุรกรรม / ประวัติสลิป (Transactions)
// ============================================================================

export async function fetchUserTransactions(userId) {
  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (!error && Array.isArray(data)) {
      return data.map((row) => ({
        id: row.id,
        title: row.title,
        amount: Number(row.amount) || 0,
        category: row.category || 'other',
        type: row.type || 'expense',
        date: row.date || 'วันนี้',
        dayOfWeek: row.day_of_week,
        timestamp: Number(row.timestamp) || Date.now(),
      }));
    }
  }

  const key = userId ? `monetech_transactions_${userId}` : 'monetech_transactions';
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  }
  return [];
}

export async function insertUserTransaction(userId, transaction) {
  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    const payload = {
      id: String(transaction.id),
      user_id: userId,
      title: transaction.title,
      amount: Number(transaction.amount) || 0,
      category: transaction.category || 'other',
      type: transaction.type || 'expense',
      date: transaction.date || 'วันนี้',
      day_of_week: transaction.dayOfWeek ?? new Date().getDay(),
      timestamp: transaction.timestamp || Date.now(),
    };
    const { error } = await supabase.from('transactions').upsert(payload, { onConflict: 'id' });
    if (error) console.error('Supabase insertTransaction error:', error);
  }
}

export async function deleteUserTransaction(userId, transactionId) {
  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', String(transactionId))
      .eq('user_id', userId);
    if (error) console.error('Supabase deleteTransaction error:', error);
  }
}

export async function clearAllUserTransactions(userId) {
  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId);
    if (error) console.error('Supabase clearAllTransactions error:', error);
  }
}

// ============================================================================
// 4. ระบบจัดการเป้าหมายการออม (Goals)
// ============================================================================

export async function fetchUserGoals(userId, fallbackGoals = []) {
  const key = userId ? `monetech_goals_${userId}` : 'monetech_goals';
  let localGoals = [];
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        localGoals = parsed.filter(
          (g) => g.id !== 'goal-1' && g.id !== 'goal-2' && !String(g.id).endsWith('_goal-1') && !String(g.id).endsWith('_goal-2')
        );
      }
    } catch {
      localGoals = fallbackGoals;
    }
  }

  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!error && Array.isArray(data)) {
      if (data.length > 0) {
        const dbGoals = data
          .filter(
            (g) => g.id !== 'goal-1' && g.id !== 'goal-2' && !String(g.id).endsWith('_goal-1') && !String(g.id).endsWith('_goal-2')
          )
          .map((g) => ({
            id: g.id,
            title: g.title,
            icon: g.icon || '🎯',
            current: Number(g.current) || 0,
            target: Number(g.target) || 0,
            color: g.color || 'indigo',
            note: g.note || '',
          }));
        const mergedMap = new Map();
        localGoals.forEach((g) => mergedMap.set(String(g.id), g));
        dbGoals.forEach((g) => {
          if (!mergedMap.has(String(g.id))) mergedMap.set(String(g.id), g);
        });
        return Array.from(mergedMap.values());
      }
      return localGoals;
    }
  }

  return localGoals;
}

export async function upsertUserGoal(userId, goal) {
  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    const payload = {
      id: String(goal.id),
      user_id: userId,
      title: goal.title,
      icon: goal.icon || '🎯',
      current: Number(goal.current) || 0,
      target: Number(goal.target) || 0,
      color: goal.color || 'indigo',
      note: goal.note || '',
    };
    const { error } = await supabase.from('goals').upsert(payload, { onConflict: 'id' });
    if (error) console.error('Supabase upsertGoal error:', error);
  }
}

export async function deleteUserGoal(userId, goalId) {
  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', String(goalId))
      .eq('user_id', userId);
    if (error) console.error('Supabase deleteGoal error:', error);
  }
}

// ============================================================================
// 5. ระบบจัดการหารบิล (Split Bills)
// ============================================================================

const isMockupSplitBill = (b) => {
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

function getDeletedSplitBillIds(userId) {
  const key = userId ? `monetech_deleted_split_bills_${userId}` : 'monetech_deleted_split_bills';
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function addDeletedSplitBillIds(userId, ids) {
  const key = userId ? `monetech_deleted_split_bills_${userId}` : 'monetech_deleted_split_bills';
  const set = getDeletedSplitBillIds(userId);
  ids.forEach((id) => set.add(String(id)));
  localStorage.setItem(key, JSON.stringify(Array.from(set)));
}

export async function fetchUserSplitBills(userId) {
  localStorage.removeItem('monetech_split_bills');
  const key = userId ? `monetech_split_bills_${userId}` : 'monetech_split_bills';
  const deletedSet = getDeletedSplitBillIds(userId);

  let localBills = [];
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        localBills = parsed.filter(
          (b) => !isMockupSplitBill(b) && !deletedSet.has(String(b?.id))
        );
      }
    } catch {
      localBills = [];
    }
  }

  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    const { data, error } = await supabase
      .from('split_bills')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      // ลบบิลตัวอย่าง (mockup) หรือบิลที่ผู้ใช้สั่งลบไปแล้วออกจากฐานข้อมูลอัตโนมัติ
      const obsoleteRows = data.filter(
        (b) => isMockupSplitBill(b) || deletedSet.has(String(b?.id))
      );
      if (obsoleteRows.length > 0) {
        await supabase
          .from('split_bills')
          .delete()
          .eq('user_id', userId)
          .in(
            'id',
            obsoleteRows.map((m) => m.id)
          );
      }

      const dbBills = data
        .filter((b) => !isMockupSplitBill(b) && !deletedSet.has(String(b?.id)))
        .map((b) => ({
          id: b.id,
          title: b.title,
          icon: b.icon || '🍲',
          iconBg: b.icon_bg || 'bg-[#ffedd5]/80',
          iconColor: b.icon_color || '',
          totalAmount: Number(b.total_amount) || 0,
          perPerson: Number(b.per_person) || 0,
          statusBadge: b.status_badge || '',
          statusType: b.status_type || 'pending',
          actionType: b.action_type || 'scan_promptpay',
          actionLabel: b.action_label || '',
          isPaid: Boolean(b.is_paid),
          members: Array.isArray(b.members) ? b.members : [],
        }));

      // รวมข้อมูลจาก localStorage (เผื่อบิลที่เพิ่งสร้างสดๆ) กับข้อมูลบน Database โดยไม่ให้บิลที่เพิ่งสร้างหาย
      const mergedMap = new Map();
      localBills.forEach((b) => mergedMap.set(String(b.id), b));
      dbBills.forEach((b) => {
        if (!mergedMap.has(String(b.id))) {
          mergedMap.set(String(b.id), b);
        }
      });

      const merged = Array.from(mergedMap.values());
      localStorage.setItem(key, JSON.stringify(merged));
      return merged;
    }
  }

  localStorage.setItem(key, JSON.stringify(localBills));
  return localBills;
}

export async function syncUserSplitBills(userId, bills) {
  const deletedSet = getDeletedSplitBillIds(userId);
  const cleanBills = (Array.isArray(bills) ? bills : []).filter(
    (b) => !isMockupSplitBill(b) && !deletedSet.has(String(b?.id))
  );
  const key = userId ? `monetech_split_bills_${userId}` : 'monetech_split_bills';
  localStorage.setItem(key, JSON.stringify(cleanBills));

  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    const rows = cleanBills.map((b) => ({
      id: String(b.id),
      user_id: userId,
      title: b.title,
      icon: b.icon || '🍲',
      icon_bg: b.iconBg || 'bg-[#ffedd5]/80',
      icon_color: b.iconColor || '',
      total_amount: Number(b.totalAmount) || 0,
      per_person: Number(b.perPerson) || 0,
      status_badge: b.statusBadge || '',
      status_type: b.statusType || 'pending',
      action_type: b.actionType || 'scan_promptpay',
      action_label: b.actionLabel || '',
      is_paid: Boolean(b.isPaid),
      members: Array.isArray(b.members) ? b.members : [],
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from('split_bills').upsert(rows, { onConflict: 'id' });
      if (error) console.error('Supabase syncUserSplitBills error:', error);
    }
  }
}

export async function deleteUserSplitBill(userId, billId) {
  addDeletedSplitBillIds(userId, [String(billId), `${userId}_${billId}`]);
  const key = userId ? `monetech_split_bills_${userId}` : 'monetech_split_bills';
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        localStorage.setItem(
          key,
          JSON.stringify(parsed.filter((b) => String(b?.id) !== String(billId)))
        );
      }
    }
  } catch {
    // ignore parse error
  }

  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    await supabase
      .from('split_bills')
      .delete()
      .in('id', [String(billId), `${userId}_${billId}`])
      .eq('user_id', userId);
  }
}

export async function clearAllUserSplitBills(userId) {
  const key = userId ? `monetech_split_bills_${userId}` : 'monetech_split_bills';
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        addDeletedSplitBillIds(
          userId,
          parsed.map((b) => String(b?.id))
        );
      }
    }
  } catch {
    // ignore
  }
  localStorage.setItem(key, JSON.stringify([]));
  localStorage.removeItem('monetech_split_bills');

  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    await supabase.from('split_bills').delete().eq('user_id', userId);
  }
}

// ============================================================================
// 6. ระบบแจ้งปัญหา (Issue Reports)
// ============================================================================

export async function submitUserIssueReport(userId, { issueType, description, attachedFiles, userEmail, userName }) {
  const supabase = getSupabase();
  if (supabase && userId && !String(userId).startsWith('local-')) {
    const payload = {
      user_id: userId,
      user_email: userEmail || '',
      user_name: userName || '',
      issue_type: issueType,
      description,
      status: 'pending',
      attached_files: attachedFiles || [],
    };
    const { error } = await supabase.from('issue_reports').insert(payload);
    if (error) {
      // Fallback กรณียังไม่ได้อัปเกรดคอลัมน์ user_email / status
      await supabase.from('issue_reports').insert({
        user_id: userId,
        issue_type: issueType,
        description,
        attached_files: attachedFiles || [],
      });
    }
  }
}

// แปลข้อความ Error จาก Supabase เป็นภาษาไทยที่เข้าใจง่าย
function translateAuthError(msg = '') {
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'อีเมลนี้ถูกลงทะเบียนไว้แล้ว กรุณาเข้าสู่ระบบ';
  }
  if (lower.includes('password should be at least')) {
    return 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร';
  }
  if (lower.includes('email not confirmed')) {
    return 'กรุณายืนยันอีเมลของคุณในกล่องข้อความ (หรือปิด Confirm Email ในตั้งค่า Supabase Auth)';
  }
  if (lower.includes('unable to validate email address')) {
    return 'รูปแบบอีเมลไม่ถูกต้อง';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง';
  }
  return msg || 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล';
}
