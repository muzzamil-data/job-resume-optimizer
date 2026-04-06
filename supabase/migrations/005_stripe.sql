-- ─────────────────────────────────────────────────────────────────────────────
-- Stripe payment support
-- ─────────────────────────────────────────────────────────────────────────────

-- Track Stripe customer ID per user (reuse across multiple purchases)
ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS stripe_customer_id text unique;

-- ─────────────────────────────────────────────────────────────────────────────
-- add_credits()
-- Called exclusively by the stripe-webhook Edge Function (service_role).
-- Adds purchased credits to the user's balance and logs the transaction.
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
  update public.credits
  set total      = total + p_amount,
      remaining  = remaining + p_amount,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.credit_transactions (user_id, type, amount, description)
  values (p_user_id, 'purchase', p_amount, p_description);
end;
$$;

-- Restrict add_credits to service_role only.
-- No browser client (anon or authenticated JWT) can call this function directly.
revoke execute on function public.add_credits(uuid, integer, text) from public;
revoke execute on function public.add_credits(uuid, integer, text) from anon;
revoke execute on function public.add_credits(uuid, integer, text) from authenticated;
grant  execute on function public.add_credits(uuid, integer, text) to service_role;
