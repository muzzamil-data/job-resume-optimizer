-- ─────────────────────────────────────────────────────────────────────────────
-- Lock down credit RPC functions so only the service role can invoke them.
--
-- Previously any authenticated user could call:
--   supabase.rpc('refund_credit', { p_user_id: their_own_id })
-- and give themselves unlimited credits.
--
-- SECURITY DEFINER controls *which role the function body runs as*,
-- but does NOT restrict *who can call it*. REVOKE + GRANT fixes that.
-- ─────────────────────────────────────────────────────────────────────────────

-- Revoke from everyone (PUBLIC includes anon + authenticated)
revoke execute on function public.use_credit(uuid, text) from public;
revoke execute on function public.use_credit(uuid, text) from anon;
revoke execute on function public.use_credit(uuid, text) from authenticated;

revoke execute on function public.refund_credit(uuid, text) from public;
revoke execute on function public.refund_credit(uuid, text) from anon;
revoke execute on function public.refund_credit(uuid, text) from authenticated;

-- Grant only to service_role (used by the Edge Function)
grant execute on function public.use_credit(uuid, text) to service_role;
grant execute on function public.refund_credit(uuid, text) to service_role;
