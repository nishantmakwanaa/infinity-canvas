-- =============================================================================
-- CNVS - Scratch-First Baseline Migration
-- Clean baseline for creating a new Supabase database from scratch.
--
-- File name uses Supabase CLI convention (YYYYMMDDHHMMSS_name.sql) so
-- `supabase db push` and hosted migration runs pick up this migration.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.canvases (
  id          uuid              primary key default gen_random_uuid(),
  user_id     uuid              not null references auth.users(id) on delete cascade,
  name        text              not null,
  blocks      jsonb             not null default '[]'::jsonb,
  drawings    jsonb             not null default '[]'::jsonb,
  pan_x       double precision  not null default 0,
  pan_y       double precision  not null default 0,
  zoom        double precision  not null default 1,
  created_at  timestamptz       not null default now(),
  updated_at  timestamptz       not null default now(),
  unique (user_id, name)
);

create table if not exists public.shared_canvases (
  id              uuid        primary key default gen_random_uuid(),
  canvas_id       uuid        not null references public.canvases(id) on delete cascade,
  share_token     text        not null unique default encode(gen_random_bytes(16), 'hex'),
  owner_username  text        not null,
  canvas_name     text        not null,
  page_name       text        not null default 'page-1.cnvs',
  access_level    text        not null default 'viewer' check (access_level in ('viewer', 'editor')),
  created_at      timestamptz not null default now()
);

