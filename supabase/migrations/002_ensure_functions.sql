-- ─────────────────────────────────────────────────────────────────────────────
-- Ensure all required tables, policies, and functions exist.
-- Uses IF NOT EXISTS / CREATE OR REPLACE so this is safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Credits table (may already exist)
create table if not exists public.credits (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  total     integer not null default 100,
  used      integer not null default 0,
  remaining integer not null default 100,
  updated_at timestamptz not null default now()
);

alter table public.credits enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'credits' and policyname = 'users_read_own_credits'
  ) then
    create policy "users_read_own_credits" on public.credits
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Credit transactions table (may already exist)
create table if not exists public.credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('bonus', 'purchase', 'usage', 'refund')),
  amount      integer not null,
  description text not null,
  created_at  timestamptz not null default now()
);

alter table public.credit_transactions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'credit_transactions' and policyname = 'users_read_own_transactions'
  ) then
    create policy "users_read_own_transactions" on public.credit_transactions
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic credit deduction (CREATE OR REPLACE — safe to re-run)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.use_credit(p_user_id uuid, p_description text default 'Resume optimization')
returns boolean
language plpgsql
security definer
as $$
declare
  v_remaining integer;
begin
  select remaining into v_remaining
  from public.credits
  where user_id = p_user_id
  for update;

  if v_remaining is null or v_remaining <= 0 then
    return false;
  end if;

  update public.credits
  set remaining  = remaining - 1,
      used       = used + 1,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.credit_transactions (user_id, type, amount, description)
  values (p_user_id, 'usage', -1, p_description);

  return true;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic credit refund (CREATE OR REPLACE — safe to re-run)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.refund_credit(p_user_id uuid, p_description text default 'Refund: API error')
returns void
language plpgsql
security definer
as $$
begin
  update public.credits
  set remaining  = remaining + 1,
      used       = used - 1,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.credit_transactions (user_id, type, amount, description)
  values (p_user_id, 'refund', 1, p_description);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- New user trigger — 100 free credits on signup
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.credits (user_id, total, used, remaining)
  values (new.id, 100, 0, 100);

  insert into public.credit_transactions (user_id, type, amount, description)
  values (new.id, 'bonus', 100, '100 free credits on signup');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
