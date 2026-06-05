-- ─────────────────────────────────────────────────────────────────────────────
-- Rate limiting table + atomic check function
--
-- Tracks request counts per (user_id, action) in 1-minute sliding windows.
-- The check_rate_limit() function increments the counter and returns FALSE
-- when the limit is exceeded, so the Edge Function can return 429 immediately.
-- All RPC grant/revoke follows the same pattern as use_credit.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rate_limits (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  action     text        not null,
  window_start timestamptz not null,
  count      integer     not null default 1,
  primary key (user_id, action, window_start)
);

alter table public.rate_limits enable row level security;

-- Users cannot read or write rate_limit rows directly — service role only.
-- No RLS policies = deny all for non-service roles.

-- Index for the sliding-window cleanup query.
create index if not exists rate_limits_window_start
  on public.rate_limits (window_start);

-- ─────────────────────────────────────────────────────────────────────────────
-- check_rate_limit(user_id, action, max_requests, window_seconds)
--
-- Returns TRUE  → request is within the limit (proceed)
-- Returns FALSE → limit exceeded (return 429)
--
-- Uses a 1-minute tumbling window keyed on date_trunc('minute', now()).
-- Inserts or increments the counter for the current window atomically.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.check_rate_limit(
  p_user_id       uuid,
  p_action        text,
  p_max_requests  integer,
  p_window_secs   integer default 60
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  -- Truncate to the current window boundary
  v_window := date_trunc('minute', now());

  -- Delete windows older than p_window_secs to keep the table small
  delete from public.rate_limits
  where user_id = p_user_id
    and action  = p_action
    and window_start < now() - (p_window_secs || ' seconds')::interval;

  -- Upsert: increment if row exists, insert with count=1 otherwise
  insert into public.rate_limits (user_id, action, window_start, count)
  values (p_user_id, p_action, v_window, 1)
  on conflict (user_id, action, window_start)
  do update set count = rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_max_requests;
end;
$$;

-- Lock down to service_role only — clients cannot call this directly.
revoke execute on function public.check_rate_limit(uuid, text, integer, integer) from public;
revoke execute on function public.check_rate_limit(uuid, text, integer, integer) from anon;
revoke execute on function public.check_rate_limit(uuid, text, integer, integer) from authenticated;
grant  execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;
