-- =============================================================================
-- CNVS — Combined baseline migration
-- Merges baseline + compact-token/perf + collaboration/editor access into one idempotent file.
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

-- owner_username / canvas_name / page_name are populated automatically by trigger on insert.
create table if not exists public.shared_canvases (
  id              uuid        primary key default gen_random_uuid(),
  canvas_id       uuid        not null references public.canvases(id) on delete cascade,
  share_token     text        not null unique default encode(gen_random_bytes(16), 'hex'),
  owner_username  text        not null,
  canvas_name     text        not null,
  page_name       text        not null default 'page-1.cnvs',
  created_at      timestamptz not null default now()
);

alter table public.shared_canvases
  add column if not exists page_name text;

update public.shared_canvases sc
set
  canvas_name = case
    when position('/' in c.name) > 0 then split_part(c.name, '/', 1)
    else c.name
  end,
  page_name = case
    when position('/' in c.name) > 0 then split_part(c.name, '/', 2)
    else 'page-1.cnvs'
  end
from public.canvases c
where c.id = sc.canvas_id
  and (
    sc.page_name is null
    or btrim(sc.page_name) = ''
    or position('/' in c.name) > 0
  );

update public.shared_canvases
set page_name = 'page-1.cnvs'
where page_name is null or btrim(page_name) = '';

update public.shared_canvases sc
set owner_username = lower(coalesce(nullif(split_part(u.email, '@', 1), ''), 'user'))
from public.canvases c
join auth.users u on u.id = c.user_id
where sc.canvas_id = c.id;

alter table public.shared_canvases
  alter column page_name set default 'page-1.cnvs';

alter table public.shared_canvases
  alter column page_name set not null;

alter table public.shared_canvases
  add column if not exists access_level text;

update public.shared_canvases
set access_level = 'viewer'
where access_level is null or btrim(access_level) = '';

alter table public.shared_canvases
  alter column access_level set default 'viewer';

alter table public.shared_canvases
  alter column access_level set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shared_canvases_access_level_check'
      and conrelid = 'public.shared_canvases'::regclass
  ) then
    alter table public.shared_canvases
      add constraint shared_canvases_access_level_check
      check (access_level in ('viewer', 'editor'));
  end if;
end $$;

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
create index        if not exists canvases_name_user_updated_idx
  on public.canvases(name, user_id, updated_at desc);

-- shared_canvases
create unique index if not exists shared_canvases_canvas_id_key
  on public.shared_canvases(canvas_id);
create unique index if not exists shared_canvases_share_token_key
  on public.shared_canvases(share_token);
drop index if exists shared_canvases_owner_canvas_key;
create unique index if not exists shared_canvases_owner_canvas_page_key   -- unique public route per user+name+page
  on public.shared_canvases(owner_username, canvas_name, page_name);
create index if not exists shared_canvases_share_lookup_idx
  on public.shared_canvases(share_token, owner_username, canvas_id);
create index if not exists shared_canvases_canvas_access_idx
  on public.shared_canvases(canvas_id, access_level);

