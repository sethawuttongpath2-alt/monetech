-- ============================================================================
-- MONETECH SMART WALLET - SUPABASE DATABASE SCHEMA (WITH ADMIN DASHBOARD TABLE)
-- วิธีใช้งาน: คัดลอกโค้ดทั้งหมดนี้ไปวางในเมนู SQL Editor บนเว็บ Supabase แล้วกด Run
-- (สามารถรันซ้ำทับตารางเดิมได้เลย ข้อมูลผู้ใช้เดิมไม่หาย และจะซิงก์เข้าตาราง Admin อัตโนมัติ)
-- ============================================================================

-- 1. ตารางข้อมูลโปรไฟล์, Role (user/admin) และสถานะออนไลน์ (profiles)
create table if not exists public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  avatar_url text,
  role text default 'user',
  is_online boolean default false,
  last_seen timestamptz default now(),
  locked_savings numeric default 0,
  monthly_budget numeric default 9000,
  daily_limit numeric default 400,
  total_slip_amount numeric default 0,
  total_income numeric default 0,
  total_expense numeric default 0,
  available_balance numeric default 0,
  transaction_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- อัปเกรดคอลัมน์เพิ่มกรณีเคยสร้างตาราง profiles ไว้ก่อนหน้านี้แล้ว
alter table public.profiles add column if not exists role text default 'user';
alter table public.profiles add column if not exists is_online boolean default false;
alter table public.profiles add column if not exists last_seen timestamptz default now();
alter table public.profiles add column if not exists total_slip_amount numeric default 0;
alter table public.profiles add column if not exists total_income numeric default 0;
alter table public.profiles add column if not exists total_expense numeric default 0;
alter table public.profiles add column if not exists available_balance numeric default 0;
alter table public.profiles add column if not exists transaction_count integer default 0;

-- ตั้งให้ sethawut.ton@spumail.net และบัญชีที่มีคำว่า admin เป็น admin อัตโนมัติ
update public.profiles
set role = 'admin'
where lower(email) in ('sethawut.ton@spumail.net', 'sethawut.ton@spumail.com', 'sethawuttongpath2@gmail.com')
   or lower(coalesce(full_name, '')) like '%admin%';

-- ฟังก์ชันตรวจสอบสิทธิ์ Admin
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        role = 'admin'
        or lower(email) in ('sethawut.ton@spumail.net', 'sethawut.ton@spumail.com', 'sethawuttongpath2@gmail.com')
        or lower(coalesce(full_name, '')) like '%admin%'
      )
  )
  or lower(coalesce(auth.jwt() ->> 'email', '')) in ('sethawut.ton@spumail.net', 'sethawut.ton@spumail.com', 'sethawuttongpath2@gmail.com');
$$;

-- เปิดใช้งาน Row Level Security (RLS) และอนุญาตให้แอปซิงก์ข้อมูลได้ราบรื่น
alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users and Admins can view profiles" on public.profiles;
drop policy if exists "Allow read profiles" on public.profiles;
create policy "Allow read profiles"
  on public.profiles for select
  using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Allow insert profiles" on public.profiles;
create policy "Allow insert profiles"
  on public.profiles for insert
  with check (true);

drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users and Admins can update profiles" on public.profiles;
drop policy if exists "Allow update profiles" on public.profiles;
create policy "Allow update profiles"
  on public.profiles for update
  using (true);

drop policy if exists "Admins can delete profiles" on public.profiles;
drop policy if exists "Allow delete profiles" on public.profiles;
create policy "Allow delete profiles"
  on public.profiles for delete
  using (true);


-- 2. ตารางประวัติรายการสลิป / รายรับ-รายจ่าย (transactions)
create table if not exists public.transactions (
  id text primary key,
  user_id uuid not null,
  title text not null,
  amount numeric not null default 0,
  category text default 'other',
  type text default 'expense',
  date text,
  day_of_week integer,
  timestamp bigint,
  created_at timestamptz default now()
);

alter table public.transactions enable row level security;

drop policy if exists "Users can manage own transactions" on public.transactions;
drop policy if exists "Allow all transactions" on public.transactions;
create policy "Allow all transactions"
  on public.transactions for all
  using (true)
  with check (true);


-- 3. ตารางกระปุกเป้าหมายการออม (goals)
create table if not exists public.goals (
  id text primary key,
  user_id uuid not null,
  title text not null,
  icon text default '🎯',
  current numeric not null default 0,
  target numeric not null default 0,
  color text default 'indigo',
  note text,
  created_at timestamptz default now()
);

