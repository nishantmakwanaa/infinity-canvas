-- =============================================================================
-- Incremental migration: compact token resolver + lookup tuning
-- =============================================================================

-- Lookup indexes for resolver paths under high traffic.
create index if not exists canvases_name_user_updated_idx
  on public.canvases(name, user_id, updated_at desc);

create index if not exists shared_canvases_share_lookup_idx
  on public.shared_canvases(share_token, owner_username, canvas_id);

create index if not exists auth_users_email_localpart_idx
  on auth.users ((lower(coalesce(nullif(split_part(email, '@', 1), ''), 'user'))));

-- Compact token decoder (URL-safe base64 preferred, legacy dotted/dashed hex fallback).
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
      -- Continue to legacy decoding.
    end;
  end if;

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

-- Optimized resolver:
-- - share path avoids auth.users join by using shared_canvases.owner_username
-- - owner path can bypass auth.users lookup when user_id exists in token
-- - preserves uniqueness guard (exactly one row must match)
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
  v_canvas text;
  v_page text;
begin
  if v_user_token = '' or v_canvas_token = '' or v_page_token = '' then
    return;
  end if;

  v_prefix := left(v_user_token, 2);

  if v_prefix = 'sh' then
    v_owner_identity := public.decode_hex_to_text(substr(v_user_token, 3));
    if btrim(coalesce(v_owner_identity, '')) = '' then
      return;
    end if;

    v_owner_username := split_part(v_owner_identity, '|', 1);
    v_owner_user_id_text := nullif(split_part(v_owner_identity, '|', 2), '');
    if v_owner_user_id_text is not null and v_owner_user_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_owner_user_id := v_owner_user_id_text::uuid;
    end if;

    if v_canvas_token ~ '^[0-9a-f]+$' and v_page_token ~ '^[0-9a-f]+$' then
      v_share_token := lower(v_canvas_token || v_page_token);
    else
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
          false as can_edit,
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