do $$
begin
  begin
    execute 'create index if not exists auth_users_email_localpart_idx on auth.users ((lower(coalesce(nullif(split_part(email, ''@'', 1), ''''), ''user''))))';
  exception
    when insufficient_privilege then
      -- Managed auth schema may not be owned by migration role; continue without this optional index.
      null;
  end;
end $$;

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


-- 2. Auto-populate owner_username + canvas_name + page_name whenever a shared_canvases
--    row is inserted or its canvas_id is changed.
create or replace function public.sync_shared_canvas_route_fields()
returns trigger
language plpgsql
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

  new.canvas_name     := coalesce(nullif(v_canvas_name, ''), 'untitled');
  new.page_name       := coalesce(nullif(v_page_name, ''), 'page-1.cnvs');
  new.owner_username  := coalesce(v_owner_username, 'user');
  return new;
end;
$$;

drop trigger if exists trg_shared_canvases_sync_route_fields on public.shared_canvases;
create trigger trg_shared_canvases_sync_route_fields
before insert or update of canvas_id
on public.shared_canvases
for each row
execute function public.sync_shared_canvas_route_fields();


-- 3. Keep canvas_name/page_name in shared_canvases in sync when a canvas is renamed.
create or replace function public.propagate_canvas_name_to_shares()
returns trigger
language plpgsql
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
      and auth.uid() is not null
  )
);

drop policy if exists "canvases_insert_own" on public.canvases;
create policy "canvases_insert_own"
on public.canvases for insert
with check (auth.uid() = user_id);

drop policy if exists "canvases_update_own" on public.canvases;
drop policy if exists "canvases_update_owner_or_shared_editor" on public.canvases;
create policy "canvases_update_owner_or_shared_editor"
on public.canvases for update
using (
  auth.uid() = user_id
  or (
    auth.uid() is not null
    and exists (
      select 1
      from public.shared_canvases sc
      where sc.canvas_id = canvases.id
        and sc.access_level = 'editor'
    )
  )
)
with check (
  auth.uid() = user_id
  or (
    auth.uid() is not null
    and exists (
      select 1
      from public.shared_canvases sc
      where sc.canvas_id = canvases.id
        and sc.access_level = 'editor'
    )
  )
);

drop policy if exists "canvases_delete_own" on public.canvases;
create policy "canvases_delete_own"
on public.canvases for delete
using (auth.uid() = user_id);

-- shared_canvases policies
drop policy if exists "shared_canvases_select_any" on public.shared_canvases;
create policy "shared_canvases_select_any"
on public.shared_canvases for select
using (auth.uid() is not null);

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
-- Privileges (required by PostgREST in addition to RLS policies)
-- -----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

revoke select on table public.canvases from anon;
grant select, insert, update, delete on table public.canvases to authenticated;

revoke select on table public.shared_canvases from anon;
grant select, insert, update, delete on table public.shared_canvases to authenticated;

grant all on table public.canvases to service_role;
grant all on table public.shared_canvases to service_role;

-- -----------------------------------------------------------------------------
-- RPC helpers
-- -----------------------------------------------------------------------------

drop function if exists public.resolve_shared_canvas(text, text, text);
drop function if exists public.resolve_shared_canvas(text, text);

create or replace function public.decode_hex_to_text(p_hex text)
returns text
language plpgsql
immutable
as $$
declare
  v_payload text := btrim(coalesce(p_hex, ''));
  v_legacy_hex text := regexp_replace(v_payload, '[\.-]', '', 'g');
  v_base64 text;
  v_pad_len int;
  v_bytes bytea;
begin
  if v_payload = '' then
    return null;
  end if;

  -- New compact tokens: URL-safe base64 (no dots/dashes separators inside payload).
  if v_payload ~ '^[A-Za-z0-9_-]+$' then
    begin
      v_base64 := replace(replace(v_payload, '-', '+'), '_', '/');
      v_pad_len := (4 - (length(v_base64) % 4)) % 4;
      if v_pad_len > 0 then
        v_base64 := v_base64 || repeat('=', v_pad_len);
      end if;
      v_bytes := decode(v_base64, 'base64');
      return convert_from(v_bytes, 'UTF8');
    exception when others then
      -- Fall through to legacy hex decoding.
    end;
  end if;

  -- Legacy dotted/dashed hex tokens.
  if v_legacy_hex = '' or v_legacy_hex !~ '^[0-9a-fA-F]+$' or length(v_legacy_hex) % 2 <> 0 then
    return null;
  end if;

  begin
    v_bytes := decode(v_legacy_hex, 'hex');
    return convert_from(v_bytes, 'UTF8');
  exception when others then
    return null;
  end;
end;
$$;

comment on function public.decode_hex_to_text(text)
is 'Decodes compact URL-safe base64 tokens (preferred) and legacy dotted/dashed hex tokens into UTF-8 text.';


create or replace function public.upsert_canvas_share(
  p_canvas_id uuid,
  p_access_level text default 'viewer'
)
returns table (
  share_token text,
  owner_username text,
  canvas_name text,
  page_name text,
  access_level text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access text := lower(btrim(coalesce(p_access_level, 'viewer')));
begin
  if v_access not in ('viewer', 'editor') then
    v_access := 'viewer';
  end if;

  if not exists (
    select 1
    from public.canvases c
    where c.id = p_canvas_id
      and c.user_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  insert into public.shared_canvases (canvas_id, access_level)
  values (p_canvas_id, v_access)
  on conflict (canvas_id)
  do update
    set access_level = excluded.access_level
  returning
    public.shared_canvases.share_token,
    public.shared_canvases.owner_username,
    public.shared_canvases.canvas_name,
    public.shared_canvases.page_name,
    public.shared_canvases.access_level
  into share_token, owner_username, canvas_name, page_name, access_level;

  return next;
end;
$$;

revoke all on function public.upsert_canvas_share(uuid, text) from public;
grant execute on function public.upsert_canvas_share(uuid, text) to authenticated;


-- Resolves segmented API route:
--   /<userToken>?<canvasToken>=<pageToken>.page
-- userToken prefix:
--   pg => owner route
--   sh => shared view route (always readonly)
--   se => shared edit route (requires login, plus editor access for non-owner)
drop function if exists public.open_page_api_link(text);
drop function if exists public.open_page_api_link(text, text, text);

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
  v_share_left text;
  v_share_right text;
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

    -- New format uses raw split share token halves to keep URLs compact.
    if v_canvas_token ~ '^[0-9a-f]+$' and v_page_token ~ '^[0-9a-f]+$' then
      v_share_token := lower(v_canvas_token || v_page_token);
    else
      -- Backward compatibility for legacy encoded share halves.
      v_share_left := public.decode_hex_to_text(v_canvas_token);
      v_share_right := public.decode_hex_to_text(v_page_token);
      if v_share_left is null or v_share_right is null then
        return;
      end if;
      v_share_token := v_share_left || v_share_right;
    end if;

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
            and (auth.uid() = c.user_id or sc.access_level = 'editor')
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

revoke all    on function public.open_page_api_link(text, text, text) from public;
grant execute on function public.open_page_api_link(text, text, text) to anon, authenticated;


-- Resolves /:username/:canvasName  →  canvas_id via canvases directly.
create or replace function public.resolve_user_canvas(
  p_owner_username  text,
  p_canvas_name     text,
  p_page_name       text default null
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
    and lower(coalesce(nullif(split_part(u.email, '@', 1), ''), 'user')) = p_owner_username
    and (
      c.name = p_canvas_name || '/' || coalesce(p_page_name, 'page-1.cnvs')
      or c.name = p_canvas_name
    )
  order by
    case when c.name = p_canvas_name || '/' || coalesce(p_page_name, 'page-1.cnvs') then 0 else 1 end,
    c.updated_at desc
  limit 1;
$$;

revoke all    on function public.resolve_user_canvas(text, text, text) from public;
grant execute on function public.resolve_user_canvas(text, text, text) to anon, authenticated;

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
  select public.resolve_user_canvas(p_owner_username, p_canvas_name, null);
$$;

revoke all    on function public.resolve_user_canvas(text, text) from public;
grant execute on function public.resolve_user_canvas(text, text) to anon, authenticated;