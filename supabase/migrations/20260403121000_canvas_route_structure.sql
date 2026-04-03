-- Route-structure migration for:
-- /:username/:canvasName
-- /:username/view/:canvasName
--
-- Keeps DB data aligned for username + canvas-name based links.

create extension if not exists pgcrypto;

-- Ensure each user has unique canvas names (needed for stable name-based routes).
create unique index if not exists canvases_user_id_name_key
  on public.canvases(user_id, name);

create index if not exists canvases_user_id_name_idx
  on public.canvases(user_id, name);

-- Store route metadata directly on shared_canvases for fast lookups.
alter table public.shared_canvases
  add column if not exists owner_username text,
  add column if not exists canvas_name text;

-- Backfill route metadata for existing rows.
update public.shared_canvases sc
set
  canvas_name = c.name,
  owner_username = lower(
    regexp_replace(
      coalesce(
        nullif(u.raw_user_meta_data ->> 'full_name', ''),
        nullif(u.raw_user_meta_data ->> 'name', ''),
        nullif(split_part(u.email, '@', 1), ''),
        'user'
      ),
      '\s+',
      '-',
      'g'
    )
  )
from public.canvases c
join auth.users u on u.id = c.user_id
where sc.canvas_id = c.id
  and (sc.canvas_name is null or sc.owner_username is null);

-- Enforce not-null after backfill.
alter table public.shared_canvases
  alter column canvas_name set not null,
  alter column owner_username set not null;

-- Fast route lookups.
create index if not exists shared_canvases_owner_canvas_idx
  on public.shared_canvases(owner_username, canvas_name);

-- Prevent duplicate public route entries for same user+canvas name.
create unique index if not exists shared_canvases_owner_canvas_key
  on public.shared_canvases(owner_username, canvas_name);

-- Keep shared route fields synced from source canvas/user.
create or replace function public.sync_shared_canvas_route_fields()
returns trigger
language plpgsql
as $$
declare
  v_canvas_name text;
  v_owner_username text;
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
        '\s+',
        '-',
        'g'
      )
    )
  into v_canvas_name, v_owner_username
  from public.canvases c
  join auth.users u on u.id = c.user_id
  where c.id = new.canvas_id;

  new.canvas_name := v_canvas_name;
  new.owner_username := v_owner_username;

  return new;
end;
$$;

drop trigger if exists trg_shared_canvases_sync_route_fields on public.shared_canvases;
create trigger trg_shared_canvases_sync_route_fields
before insert or update of canvas_id
on public.shared_canvases
for each row
execute function public.sync_shared_canvas_route_fields();

-- Keep shared route canvas_name updated if canvas name changes.
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
