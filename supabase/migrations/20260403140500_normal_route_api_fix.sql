-- Normal route API fix for clean path structure:
-- /:username/:canvasName
--
-- Adds a resolver function so frontend can map route params to a specific canvas.

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
      '\s+',
      '-',
      'g'
    )
  ) = p_owner_username
    and c.name = p_canvas_name
  order by c.updated_at desc
  limit 1;
$$;

revoke all on function public.resolve_user_canvas(text, text) from public;
grant execute on function public.resolve_user_canvas(text, text) to anon, authenticated;

create index if not exists canvases_name_updated_idx
  on public.canvases(name, updated_at desc);
