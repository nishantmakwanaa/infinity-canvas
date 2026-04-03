-- Complete baseline schema for CNVS app.
-- Safe to run on fresh or partially initialized projects.

create extension if not exists pgcrypto;

create table if not exists public.canvases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Canvas',
  blocks jsonb not null default '[]'::jsonb,
  drawings jsonb not null default '[]'::jsonb,
  pan_x double precision not null default 0,
  pan_y double precision not null default 0,
  zoom double precision not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.canvases
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists name text not null default 'My Canvas',
  add column if not exists blocks jsonb not null default '[]'::jsonb,
  add column if not exists drawings jsonb not null default '[]'::jsonb,
  add column if not exists pan_x double precision not null default 0,
  add column if not exists pan_y double precision not null default 0,
  add column if not exists zoom double precision not null default 1,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists canvases_user_id_idx on public.canvases(user_id);
create index if not exists canvases_updated_at_idx on public.canvases(updated_at desc);

create table if not exists public.shared_canvases (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  share_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.shared_canvases
  add column if not exists canvas_id uuid references public.canvases(id) on delete cascade,
  add column if not exists share_token text,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists shared_canvases_canvas_id_key
  on public.shared_canvases(canvas_id);
create unique index if not exists shared_canvases_share_token_key
  on public.shared_canvases(share_token);

update public.shared_canvases
set share_token = encode(gen_random_bytes(16), 'hex')
where share_token is null;

alter table public.shared_canvases
  alter column share_token set default encode(gen_random_bytes(16), 'hex'),
  alter column share_token set not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_canvases_set_updated_at on public.canvases;
create trigger trg_canvases_set_updated_at
before update on public.canvases
for each row
execute function public.set_updated_at();

alter table public.canvases enable row level security;
alter table public.shared_canvases enable row level security;

drop policy if exists "canvases_select_own_or_shared" on public.canvases;
create policy "canvases_select_own_or_shared"
on public.canvases
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.shared_canvases sc
    where sc.canvas_id = canvases.id
  )
);

drop policy if exists "canvases_insert_own" on public.canvases;
create policy "canvases_insert_own"
on public.canvases
for insert
with check (auth.uid() = user_id);

drop policy if exists "canvases_update_own" on public.canvases;
create policy "canvases_update_own"
on public.canvases
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "canvases_delete_own" on public.canvases;
create policy "canvases_delete_own"
on public.canvases
for delete
using (auth.uid() = user_id);

drop policy if exists "shared_canvases_select_any" on public.shared_canvases;
create policy "shared_canvases_select_any"
on public.shared_canvases
for select
using (true);

drop policy if exists "shared_canvases_insert_owner" on public.shared_canvases;
create policy "shared_canvases_insert_owner"
on public.shared_canvases
for insert
with check (
  exists (
    select 1
    from public.canvases c
    where c.id = shared_canvases.canvas_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "shared_canvases_update_owner" on public.shared_canvases;
create policy "shared_canvases_update_owner"
on public.shared_canvases
for update
using (
  exists (
    select 1
    from public.canvases c
    where c.id = shared_canvases.canvas_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.canvases c
    where c.id = shared_canvases.canvas_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "shared_canvases_delete_owner" on public.shared_canvases;
create policy "shared_canvases_delete_owner"
on public.shared_canvases
for delete
using (
  exists (
    select 1
    from public.canvases c
    where c.id = shared_canvases.canvas_id
      and c.user_id = auth.uid()
  )
);