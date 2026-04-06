-- ─────────────────────────────────────────────────────────────────────────────
-- Credits table
-- One row per user. Updated atomically by the use_credit() RPC below.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.credits (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  total     integer not null default 3,
  used      integer not null default 0,
  remaining integer not null default 3,
  updated_at timestamptz not null default now()
);

alter table public.credits enable row level security;

-- Users can only read their own credits row.
-- Write access is granted only to service role (Edge Function).
create policy "users_read_own_credits" on public.credits
  for select using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Credit transactions log
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('bonus', 'purchase', 'usage', 'refund')),
  amount      integer not null,
  description text not null,
  created_at  timestamptz not null default now()
);

alter table public.credit_transactions enable row level security;

create policy "users_read_own_transactions" on public.credit_transactions
  for select using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic credit deduction function (called by Edge Function via service role)
-- Returns TRUE if a credit was deducted, FALSE if balance was 0.
-- Uses FOR UPDATE to prevent concurrent deductions (race condition fix).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.use_credit(p_user_id uuid, p_description text default 'Resume optimization')
returns boolean
language plpgsql
security definer
as $$
declare
  v_remaining integer;
begin
  -- Lock the row so concurrent calls queue instead of double-deducting
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
-- Atomic credit refund (called by Edge Function when Anthropic call fails
-- after a credit was already deducted)
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
-- Trigger: give every new user 100 free test credits on signup
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
  values (new.id, 'bonus', 100, '100 free test credits on signup');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
