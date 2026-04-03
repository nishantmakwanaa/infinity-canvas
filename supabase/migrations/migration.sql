-- =============================================================================
-- CNVS — Combined baseline migration
-- Merges all 4 migrations into one idempotent file.
-- Safe to run on a fresh project.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.canvases (
  id          uuid              primary key default gen_random_uuid(),
  user_id     uuid              not null references auth.users(id) on delete cascade,
  name        text              not null default 'My Canvas',
  blocks      jsonb             not null default '[]'::jsonb,
  drawings    jsonb             not null default '[]'::jsonb,
  pan_x       double precision  not null default 0,
  pan_y       double precision  not null default 0,
  zoom        double precision  not null default 1,
  created_at  timestamptz       not null default now(),
  updated_at  timestamptz       not null default now()
);

-- owner_username / canvas_name are populated automatically by trigger on insert.
create table if not exists public.shared_canvases (
  id              uuid        primary key default gen_random_uuid(),
  canvas_id       uuid        not null references public.canvases(id) on delete cascade,
  share_token     text        not null unique default encode(gen_random_bytes(16), 'hex'),
  owner_username  text        not null,
  canvas_name     text        not null,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

-- canvases
create index        if not exists canvases_user_id_idx
  on public.canvases(user_id);
create index        if not exists canvases_updated_at_idx
  on public.canvases(updated_at desc);
create unique index if not exists canvases_user_id_name_key          -- stable name-based routes
  on public.canvases(user_id, name);
create index        if not exists canvases_name_updated_idx
  on public.canvases(name, updated_at desc);

-- shared_canvases
create unique index if not exists shared_canvases_canvas_id_key
  on public.shared_canvases(canvas_id);
create unique index if not exists shared_canvases_share_token_key
  on public.shared_canvases(share_token);
create unique index if not exists shared_canvases_owner_canvas_key   -- unique public route per user+name
  on public.shared_canvases(owner_username, canvas_name);

-- -----------------------------------------------------------------------------
-- Functions & Triggers
-- -----------------------------------------------------------------------------

-- 1. Stamp updated_at on every canvases row update.
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


-- 2. Auto-populate owner_username + canvas_name whenever a shared_canvases
--    row is inserted or its canvas_id is changed.
create or replace function public.sync_shared_canvas_route_fields()
returns trigger
language plpgsql
as $$
declare
  v_canvas_name     text;
  v_owner_username  text;
begin
  select
    c.name,
    lower(
      regexp_replace(
        coalesce(
          nullif(u.raw_user_meta_data ->> 'full_name', ''),
          nullif(u.raw_user_meta_data ->> 'name', ''),
          nullif(split_part(u.email, '@', 1), ''),
          'user'
        ),
        '\s+', '-', 'g'
      )
    )
  into v_canvas_name, v_owner_username
  from public.canvases c
  join auth.users u on u.id = c.user_id
  where c.id = new.canvas_id;

  new.canvas_name     := v_canvas_name;
  new.owner_username  := v_owner_username;
  return new;
end;
$$;

drop trigger if exists trg_shared_canvases_sync_route_fields on public.shared_canvases;
create trigger trg_shared_canvases_sync_route_fields
before insert or update of canvas_id
on public.shared_canvases
for each row
execute function public.sync_shared_canvas_route_fields();


-- 3. Keep canvas_name in shared_canvases in sync when a canvas is renamed.
create or replace function public.propagate_canvas_name_to_shares()
returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name then
    update public.shared_canvases
    set canvas_name = new.name
    where canvas_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_canvases_propagate_name_to_shares on public.canvases;
create trigger trg_canvases_propagate_name_to_shares
after update of name
on public.canvases
for each row
execute function public.propagate_canvas_name_to_shares();

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------

alter table public.canvases       enable row level security;
alter table public.shared_canvases enable row level security;

-- canvases policies
drop policy if exists "canvases_select_own_or_shared" on public.canvases;
create policy "canvases_select_own_or_shared"
on public.canvases for select
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.shared_canvases sc
    where sc.canvas_id = canvases.id
  )
);

drop policy if exists "canvases_insert_own" on public.canvases;
create policy "canvases_insert_own"
on public.canvases for insert
with check (auth.uid() = user_id);

drop policy if exists "canvases_update_own" on public.canvases;
create policy "canvases_update_own"
on public.canvases for update
using     (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "canvases_delete_own" on public.canvases;
create policy "canvases_delete_own"
on public.canvases for delete
using (auth.uid() = user_id);

-- shared_canvases policies
drop policy if exists "shared_canvases_select_any" on public.shared_canvases;
create policy "shared_canvases_select_any"
on public.shared_canvases for select
using (true);

drop policy if exists "shared_canvases_insert_owner" on public.shared_canvases;
create policy "shared_canvases_insert_owner"
on public.shared_canvases for insert
with check (
  exists (
    select 1 from public.canvases c
    where c.id = shared_canvases.canvas_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "shared_canvases_update_owner" on public.shared_canvases;
create policy "shared_canvases_update_owner"
on public.shared_canvases for update
using (
  exists (
    select 1 from public.canvases c
    where c.id = shared_canvases.canvas_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.canvases c
    where c.id = shared_canvases.canvas_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "shared_canvases_delete_owner" on public.shared_canvases;
create policy "shared_canvases_delete_owner"
on public.shared_canvases for delete
using (
  exists (
    select 1 from public.canvases c
    where c.id = shared_canvases.canvas_id
      and c.user_id = auth.uid()
  )
);

-- -----------------------------------------------------------------------------
-- RPC helpers
-- -----------------------------------------------------------------------------

-- Resolves /:username/view/:canvasName  →  canvas_id via shared_canvases.
create or replace function public.resolve_shared_canvas(
  p_owner_username  text,
  p_canvas_name     text
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sc.canvas_id
  from public.shared_canvases sc
  where sc.owner_username = p_owner_username
    and sc.canvas_name    = p_canvas_name
  limit 1;
$$;

revoke all    on function public.resolve_shared_canvas(text, text) from public;
grant execute on function public.resolve_shared_canvas(text, text) to anon, authenticated;


-- Resolves /:username/:canvasName  →  canvas_id via canvases directly.
create or replace function public.resolve_user_canvas(
  p_owner_username  text,
  p_canvas_name     text
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.canvases c
  join auth.users u on u.id = c.user_id
  where lower(
    regexp_replace(
      coalesce(
        nullif(u.raw_user_meta_data ->> 'full_name', ''),
        nullif(u.raw_user_meta_data ->> 'name', ''),
        nullif(split_part(u.email, '@', 1), ''),
        'user'
      ),
      '\s+', '-', 'g'
    )
  ) = p_owner_username
    and c.name = p_canvas_name
  order by c.updated_at desc
  limit 1;
$$;

revoke all    on function public.resolve_user_canvas(text, text) from public;
grant execute on function public.resolve_user_canvas(text, text) to anon, authenticated;