create table if not exists public.canvas_permissions (
  id          uuid        primary key default gen_random_uuid(),
  canvas_id   uuid        not null references public.canvases(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  role        text        not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  granted_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (canvas_id, user_id)
);

create table if not exists public.canvas_editor_sessions (
  id            uuid        primary key default gen_random_uuid(),
  canvas_id     uuid        not null references public.canvases(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  client_id     text        not null default '',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '90 seconds')
);

create table if not exists public.user_canvas_state (
  user_id               uuid        primary key references auth.users(id) on delete cascade,
  last_opened_canvas_id uuid        references public.canvases(id) on delete set null,
  updated_at            timestamptz not null default now()
);

alter table public.shared_canvases
  drop constraint if exists shared_canvases_canvas_id_key;

alter table public.shared_canvases
  drop constraint if exists shared_canvases_owner_username_canvas_name_page_name_key;

create unique index if not exists shared_canvases_canvas_access_key
  on public.shared_canvases(canvas_id, access_level);

create unique index if not exists shared_canvases_route_access_key
  on public.shared_canvases(owner_username, canvas_name, page_name, access_level);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

create index if not exists canvases_user_id_idx
  on public.canvases(user_id);
create index if not exists canvases_updated_at_idx
  on public.canvases(updated_at desc);
create index if not exists canvases_name_updated_idx
  on public.canvases(name, updated_at desc);

create index if not exists shared_canvases_share_lookup_idx
  on public.shared_canvases(share_token, owner_username, canvas_id);
create index if not exists shared_canvases_canvas_access_idx
  on public.shared_canvases(canvas_id, access_level);

create index if not exists canvas_permissions_user_role_idx
  on public.canvas_permissions(user_id, role, updated_at desc);
create index if not exists canvas_permissions_canvas_role_idx
  on public.canvas_permissions(canvas_id, role);

create unique index if not exists canvas_editor_sessions_canvas_user_key
  on public.canvas_editor_sessions(canvas_id, user_id);
create index if not exists canvas_editor_sessions_canvas_expires_idx
  on public.canvas_editor_sessions(canvas_id, expires_at desc);
create index if not exists canvas_editor_sessions_expires_idx
  on public.canvas_editor_sessions(expires_at);

create index if not exists user_canvas_state_last_opened_idx
  on public.user_canvas_state(last_opened_canvas_id, updated_at desc);

do $$
begin
  begin
    execute 'create index if not exists auth_users_email_localpart_idx on auth.users ((lower(coalesce(nullif(split_part(email, ''@'', 1), ''''), ''user''))))';
  exception
    when insufficient_privilege then
      null;
  end;
end $$;

-- -----------------------------------------------------------------------------
-- Functions & Triggers
-- -----------------------------------------------------------------------------

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

create or replace function public.sync_shared_canvas_route_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canvas_name     text;
  v_page_name       text;
  v_owner_username  text;
begin
  select
    case
      when position('/' in c.name) > 0 then split_part(c.name, '/', 1)
      else c.name
    end,
    case
      when position('/' in c.name) > 0 then split_part(c.name, '/', 2)
      else 'page-1.cnvs'
    end,
    lower(coalesce(nullif(split_part(u.email, '@', 1), ''), 'user'))
  into v_canvas_name, v_page_name, v_owner_username
  from public.canvases c
  join auth.users u on u.id = c.user_id
  where c.id = new.canvas_id;

  new.canvas_name := coalesce(nullif(v_canvas_name, ''), 'untitled');
  new.page_name := coalesce(nullif(v_page_name, ''), 'page-1.cnvs');
  new.owner_username := coalesce(v_owner_username, 'user');
  return new;
end;
$$;

drop trigger if exists trg_shared_canvases_sync_route_fields on public.shared_canvases;
create trigger trg_shared_canvases_sync_route_fields
before insert or update of canvas_id
on public.shared_canvases
for each row
execute function public.sync_shared_canvas_route_fields();

create or replace function public.sync_shared_canvas_memberships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canvas_id uuid := coalesce(new.canvas_id, old.canvas_id);
  v_owner_id uuid;
  v_effective_access text;
begin
  if v_canvas_id is null then
    return coalesce(new, old);
  end if;

  select c.user_id
  into v_owner_id
  from public.canvases c
  where c.id = v_canvas_id
  limit 1;

  if v_owner_id is null then
    return coalesce(new, old);
  end if;

  select
    case
      when exists (
        select 1
        from public.shared_canvases sc
        where sc.canvas_id = v_canvas_id
          and sc.access_level = 'editor'
      ) then 'editor'
      when exists (
        select 1
        from public.shared_canvases sc
        where sc.canvas_id = v_canvas_id
          and sc.access_level = 'viewer'
      ) then 'viewer'
      else null
    end
  into v_effective_access;

  if v_effective_access is null then
    -- Unpublished: remove all joined access and clear their startup pointer for this canvas.
    delete from public.canvas_permissions cp
    where cp.canvas_id = v_canvas_id
      and cp.user_id <> v_owner_id
      and cp.role in ('viewer', 'editor');

    delete from public.canvas_editor_sessions ces
    where ces.canvas_id = v_canvas_id
      and ces.user_id <> v_owner_id;

    update public.user_canvas_state ucs
    set
      last_opened_canvas_id = null,
      updated_at = now()
    where ucs.last_opened_canvas_id = v_canvas_id
      and ucs.user_id <> v_owner_id;

    return coalesce(new, old);
  end if;

  -- Published with changed access: keep joined users attached, switch role automatically.
  update public.canvas_permissions cp
  set
    role = v_effective_access,
    updated_at = now()
  where cp.canvas_id = v_canvas_id
    and cp.user_id <> v_owner_id
    and cp.role in ('viewer', 'editor')
    and cp.role is distinct from v_effective_access;

  if v_effective_access = 'viewer' then
    -- Downgrade to viewer: clear non-owner editor sessions.
    delete from public.canvas_editor_sessions ces
    where ces.canvas_id = v_canvas_id
      and ces.user_id <> v_owner_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_shared_canvases_sync_memberships on public.shared_canvases;
create trigger trg_shared_canvases_sync_memberships
after insert or update or delete
on public.shared_canvases
for each row
execute function public.sync_shared_canvas_memberships();

create or replace function public.propagate_canvas_name_to_shares()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.shared_canvases
    set
      canvas_name = case
        when position('/' in new.name) > 0 then split_part(new.name, '/', 1)
        else new.name
      end,
      page_name = case
        when position('/' in new.name) > 0 then split_part(new.name, '/', 2)
        else 'page-1.cnvs'
      end
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

create or replace function public.sync_canvas_owner_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.canvas_permissions cp
  where cp.canvas_id = new.id
    and cp.role = 'owner'
    and cp.user_id <> new.user_id;

  insert into public.canvas_permissions (canvas_id, user_id, role, granted_by)
  values (new.id, new.user_id, 'owner', new.user_id)
  on conflict (canvas_id, user_id)
  do update
    set role = 'owner',
        granted_by = excluded.granted_by,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_canvases_sync_owner_permission on public.canvases;
create trigger trg_canvases_sync_owner_permission
after insert or update of user_id
on public.canvases
for each row
execute function public.sync_canvas_owner_permission();

-- Safety backfill for reruns on partially-seeded DBs.
insert into public.canvas_permissions (canvas_id, user_id, role, granted_by)
select c.id, c.user_id, 'owner', c.user_id
from public.canvases c
on conflict (canvas_id, user_id)
do update
  set role = 'owner',
      granted_by = excluded.granted_by,
      updated_at = now();

-- -----------------------------------------------------------------------------
-- RLS helpers (SECURITY DEFINER reads canvases without RLS; avoids policy recursion)
-- -----------------------------------------------------------------------------

create or replace function public.auth_is_canvas_owner(p_canvas_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.canvases c
    where c.id = p_canvas_id
      and c.user_id = auth.uid()
  );
$$;

revoke all on function public.auth_is_canvas_owner(uuid) from public;
grant execute on function public.auth_is_canvas_owner(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Row-Level Security — OFF for app tables
-- Strict RLS caused recursion (500) and blocked RPC/table paths. Access control:
-- - GRANT: anon has no table access; authenticated has CRUD where granted below.
-- - RPCs still enforce rules (e.g. ownership checks inside SECURITY DEFINER functions).
-- Re-enable RLS with non-recursive policies before production multi-tenant hardening.
-- -----------------------------------------------------------------------------

drop policy if exists "canvases_select_own_or_shared" on public.canvases;
drop policy if exists "canvases_insert_own" on public.canvases;
drop policy if exists "canvases_update_owner_or_shared_editor" on public.canvases;
drop policy if exists "canvases_delete_own" on public.canvases;

drop policy if exists "shared_canvases_select_any" on public.shared_canvases;
drop policy if exists "shared_canvases_select_member" on public.shared_canvases;
drop policy if exists "shared_canvases_insert_owner" on public.shared_canvases;
drop policy if exists "shared_canvases_update_owner" on public.shared_canvases;
drop policy if exists "shared_canvases_delete_owner" on public.shared_canvases;

drop policy if exists "canvas_permissions_select_self" on public.canvas_permissions;

drop policy if exists "user_canvas_state_select_self" on public.user_canvas_state;
drop policy if exists "user_canvas_state_insert_self" on public.user_canvas_state;
drop policy if exists "user_canvas_state_update_self" on public.user_canvas_state;
drop policy if exists "user_canvas_state_delete_self" on public.user_canvas_state;

alter table public.canvases disable row level security;
alter table public.shared_canvases disable row level security;
alter table public.canvas_permissions disable row level security;
alter table public.user_canvas_state disable row level security;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

revoke select on table public.canvases from anon;
grant select, insert, update, delete on table public.canvases to authenticated;

revoke select on table public.shared_canvases from anon;
grant select, insert, update, delete on table public.shared_canvases to authenticated;

revoke select on table public.canvas_permissions from anon;
grant select on table public.canvas_permissions to authenticated;

revoke select on table public.user_canvas_state from anon;
grant select, insert, update, delete on table public.user_canvas_state to authenticated;

revoke all on table public.canvas_editor_sessions from anon, authenticated;

grant all on table public.canvases to service_role;
grant all on table public.shared_canvases to service_role;
grant all on table public.canvas_permissions to service_role;
grant all on table public.user_canvas_state to service_role;
grant all on table public.canvas_editor_sessions to service_role;

-- -----------------------------------------------------------------------------
-- RPC helpers
-- -----------------------------------------------------------------------------

create or replace function public.decode_hex_to_text(p_hex text)
returns text
language plpgsql
immutable
as $$
declare
  v_payload text := btrim(coalesce(p_hex, ''));
  v_base64 text;
  v_pad_len int;
  v_bytes bytea;
begin
  if v_payload = '' then
    return null;
  end if;

  if v_payload !~ '^[A-Za-z0-9_-]+$' then
    return null;
  end if;

  begin
    v_base64 := replace(replace(v_payload, '-', '+'), '_', '/');
    v_pad_len := (4 - (length(v_base64) % 4)) % 4;
    if v_pad_len > 0 then
      v_base64 := v_base64 || repeat('=', v_pad_len);
    end if;
    v_bytes := decode(v_base64, 'base64');
    return convert_from(v_bytes, 'UTF8');
  exception when others then
    return null;
  end;
end;
$$;

comment on function public.decode_hex_to_text(text)
is 'Decodes compact URL-safe base64 tokens into UTF-8 text.';

create or replace function public.list_owned_canvases()
returns table (
  id uuid,
  name text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  return query
    select c.id, c.name, c.updated_at
    from public.canvases c
    where c.user_id = v_user_id
    order by c.updated_at desc;
end;
$$;

revoke all on function public.list_owned_canvases() from public;
grant execute on function public.list_owned_canvases() to authenticated;

create or replace function public.list_joined_canvases()
returns table (
  id uuid,
  name text,
  updated_at timestamptz,
  role text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  return query
    select c.id, c.name, c.updated_at, cp.role
    from public.canvas_permissions cp
    join public.canvases c on c.id = cp.canvas_id
    where cp.user_id = v_user_id
      and cp.role in ('viewer', 'editor')
      and c.user_id <> v_user_id
    order by c.updated_at desc;
end;
$$;

revoke all on function public.list_joined_canvases() from public;
grant execute on function public.list_joined_canvases() to authenticated;

-- Remove legacy overloads so PostgREST does not hit ambiguous RPC signatures.
drop function if exists public.sync_canvas_permission_from_share(uuid);

create or replace function public.sync_canvas_permission_from_share(
  p_canvas_id uuid,
  p_access_level text default null
)
returns table (
  canvas_id uuid,
  user_id uuid,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_share_access text;
  v_next_role text;
begin
  if p_canvas_id is null or v_user_id is null then
    return;
  end if;

  select
    c.user_id,
    case
      when exists (
        select 1
        from public.shared_canvases sc_editor
        where sc_editor.canvas_id = c.id
          and sc_editor.access_level = 'editor'
      ) then 'editor'
      when exists (
        select 1
        from public.shared_canvases sc_viewer
        where sc_viewer.canvas_id = c.id
          and sc_viewer.access_level = 'viewer'
      ) then 'viewer'
      else null
    end
  into v_owner_id, v_share_access
  from public.canvases c
  where c.id = p_canvas_id
  limit 1;

  if v_owner_id is null then
    return;
  end if;

  if v_user_id = v_owner_id then
    v_next_role := 'owner';
  elsif lower(coalesce(v_share_access, '')) = 'editor' then
    if lower(coalesce(p_access_level, '')) = 'viewer' then
      v_next_role := 'viewer';
    else
      v_next_role := 'editor';
    end if;
  elsif lower(coalesce(v_share_access, '')) = 'viewer' then
    v_next_role := 'viewer';
  else
    return;
  end if;

  insert into public.canvas_permissions (canvas_id, user_id, role, granted_by)
  values (p_canvas_id, v_user_id, v_next_role, v_owner_id)
  on conflict (canvas_id, user_id)
  do update
    set role = case
      when public.canvas_permissions.role = 'owner' then 'owner'
      when excluded.role = 'editor' then 'editor'
      when public.canvas_permissions.role = 'editor' then 'editor'
      else excluded.role
    end,
    granted_by = excluded.granted_by,
    updated_at = now();

  return query
    select cp.canvas_id, cp.user_id, cp.role
    from public.canvas_permissions cp
    where cp.canvas_id = p_canvas_id
      and cp.user_id = v_user_id
    limit 1;
end;
$$;

revoke all on function public.sync_canvas_permission_from_share(uuid, text) from public;
grant execute on function public.sync_canvas_permission_from_share(uuid, text) to authenticated;

create or replace function public.set_last_opened_canvas_id(
  p_canvas_id uuid
)
returns table (
  canvas_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_has_access boolean := false;
begin
  if v_user_id is null then
    return;
  end if;

  if p_canvas_id is null then
    insert into public.user_canvas_state (user_id, last_opened_canvas_id, updated_at)
    values (v_user_id, null, now())
    on conflict (user_id)
    do update
      set last_opened_canvas_id = null,
          updated_at = now();

    return query select null::uuid;
    return;
  end if;

  select exists (
    select 1
    from public.canvases c
    left join public.canvas_permissions cp
      on cp.canvas_id = c.id
     and cp.user_id = v_user_id
    where c.id = p_canvas_id
      and (
        c.user_id = v_user_id
        or cp.role in ('owner', 'editor', 'viewer')
      )
  ) into v_has_access;

  if not v_has_access then
    return;
  end if;

  insert into public.user_canvas_state (user_id, last_opened_canvas_id, updated_at)
  values (v_user_id, p_canvas_id, now())
  on conflict (user_id)
  do update
    set last_opened_canvas_id = excluded.last_opened_canvas_id,
        updated_at = now();

  return query select p_canvas_id;
end;
$$;

revoke all on function public.set_last_opened_canvas_id(uuid) from public;
grant execute on function public.set_last_opened_canvas_id(uuid) to authenticated;

create or replace function public.get_last_opened_canvas_id()
returns table (
  canvas_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  return query
    select ucs.last_opened_canvas_id
    from public.user_canvas_state ucs
    left join public.canvases c on c.id = ucs.last_opened_canvas_id
    left join public.canvas_permissions cp
      on cp.canvas_id = ucs.last_opened_canvas_id
     and cp.user_id = v_user_id
    where ucs.user_id = v_user_id
      and (
        ucs.last_opened_canvas_id is null
        or c.user_id = v_user_id
        or cp.role in ('owner', 'editor', 'viewer')
      )
    limit 1;
end;
$$;

revoke all on function public.get_last_opened_canvas_id() from public;
grant execute on function public.get_last_opened_canvas_id() to authenticated;

create or replace function public.get_canvas_for_user(
  p_canvas_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  name text,
  blocks jsonb,
  drawings jsonb,
  pan_x double precision,
  pan_y double precision,
  zoom double precision,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if p_canvas_id is null or v_user_id is null then
    return;
  end if;

  return query
    select
      c.id,
      c.user_id,
      c.name,
      c.blocks,
      c.drawings,
      c.pan_x,
      c.pan_y,
      c.zoom,
      c.updated_at
    from public.canvases c
    where c.id = p_canvas_id
      and (
        c.user_id = v_user_id
        or exists (
          select 1
          from public.canvas_permissions cp
          where cp.canvas_id = c.id
            and cp.user_id = v_user_id
            and cp.role in ('owner', 'editor', 'viewer')
        )
        or exists (
          select 1
          from public.shared_canvases sc
          where sc.canvas_id = c.id
            and sc.access_level in ('viewer', 'editor')
        )
      )
    limit 1;
end;
$$;

revoke all on function public.get_canvas_for_user(uuid) from public;
grant execute on function public.get_canvas_for_user(uuid) to authenticated;

create or replace function public.create_canvas_with_unique_name(
  p_name text,
  p_blocks jsonb default '[]'::jsonb,
  p_drawings jsonb default '[]'::jsonb,
  p_pan_x double precision default 0,
  p_pan_y double precision default 0,
  p_zoom double precision default 1
)
returns table (
  id uuid,
  name text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_base_name text := btrim(coalesce(p_name, ''));
  v_canvas_slug text;
  v_page_slug text;
  v_candidate_name text;
  v_attempt int := 0;
  v_max_attempts int := 30;
begin
  if v_user_id is null then
    raise exception 'not allowed';
  end if;

  if v_base_name = '' then
    v_base_name := 'untitled-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text || '/page-1.cnvs';
  end if;

  if position('/' in v_base_name) > 0 then
    v_canvas_slug := split_part(v_base_name, '/', 1);
    v_page_slug := split_part(v_base_name, '/', 2);
  else
    v_canvas_slug := v_base_name;
    v_page_slug := 'page-1.cnvs';
  end if;

  v_canvas_slug := coalesce(nullif(btrim(v_canvas_slug), ''), 'untitled');
  v_page_slug := coalesce(nullif(btrim(v_page_slug), ''), 'page-1.cnvs');

  loop
    if v_attempt = 0 then
      v_candidate_name := v_canvas_slug || '/' || v_page_slug;
    else
      v_candidate_name := v_canvas_slug || '-' || (v_attempt + 1)::text || '/' || v_page_slug;
    end if;

    begin
      insert into public.canvases (user_id, name, blocks, drawings, pan_x, pan_y, zoom)
      values (
        v_user_id,
        v_candidate_name,
        coalesce(p_blocks, '[]'::jsonb),
        coalesce(p_drawings, '[]'::jsonb),
        coalesce(p_pan_x, 0),
        coalesce(p_pan_y, 0),
        coalesce(p_zoom, 1)
      )
      returning canvases.id, canvases.name, canvases.updated_at
      into id, name, updated_at;

      return next;
      return;
    exception
      when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt >= v_max_attempts then
          raise exception 'could not generate unique canvas name';
        end if;
    end;
  end loop;
end;
$$;

revoke all on function public.create_canvas_with_unique_name(text, jsonb, jsonb, double precision, double precision, double precision) from public;
grant execute on function public.create_canvas_with_unique_name(text, jsonb, jsonb, double precision, double precision, double precision) to authenticated;

-- Drop legacy overloads so PostgREST never picks the wrong signature (400 Bad Request).
drop function if exists public.upsert_canvas_share(uuid);
drop function if exists public.upsert_canvas_share(uuid, text);

-- Returns json (not SETOF) so PostgREST/supabase-js get a single object — avoids
-- RETURNS TABLE + RETURN NEXT quirks that surface as HTTP 400.
create or replace function public.upsert_canvas_share(
  p_canvas_id uuid,
  p_access_level text default 'viewer'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level text;
  v_uid uuid := auth.uid();
  v_tok text;
  v_owner text;
  v_cname text;
  v_pname text;
  v_acc text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_level := lower(btrim(coalesce(p_access_level, 'viewer')));
  if v_level not in ('viewer', 'editor') then
    v_level := 'viewer';
  end if;

  if not exists (
    select 1
    from public.canvases c
    where c.id = p_canvas_id
      and c.user_id = v_uid
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  begin
    insert into public.shared_canvases (canvas_id, access_level)
    values (p_canvas_id, v_level)
    on conflict (canvas_id, access_level)
    do update
      set access_level = excluded.access_level
    returning
      share_token,
      owner_username,
      canvas_name,
      page_name,
      access_level
    into v_tok, v_owner, v_cname, v_pname, v_acc;
  exception
    when others then
      if sqlerrm like '%no unique or exclusion constraint matching the ON CONFLICT specification%' then
        insert into public.shared_canvases (canvas_id, access_level)
        values (p_canvas_id, v_level)
        on conflict (canvas_id)
        do update
          set access_level = excluded.access_level
        returning
          share_token,
          owner_username,
          canvas_name,
          page_name,
          access_level
        into v_tok, v_owner, v_cname, v_pname, v_acc;
      else
        raise;
      end if;
  end;

  return json_build_object(
    'share_token', v_tok,
    'owner_username', v_owner,
    'canvas_name', v_cname,
    'page_name', v_pname,
    'access_level', v_acc
  );
end;
$$;

revoke all on function public.upsert_canvas_share(uuid, text) from public;
grant execute on function public.upsert_canvas_share(uuid, text) to authenticated;

create or replace function public.claim_editor_slot(
  p_canvas_id uuid,
  p_client_id text default null,
  p_ttl_seconds integer default 90
)
returns table (
  granted boolean,
  active_count integer,
  limit_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := 20;
  v_ttl integer := greatest(30, least(300, coalesce(p_ttl_seconds, 90)));
  v_has_access boolean := false;
  v_active integer := 0;
begin
  if p_canvas_id is null or v_user_id is null then
    return query select false, 0, v_limit;
    return;
  end if;

  select exists (
    select 1
    from public.canvases c
    left join public.canvas_permissions cp
      on cp.canvas_id = c.id
     and cp.user_id = v_user_id
    where c.id = p_canvas_id
      and (
        c.user_id = v_user_id
        or cp.role in ('owner', 'editor', 'viewer')
        or exists (
          select 1
          from public.shared_canvases sc
          where sc.canvas_id = c.id
            and sc.access_level in ('viewer', 'editor')
        )
      )
  ) into v_has_access;

  if not v_has_access then
    return query select false, 0, v_limit;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('editor_slot:' || p_canvas_id::text));

  delete from public.canvas_editor_sessions
  where canvas_id = p_canvas_id
    and expires_at <= now();

  delete from public.canvas_editor_sessions
  where canvas_id = p_canvas_id
    and user_id = v_user_id;

  select count(distinct user_id)
  into v_active
  from public.canvas_editor_sessions
  where canvas_id = p_canvas_id
    and expires_at > now();

  if v_active >= v_limit then
    return query select false, v_active, v_limit;
    return;
  end if;

  insert into public.canvas_editor_sessions (canvas_id, user_id, client_id, last_seen_at, expires_at)
  values (
    p_canvas_id,
    v_user_id,
    coalesce(p_client_id, ''),
    now(),
    now() + make_interval(secs => v_ttl)
  );

  select count(distinct user_id)
  into v_active
  from public.canvas_editor_sessions
  where canvas_id = p_canvas_id
    and expires_at > now();

  return query select true, v_active, v_limit;
end;
$$;

revoke all on function public.claim_editor_slot(uuid, text, integer) from public;
grant execute on function public.claim_editor_slot(uuid, text, integer) to authenticated;

create or replace function public.release_editor_slot(
  p_canvas_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if p_canvas_id is null or v_user_id is null then
    return false;
  end if;

  delete from public.canvas_editor_sessions
  where canvas_id = p_canvas_id
    and user_id = v_user_id;

  return found;
end;
$$;

revoke all on function public.release_editor_slot(uuid) from public;
grant execute on function public.release_editor_slot(uuid) to authenticated;

create or replace function public.open_page_api_link(
  p_user_token text,
  p_canvas_token text,
  p_page_token text
)
returns table (
  canvas_id       uuid,
  owner_user_id   uuid,
  owner_username  text,
  canvas_name     text,
  page_name       text,
  is_share        boolean,
  share_access    text,
  can_edit        boolean,
  blocks          jsonb,
  drawings        jsonb,
  pan_x           double precision,
  pan_y           double precision,
  zoom            double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_token text := btrim(coalesce(p_user_token, ''));
  v_canvas_token text := btrim(coalesce(p_canvas_token, ''));
  v_page_token text := btrim(coalesce(p_page_token, ''));
  v_prefix text;
  v_owner_identity text;
  v_owner_username text;
  v_owner_user_id_text text;
  v_owner_user_id uuid;
  v_share_token text;
  v_share_requires_editor boolean := false;
  v_canvas text;
  v_page text;
begin
  if v_user_token = '' or v_canvas_token = '' or v_page_token = '' then
    return;
  end if;

  v_prefix := left(v_user_token, 2);

  if v_prefix in ('sh', 'se') then
    v_share_requires_editor := (v_prefix = 'se');
    v_owner_identity := public.decode_hex_to_text(substr(v_user_token, 3));
    if btrim(coalesce(v_owner_identity, '')) = '' then
      return;
    end if;

    v_owner_username := split_part(v_owner_identity, '|', 1);
    v_owner_user_id_text := nullif(split_part(v_owner_identity, '|', 2), '');
    if v_owner_user_id_text is not null and v_owner_user_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_owner_user_id := v_owner_user_id_text::uuid;
    end if;

    if v_canvas_token !~ '^[0-9a-f]+$' or v_page_token !~ '^[0-9a-f]+$' then
      return;
    end if;

    v_share_token := lower(v_canvas_token || v_page_token);

    return query
      with matched as (
        select
          c.id as canvas_id,
          c.user_id as owner_user_id,
          lower(sc.owner_username) as owner_username,
          case when position('/' in c.name) > 0 then split_part(c.name, '/', 1) else c.name end as canvas_name,
          case when position('/' in c.name) > 0 then split_part(c.name, '/', 2) else 'page-1.cnvs' end as page_name,
          true as is_share,
          sc.access_level as share_access,
          (
            v_share_requires_editor
            and auth.uid() is not null
            and (
              auth.uid() = c.user_id
              or sc.access_level = 'editor'
              or exists (
                select 1
                from public.canvas_permissions cp
                where cp.canvas_id = c.id
                  and cp.user_id = auth.uid()
                  and cp.role in ('owner', 'editor')
              )
            )
          ) as can_edit,
          c.blocks,
          c.drawings,
          c.pan_x,
          c.pan_y,
          c.zoom
        from public.shared_canvases sc
        join public.canvases c on c.id = sc.canvas_id
        where sc.share_token = v_share_token
          and lower(sc.owner_username) = lower(v_owner_username)
          and (v_owner_user_id is null or c.user_id = v_owner_user_id)
      ), counts as (
        select count(*) as total from matched
      )
      select matched.*
      from matched, counts
      where counts.total = 1;
    return;
  end if;

  if v_prefix <> 'pg' then
    return;
  end if;

  v_owner_identity := public.decode_hex_to_text(substr(v_user_token, 3));
  if btrim(coalesce(v_owner_identity, '')) = '' then
    return;
  end if;

  v_owner_username := split_part(v_owner_identity, '|', 1);
  v_owner_user_id_text := nullif(split_part(v_owner_identity, '|', 2), '');
  if v_owner_user_id_text is not null and v_owner_user_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_user_id := v_owner_user_id_text::uuid;
  end if;

  v_canvas := public.decode_hex_to_text(v_canvas_token);
  v_page := public.decode_hex_to_text(v_page_token);

  if btrim(coalesce(v_owner_username, '')) = '' or btrim(coalesce(v_canvas, '')) = '' or btrim(coalesce(v_page, '')) = '' then
    return;
  end if;

  if right(v_page, 5) <> '.cnvs' then
    v_page := v_page || '.cnvs';
  end if;

  if v_owner_user_id is not null then
    return query
      with matched as (
        select
          c.id as canvas_id,
          c.user_id as owner_user_id,
          lower(v_owner_username) as owner_username,
          case when position('/' in c.name) > 0 then split_part(c.name, '/', 1) else c.name end as canvas_name,
          case when position('/' in c.name) > 0 then split_part(c.name, '/', 2) else 'page-1.cnvs' end as page_name,
          false as is_share,
          null::text as share_access,
          auth.uid() is not null and auth.uid() = c.user_id as can_edit,
          c.blocks,
          c.drawings,
          c.pan_x,
          c.pan_y,
          c.zoom,
          case when c.name = v_canvas || '/' || v_page then 0 else 1 end as priority,
          c.updated_at
        from public.canvases c
        where c.user_id = v_owner_user_id
          and (
            c.name = v_canvas || '/' || v_page
            or c.name = v_canvas
          )
      ), ranked as (
        select matched.*, row_number() over (order by priority, updated_at desc) as rn, count(*) over () as total
        from matched
      )
      select
        ranked.canvas_id,
        ranked.owner_user_id,
        ranked.owner_username,
        ranked.canvas_name,
        ranked.page_name,
        ranked.is_share,
        ranked.share_access,
        ranked.can_edit,
        ranked.blocks,
        ranked.drawings,
        ranked.pan_x,
        ranked.pan_y,
        ranked.zoom
      from ranked
      where rn = 1 and total = 1;
    return;
  end if;

  return query
    with owner_users as (
      select u.id
      from auth.users u
      where lower(coalesce(nullif(split_part(u.email, '@', 1), ''), 'user')) = lower(v_owner_username)
    ), matched as (
      select
        c.id as canvas_id,
        c.user_id as owner_user_id,
        lower(v_owner_username) as owner_username,
        case when position('/' in c.name) > 0 then split_part(c.name, '/', 1) else c.name end as canvas_name,
        case when position('/' in c.name) > 0 then split_part(c.name, '/', 2) else 'page-1.cnvs' end as page_name,
        false as is_share,
        null::text as share_access,
        auth.uid() is not null and auth.uid() = c.user_id as can_edit,
        c.blocks,
        c.drawings,
        c.pan_x,
        c.pan_y,
        c.zoom,
        case when c.name = v_canvas || '/' || v_page then 0 else 1 end as priority,
        c.updated_at
      from public.canvases c
      join owner_users ou on ou.id = c.user_id
      where c.name = v_canvas || '/' || v_page
         or c.name = v_canvas
    ), ranked as (
      select matched.*, row_number() over (order by priority, updated_at desc) as rn, count(*) over () as total
      from matched
    )
    select
      ranked.canvas_id,
      ranked.owner_user_id,
      ranked.owner_username,
      ranked.canvas_name,
      ranked.page_name,
      ranked.is_share,
      ranked.share_access,
      ranked.can_edit,
      ranked.blocks,
      ranked.drawings,
      ranked.pan_x,
      ranked.pan_y,
      ranked.zoom
    from ranked
    where rn = 1 and total = 1;
end;
$$;

revoke all on function public.open_page_api_link(text, text, text) from public;
grant execute on function public.open_page_api_link(text, text, text) to anon, authenticated;

drop function if exists public.open_page_api_link_with_join(text, text, text);

create or replace function public.open_page_api_link_with_join(
  p_user_token text,
  p_canvas_token text,
  p_page_token text
)
returns table (
  canvas_id       uuid,
  owner_user_id   uuid,
  owner_username  text,
  canvas_name     text,
  page_name       text,
  is_share        boolean,
  share_access    text,
  can_edit        boolean,
  blocks          jsonb,
  drawings        jsonb,
  pan_x           double precision,
  pan_y           double precision,
  zoom            double precision
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prefix text := left(btrim(coalesce(p_user_token, '')), 2);
  v_role text;
begin
  select
    r.canvas_id,
    r.owner_user_id,
    r.owner_username,
    r.canvas_name,
    r.page_name,
    r.is_share,
    r.share_access,
    r.can_edit,
    r.blocks,
    r.drawings,
    r.pan_x,
    r.pan_y,
    r.zoom
  into
    canvas_id,
    owner_user_id,
    owner_username,
    canvas_name,
    page_name,
    is_share,
    share_access,
    can_edit,
    blocks,
    drawings,
    pan_x,
    pan_y,
    zoom
  from public.open_page_api_link(p_user_token, p_canvas_token, p_page_token) r
  limit 1;

  if canvas_id is null then
    return;
  end if;

  if is_share and v_uid is not null and (owner_user_id is null or owner_user_id <> v_uid) then
    v_role := 'viewer';
    if lower(coalesce(share_access, '')) = 'editor' and v_prefix = 'se' then
      v_role := 'editor';
    end if;

    insert into public.canvas_permissions (canvas_id, user_id, role, granted_by)
    values (canvas_id, v_uid, v_role, owner_user_id)
    on conflict (canvas_id, user_id)
    do update
      set role = case
        when public.canvas_permissions.role = 'owner' then 'owner'
        when excluded.role = 'editor' then 'editor'
        when public.canvas_permissions.role = 'editor' then 'editor'
        else excluded.role
      end,
      granted_by = excluded.granted_by,
      updated_at = now();
  end if;

  return next;
end;
$$;

revoke all on function public.open_page_api_link_with_join(text, text, text) from public;
grant execute on function public.open_page_api_link_with_join(text, text, text) to anon, authenticated;

drop function if exists public.get_page_preview_metadata(text, text, text);

create or replace function public.get_page_preview_metadata(
  p_user_token text,
  p_canvas_token text,
  p_page_token text
)
returns table (
  title text,
  description text,
  access_type text,
  canvas_label text,
  page_label text,
  is_share_link boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prefix text := left(btrim(coalesce(p_user_token, '')), 2);
  v_canvas text;
  v_page text;
  v_is_share boolean;
  v_can_edit boolean;
  v_share_access text;
  v_access text;
  v_app_desc text := 'CNVS is an infinite canvas workspace for notes, drawings, media, and real-time collaboration. Organize visual thinking with multi-page canvases and share with viewer or editor access.';
begin
  select
    r.canvas_name,
    r.page_name,
    r.is_share,
    r.can_edit,
    r.share_access
  into
    v_canvas,
    v_page,
    v_is_share,
    v_can_edit,
    v_share_access
  from public.open_page_api_link(p_user_token, p_canvas_token, p_page_token) r
  limit 1;

  if btrim(coalesce(v_canvas, '')) = '' then
    return;
  end if;

  v_access := 'Editable';
  if v_is_share then
    if v_prefix = 'se' and v_can_edit and lower(coalesce(v_share_access, '')) = 'editor' then
      v_access := 'Editable';
    else
      v_access := 'View only';
    end if;
  end if;

  title := 'CNVS | ' || v_canvas || ' - ' || coalesce(v_page, 'page-1.cnvs') || ' | ' || v_access;
  description := v_app_desc || ' Canvas: ' || v_canvas || '. Page: ' || coalesce(v_page, 'page-1.cnvs') || '. Access: ' || v_access || '.';
  access_type := lower(replace(v_access, ' ', '-'));
  canvas_label := v_canvas;
  page_label := coalesce(v_page, 'page-1.cnvs');
  is_share_link := coalesce(v_is_share, false);

  return next;
end;
$$;

revoke all on function public.get_page_preview_metadata(text, text, text) from public;
grant execute on function public.get_page_preview_metadata(text, text, text) to anon, authenticated;

create or replace function public.resolve_user_canvas(
  p_owner_username text,
  p_canvas_name text,
  p_page_name text default null
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
  where auth.uid() is not null
    and c.user_id = auth.uid()
    and lower(coalesce(nullif(split_part(u.email, '@', 1), ''), 'user')) = lower(p_owner_username)
    and (
      c.name = p_canvas_name || '/' || coalesce(p_page_name, 'page-1.cnvs')
      or c.name = p_canvas_name
    )
  order by
    case when c.name = p_canvas_name || '/' || coalesce(p_page_name, 'page-1.cnvs') then 0 else 1 end,
    c.updated_at desc
  limit 1;
$$;

revoke all on function public.resolve_user_canvas(text, text, text) from public;
grant execute on function public.resolve_user_canvas(text, text, text) to anon, authenticated;

create or replace function public.resolve_user_canvas(
  p_owner_username text,
  p_canvas_name text
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.resolve_user_canvas(p_owner_username, p_canvas_name, null);
$$;

revoke all on function public.resolve_user_canvas(text, text) from public;
grant execute on function public.resolve_user_canvas(text, text) to anon, authenticated;

create or replace function public.leave_joined_canvases(
  p_canvas_ids uuid[]
)
returns table (
  canvas_id uuid,
  left_ok boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_canvas_id uuid;
  v_owner_id uuid;
  v_deleted boolean;
begin
  if v_user_id is null then
    return;
  end if;

  if p_canvas_ids is null or coalesce(array_length(p_canvas_ids, 1), 0) = 0 then
    return;
  end if;

  for v_canvas_id in
    select distinct unnest(p_canvas_ids)
  loop
    if v_canvas_id is null then
      continue;
    end if;

    select c.user_id
    into v_owner_id
    from public.canvases c
    where c.id = v_canvas_id
    limit 1;

    if v_owner_id is null or v_owner_id = v_user_id then
      canvas_id := v_canvas_id;
      left_ok := false;
      return next;
      continue;
    end if;

    delete from public.canvas_permissions cp
    where cp.canvas_id = v_canvas_id
      and cp.user_id = v_user_id
      and cp.role in ('viewer', 'editor');

    v_deleted := found;

    if v_deleted then
      delete from public.canvas_editor_sessions ces
      where ces.canvas_id = v_canvas_id
        and ces.user_id = v_user_id;

      update public.user_canvas_state ucs
      set
        last_opened_canvas_id = null,
        updated_at = now()
      where ucs.user_id = v_user_id
        and ucs.last_opened_canvas_id = v_canvas_id;
    end if;

    canvas_id := v_canvas_id;
    -- Idempotent leave: non-owner users are considered successfully left
    -- even when no permission row exists anymore.
    left_ok := true;
    return next;
  end loop;
end;
$$;

revoke all on function public.leave_joined_canvases(uuid[]) from public;
grant execute on function public.leave_joined_canvases(uuid[]) to authenticated;
