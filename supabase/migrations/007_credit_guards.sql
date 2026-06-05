-- ─────────────────────────────────────────────────────────────────────────────
-- Credit + rate-limit hardening (money-path guards)
--
-- Re-defines three SECURITY DEFINER functions with server-side bounds. These are
-- CREATE OR REPLACE so they override whatever earlier migrations installed,
-- without touching the historical migration files (001, 005, 006).
--
--   1. add_credits     — reject non-positive and absurdly large amounts
--   2. refund_credit   — clamp so remaining never exceeds total / used never < 0
--   3. check_rate_limit — true sliding window (no 2x burst at the minute boundary)
-- ─────────────────────────────────────────────────────────────────────────────

-- Largest legitimate single purchase is the Power Pack (75 credits). Cap well
-- above that to allow future promos/bulk, but block runaway values.
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. add_credits — bounded amount
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.add_credits(
  p_user_id     uuid,
  p_amount      integer,
  p_description text
)
returns void
language plpgsql
security definer
as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'add_credits: amount must be positive (got %)', p_amount;
  end if;
  if p_amount > 1000 then
    raise exception 'add_credits: amount % exceeds maximum allowed (1000)', p_amount;
  end if;

  update public.credits
  set total      = total + p_amount,
      remaining  = remaining + p_amount,
      updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception 'add_credits: no credits row for user %', p_user_id;
  end if;

  insert into public.credit_transactions (user_id, type, amount, description)
  values (p_user_id, 'purchase', p_amount, p_description);
end;
$$;

revoke execute on function public.add_credits(uuid, integer, text) from public;
revoke execute on function public.add_credits(uuid, integer, text) from anon;
revoke execute on function public.add_credits(uuid, integer, text) from authenticated;
grant  execute on function public.add_credits(uuid, integer, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. refund_credit — clamp to valid range, never refund below a used credit
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.refund_credit(p_user_id uuid, p_description text default 'Refund: API error')
returns void
language plpgsql
security definer
as $$
declare
  v_updated integer;
begin
  -- Only refund when there is a used credit to give back. Clamp remaining so it
  -- can never exceed total (which would mint free credits) and used so it can
  -- never go negative.
  update public.credits
  set remaining  = least(remaining + 1, total),
      used       = greatest(used - 1, 0),
      updated_at = now()
  where user_id = p_user_id
    and used > 0;

  get diagnostics v_updated = row_count;

  -- No-op (nothing was used) → do not log a phantom refund transaction.
  if v_updated = 0 then
    return;
  end if;

  insert into public.credit_transactions (user_id, type, amount, description)
  values (p_user_id, 'refund', 1, p_description);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. check_rate_limit — true sliding window
--
-- Earlier version used date_trunc('minute', now()) as a single tumbling bucket,
-- which allowed up to 2x the limit across a minute boundary (max at :59, max
-- again at :00). This version records per-second buckets and sums the trailing
-- p_window_secs, so the limit holds at every instant.
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
  v_bucket timestamptz;
  v_total  integer;
begin
  -- Per-second bucket so a sliding sum is possible.
  v_bucket := date_trunc('second', now());

  -- Drop buckets that have aged out of the window (keeps the table small).
  delete from public.rate_limits
  where user_id = p_user_id
    and action  = p_action
    and window_start <= now() - make_interval(secs => p_window_secs);

  -- Record this request in the current second's bucket.
  insert into public.rate_limits (user_id, action, window_start, count)
  values (p_user_id, p_action, v_bucket, 1)
  on conflict (user_id, action, window_start)
  do update set count = rate_limits.count + 1;

  -- Sliding window: total requests within the trailing p_window_secs.
  select coalesce(sum(count), 0) into v_total
  from public.rate_limits
  where user_id = p_user_id
    and action  = p_action
    and window_start > now() - make_interval(secs => p_window_secs);

  return v_total <= p_max_requests;
end;
$$;

revoke execute on function public.check_rate_limit(uuid, text, integer, integer) from public;
revoke execute on function public.check_rate_limit(uuid, text, integer, integer) from anon;
revoke execute on function public.check_rate_limit(uuid, text, integer, integer) from authenticated;
grant  execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;
