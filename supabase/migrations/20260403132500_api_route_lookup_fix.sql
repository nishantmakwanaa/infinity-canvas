-- API route lookup fix for clean URL structure:
-- /:username/view/:canvasName
--
-- Adds an RPC to resolve route -> canvas_id safely and consistently.

create or replace function public.resolve_shared_canvas(
  p_owner_username text,
  p_canvas_name text
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
    and sc.canvas_name = p_canvas_name
  limit 1;
$$;

revoke all on function public.resolve_shared_canvas(text, text) from public;
grant execute on function public.resolve_shared_canvas(text, text) to anon, authenticated;

create index if not exists shared_canvases_route_lookup_idx
  on public.shared_canvases(owner_username, canvas_name);
