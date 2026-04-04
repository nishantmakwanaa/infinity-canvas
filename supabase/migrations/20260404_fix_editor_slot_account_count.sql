-- Ensure editor-slot counting is per authenticated account (auth.uid), not per duplicate session row.
-- Safe to run on existing environments.

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
    left join public.shared_canvases sc on sc.canvas_id = c.id
    where c.id = p_canvas_id
      and (
        c.user_id = v_user_id
        or sc.access_level = 'editor'
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

  -- Keep a single logical slot per account on each canvas.
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