alter table public.goals enable row level security;

drop policy if exists "Users can manage own goals" on public.goals;
drop policy if exists "Allow all goals" on public.goals;
create policy "Allow all goals"
  on public.goals for all
  using (true)
  with check (true);


-- 4. ตารางรายการหารบิลกับเพื่อน (split_bills)
create table if not exists public.split_bills (
  id text primary key,
  user_id uuid not null,
  title text not null,
  icon text default '🍲',
  icon_bg text default 'bg-[#ffedd5]/80',
  icon_color text,
  total_amount numeric not null default 0,
  per_person numeric not null default 0,
  status_badge text,
  status_type text default 'pending',
  action_type text default 'scan_promptpay',
  action_label text,
  is_paid boolean default false,
  members jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ลบบิลตัวอย่าง (mockup) ที่เคยถูกสร้างอัตโนมัติออกจากฐานข้อมูล
delete from public.split_bills
where id in ('bill-1', 'bill-2')
   or id like '%_bill-1'
   or id like '%_bill-2'
   or title in ('หมูกระทะหลัง ม. (4 คน)', 'ค่าไฟหอพักเดือนนี้ (หาร 2)');

alter table public.split_bills enable row level security;

drop policy if exists "Users can manage own split_bills" on public.split_bills;
drop policy if exists "Allow all split_bills" on public.split_bills;
create policy "Allow all split_bills"
  on public.split_bills for all
  using (true)
  with check (true);


-- 5. ตารางแจ้งปัญหาและข้อเสนอแนะ (issue_reports)
create table if not exists public.issue_reports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  user_email text,
  user_name text,
  issue_type text not null,
  description text not null,
  status text default 'pending',
  attached_files jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table public.issue_reports add column if not exists user_email text;
alter table public.issue_reports add column if not exists user_name text;
alter table public.issue_reports add column if not exists status text default 'pending';

alter table public.issue_reports enable row level security;

drop policy if exists "Users can insert own issue_reports" on public.issue_reports;
drop policy if exists "Users can view own issue_reports" on public.issue_reports;
drop policy if exists "Users and Admins can view issue_reports" on public.issue_reports;
drop policy if exists "Admins can update issue_reports" on public.issue_reports;
drop policy if exists "Admins can delete issue_reports" on public.issue_reports;
drop policy if exists "Allow all issue_reports" on public.issue_reports;
create policy "Allow all issue_reports"
  on public.issue_reports for all
  using (true)
  with check (true);


-- ============================================================================
-- 6. ตารางใหม่สำหรับดูข้อมูลเหมือนหน้า Admin เป๊ะๆ (admin_user_dashboard)
-- เปิดดูที่เมนู Table Editor -> admin_user_dashboard บน Supabase ได้เลย
-- ============================================================================
create table if not exists public.admin_user_dashboard (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  full_name text,                         -- ชื่อผู้ใช้
  email text,                             -- อีเมล
  role_badge text default '👤 USER',      -- สิทธิ์ (👑 ADMIN / 👤 USER)
  online_status text default '⚪ ออฟไลน์', -- สถานะออนไลน์ (🟢 ออนไลน์ / ⚪ ออฟไลน์)
  total_slip_amount numeric default 0,    -- ยอดสลิปสะสม (฿)
  locked_savings numeric default 0,       -- ล็อกเงินออม (฿)
  transaction_count integer default 0,    -- จำนวนสลิป (รายการ)
  total_income numeric default 0,         -- รายรับรวม (฿)
  total_expense numeric default 0,        -- รายจ่ายรวม (฿)
  available_balance numeric default 0,    -- ยอดเงินที่ใช้ได้คงเหลือ (฿)
  goal_count integer default 0,           -- จำนวนเป้าหมายออมเงิน
  split_bill_count integer default 0,     -- จำนวนบิลหารกับเพื่อน
  issue_report_count integer default 0,   -- จำนวนแจ้งปัญหา
  last_seen timestamptz default now(),    -- เวลาใช้งานล่าสุด
  updated_at timestamptz default now()
);

alter table public.admin_user_dashboard enable row level security;

drop policy if exists "Allow all admin_user_dashboard" on public.admin_user_dashboard;
create policy "Allow all admin_user_dashboard"
  on public.admin_user_dashboard for all
  using (true)
  with check (true);

-- ฟังก์ชันคำนวณและอัปเดตข้อมูลผู้ใช้เข้าตาราง admin_user_dashboard และ profiles อัตโนมัติ
create or replace function public.refresh_admin_user_dashboard(target_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  p_record record;
  v_total_slip numeric := 0;
  v_total_income numeric := 0;
  v_total_expense numeric := 0;
  v_tx_count integer := 0;
  v_goal_count integer := 0;
  v_bill_count integer := 0;
  v_report_count integer := 0;
  v_available numeric := 0;
  v_is_online boolean := false;
begin
  if target_user_id is null then
    return;
  end if;

  select * into p_record from public.profiles where id = target_user_id;
  if not found then
    return;
  end if;

  -- คำนวณยอดสลิป รายรับ รายจ่าย และจำนวนสลิป
  select
    coalesce(sum(amount), 0),
    coalesce(sum(case when type = 'income' then amount else 0 end), 0),
    coalesce(sum(case when coalesce(type, 'expense') <> 'income' then amount else 0 end), 0),
    count(*)
  into v_total_slip, v_total_income, v_total_expense, v_tx_count
  from public.transactions
  where user_id = target_user_id;

  -- นับจำนวนเป้าหมาย บิลหาร และแจ้งปัญหา
  select count(*) into v_goal_count from public.goals where user_id = target_user_id;
  select count(*) into v_bill_count from public.split_bills where user_id = target_user_id;
  select count(*) into v_report_count from public.issue_reports where user_id = target_user_id;

  -- คำนวณยอดเงินที่ใช้ได้จริง (รายรับรวม - เงินออมที่ล็อก - รายจ่ายรวม)
  v_available := greatest(0, v_total_income - coalesce(p_record.locked_savings, 0) - v_total_expense);

  -- เช็กสถานะออนไลน์
  v_is_online := coalesce(p_record.is_online, false)
                 and p_record.last_seen is not null
                 and (extract(epoch from (now() - p_record.last_seen)) < 120);

  -- อัปเดตตาราง profiles ให้แสดงผลรวมตรงกันด้วย
  update public.profiles
  set
    total_slip_amount = v_total_slip,
    total_income = v_total_income,
    total_expense = v_total_expense,
    available_balance = v_available,
    transaction_count = v_tx_count
  where id = target_user_id;

  -- บันทึก/อัปเดตลงตาราง admin_user_dashboard ให้ตรงกับหน้า Admin เป๊ะๆ
  insert into public.admin_user_dashboard (
    user_id,
    full_name,
    email,
    role_badge,
    online_status,
    total_slip_amount,
    locked_savings,
    transaction_count,
    total_income,
    total_expense,
    available_balance,
    goal_count,
    split_bill_count,
    issue_report_count,
    last_seen,
    updated_at
  )
  values (
    p_record.id,
    coalesce(nullif(p_record.full_name, ''), split_part(coalesce(p_record.email, ''), '@', 1), 'ผู้ใช้งาน'),
    coalesce(p_record.email, '-'),
    case
      when p_record.role = 'admin'
        or lower(coalesce(p_record.email, '')) in ('sethawut.ton@spumail.net', 'sethawuttongpath2@gmail.com')
        or lower(coalesce(p_record.full_name, '')) like '%admin%'
      then '👑 ADMIN'
      else '👤 USER'
    end,
    case when v_is_online then '🟢 ออนไลน์' else '⚪ ออฟไลน์' end,
    v_total_slip,
    coalesce(p_record.locked_savings, 0),
    v_tx_count,
    v_total_income,
    v_total_expense,
    v_available,
    v_goal_count,
    v_bill_count,
    v_report_count,
    coalesce(p_record.last_seen, p_record.updated_at, p_record.created_at, now()),
    now()
  )
  on conflict (user_id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    role_badge = excluded.role_badge,
    online_status = excluded.online_status,
    total_slip_amount = excluded.total_slip_amount,
    locked_savings = excluded.locked_savings,
    transaction_count = excluded.transaction_count,
    total_income = excluded.total_income,
    total_expense = excluded.total_expense,
    available_balance = excluded.available_balance,
    goal_count = excluded.goal_count,
    split_bill_count = excluded.split_bill_count,
    issue_report_count = excluded.issue_report_count,
    last_seen = excluded.last_seen,
    updated_at = now();
end;
$$;

-- Trigger อัปเดตตาราง admin_user_dashboard อัตโนมัติเมื่อข้อมูลในตารางใดๆ เปลี่ยนแปลง
create or replace function public.trg_sync_admin_dashboard_from_profiles()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.refresh_admin_user_dashboard(new.id);
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_admin_dashboard on public.profiles;
create trigger trg_profiles_sync_admin_dashboard
  after insert or update of full_name, email, role, is_online, last_seen, locked_savings
  on public.profiles
  for each row execute procedure public.trg_sync_admin_dashboard_from_profiles();

create or replace function public.trg_sync_admin_dashboard_from_child()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.refresh_admin_user_dashboard(old.user_id);
    return old;
  else
    perform public.refresh_admin_user_dashboard(new.user_id);
    return new;
  end if;
end;
$$;

drop trigger if exists trg_tx_sync_admin_dashboard on public.transactions;
create trigger trg_tx_sync_admin_dashboard
  after insert or update or delete on public.transactions
  for each row execute procedure public.trg_sync_admin_dashboard_from_child();

drop trigger if exists trg_goals_sync_admin_dashboard on public.goals;
create trigger trg_goals_sync_admin_dashboard
  after insert or update or delete on public.goals
  for each row execute procedure public.trg_sync_admin_dashboard_from_child();

drop trigger if exists trg_bills_sync_admin_dashboard on public.split_bills;
create trigger trg_bills_sync_admin_dashboard
  after insert or update or delete on public.split_bills
  for each row execute procedure public.trg_sync_admin_dashboard_from_child();

drop trigger if exists trg_reports_sync_admin_dashboard on public.issue_reports;
create trigger trg_reports_sync_admin_dashboard
  after insert or update or delete on public.issue_reports
  for each row execute procedure public.trg_sync_admin_dashboard_from_child();

-- Trigger เมื่อสมัครสมาชิกใหม่ใน auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  assigned_role text;
begin
  if lower(new.email) in ('sethawut.ton@spumail.net', 'sethawut.ton@spumail.com', 'sethawuttongpath2@gmail.com')
     or lower(coalesce(new.raw_user_meta_data->>'full_name', '')) like '%admin%' then
    assigned_role := 'admin';
  else
    assigned_role := 'user';
  end if;

  insert into public.profiles (
    id, email, full_name, role, is_online, last_seen, locked_savings, monthly_budget, daily_limit
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    assigned_role,
    true,
    now(),
    0,
    9000,
    400
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    role = case
      when lower(excluded.email) in ('sethawut.ton@spumail.net', 'sethawut.ton@spumail.com', 'sethawuttongpath2@gmail.com') then 'admin'
      else public.profiles.role
    end,
    is_online = true,
    last_seen = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- 7. ฟังก์ชันสำหรับ Admin ลบบัญชีผู้ใช้แบบหมดจด (ลบถึง auth.users)
-- ============================================================================
create or replace function public.delete_user_by_admin(target_user_id uuid)
returns boolean
language plpgsql
security definer set search_path = public, auth
as $$
begin
  if target_user_id is null then
    return false;
  end if;

  -- ลบข้อมูลในทุกตารางย่อย
  delete from public.admin_user_dashboard where user_id = target_user_id;
  delete from public.transactions where user_id = target_user_id;
  delete from public.goals where user_id = target_user_id;
  delete from public.split_bills where user_id = target_user_id;
  delete from public.issue_reports where user_id = target_user_id;
  delete from public.profiles where id = target_user_id;

  -- ลบออกจากระบบ Authentication (auth.users)
  delete from auth.users where id = target_user_id;

  return true;
end;
$$;

grant execute on function public.delete_user_by_admin(uuid) to anon, authenticated, service_role;

-- ============================================================================
-- 8. ฟังก์ชันสำหรับรีเซ็ต/เปลี่ยนรหัสผ่านผู้ใช้โดยตรง (Direct Password Reset)
-- ============================================================================
create or replace function public.reset_password_direct(user_email text, new_password text)
returns boolean
language plpgsql
security definer set search_path = public, auth, extensions
as $$
declare
  target_id uuid;
begin
  if user_email is null or new_password is null or length(trim(new_password)) < 6 then
    return false;
  end if;

  select id into target_id from auth.users where lower(email) = lower(trim(user_email));
  if target_id is null then
    return false;
  end if;

  -- เข้ารหัสรหัสผ่านใหม่ด้วย bcrypt และอัปเดตลง auth.users ทันที
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = now()
  where id = target_id;

  return true;
end;
$$;

grant execute on function public.reset_password_direct(text, text) to anon, authenticated, service_role;

-- ซิงก์ข้อมูลผู้ใช้เดิมทั้งหมดที่มีอยู่ในระบบเข้าตาราง admin_user_dashboard ทันที
do $$
declare
  r record;
begin
  for r in select id from public.profiles loop
    perform public.refresh_admin_user_dashboard(r.id);
  end loop;
end;
$$;
