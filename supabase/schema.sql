-- Home Bar database. Run once in Supabase: SQL Editor → New query → paste → Run.

-- Each person's bar (the same JSON the claude.ai version stores).
create table if not exists public.bars (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.bars enable row level security;
create policy "read own bar"   on public.bars for select using (auth.uid() = user_id);
create policy "create own bar" on public.bars for insert with check (auth.uid() = user_id);
create policy "update own bar" on public.bars for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own bar" on public.bars for delete using (auth.uid() = user_id);
-- live sync between a person's devices
alter publication supabase_realtime add table public.bars;

-- Shelf prices collected from stores (written by the price job with the service key, readable by everyone).
create table if not exists public.prices (
  product    text not null,           -- catalog name, e.g. 'Woodford Reserve Double Oaked'
  size_ml    int  not null,           -- 700, 750, 1000 …
  price      numeric not null,
  currency   text not null default 'ILS',
  store      text not null,           -- e.g. 'wineroute.co.il'
  url        text,
  fetched_at timestamptz not null default now(),
  primary key (product, size_ml, store)
);
alter table public.prices enable row level security;
create policy "anyone reads prices" on public.prices for select using (true);

-- Bottles Claude identified for any user, shared so the next person finds them in search.
create table if not exists public.learned_products (
  name       text primary key,
  type       text not null,
  style      text not null,
  il_low     numeric, il_high numeric,
  us_low     numeric, us_high numeric,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.learned_products enable row level security;
create policy "signed-in read learned" on public.learned_products for select to authenticated using (true);
create policy "signed-in add learned"  on public.learned_products for insert to authenticated with check (auth.uid() = created_by);

-- Claude usage per person per day, for the daily limit. Only the server touches it.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  count   int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

create or replace function public.hb_use_ai(p_user uuid, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into ai_usage (user_id, day, count) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set count = ai_usage.count + 1
  returning count into c;
  return c <= p_limit;
end $$;
revoke execute on function public.hb_use_ai(uuid, int) from public, anon, authenticated;
