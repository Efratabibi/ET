-- Beta additions (usage events and feedback). For a database created before November 2026:
-- Supabase → SQL Editor → New query → paste this file → Run. Safe to run more than once.

create table if not exists public.events (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name    text not null check (char_length(name) <= 40),
  props   jsonb not null default '{}'::jsonb check (pg_column_size(props) < 2000),
  at      timestamptz not null default now()
);
create index if not exists events_at on public.events (at);
alter table public.events enable row level security;
drop policy if exists "add own events" on public.events;
create policy "add own events" on public.events for insert to authenticated with check (auth.uid() = user_id);

create table if not exists public.feedback (
  id      bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  message text not null check (char_length(message) between 1 and 2000),
  view    text check (char_length(view) <= 20),
  at      timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "send feedback" on public.feedback;
create policy "send feedback" on public.feedback for insert to authenticated with check (auth.uid() = user_id);
