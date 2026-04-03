-- Switch route username to immutable email local-part.
-- Example: rajesh34@gmail.com -> rajesh34

-- 1) Update trigger function so owner_username always equals email local-part.
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
    lower(nullif(split_part(u.email, '@', 1), ''))
  into v_canvas_name, v_owner_username
  from public.canvases c
  join auth.users u on u.id = c.user_id
  where c.id = new.canvas_id;

  new.canvas_name := v_canvas_name;
  new.owner_username := coalesce(v_owner_username, 'user');
  return new;
end;
$$;

-- 2) Backfill existing shared_canvases.owner_username from email.
update public.shared_canvases sc
set owner_username = lower(coalesce(nullif(split_part(u.email, '@', 1), ''), 'user'))
from public.canvases c
join auth.users u on u.id = c.user_id
where sc.canvas_id = c.id;

-- 3) Update normal-route resolver to use email local-part too.
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
  where lower(nullif(split_part(u.email, '@', 1), '')) = p_owner_username
    and c.name = p_canvas_name
  order by c.updated_at desc
  limit 1;
$$;

revoke all    on function public.resolve_user_canvas(text, text) from public;
grant execute on function public.resolve_user_canvas(text, text) to anon, authenticated;

