-- ─────────────────────────────────────────────────────────────────────────────
-- Error logs table
-- Collects runtime errors from the Edge Function (server-side) and from the
-- content script / React error boundary (client-side).
--
-- The service role (used inside the Edge Function) bypasses RLS so it can
-- insert rows with user_id = NULL for unauthenticated failures.
-- Authenticated clients insert their own rows using the policy below.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.error_logs (
  id          uuid        primary key default gen_random_uuid(),
  -- NULL for auth failures where no user could be identified
  user_id     uuid        references auth.users(id) on delete set null,
  context     text        not null
                          check (context in ('edge_function', 'content_script', 'react_boundary')),
  action      text,       -- e.g. 'callClaude', 'parseResume', 'scrapeJobWithAI'
  error_code  text        not null,
  message     text        not null,
  metadata    jsonb,      -- extra context: http status, attempt count, etc.
  created_at  timestamptz not null default now()
);

alter table public.error_logs enable row level security;

-- Users can read their own logged errors
create policy "users_read_own_errors" on public.error_logs
  for select using (auth.uid() = user_id);

-- Users can insert their own errors from the content script
create policy "users_insert_own_errors" on public.error_logs
  for insert with check (auth.uid() = user_id);

-- Index for per-user queries (e.g. a future error-history view)
create index if not exists error_logs_user_id_created_at
  on public.error_logs (user_id, created_at desc);
