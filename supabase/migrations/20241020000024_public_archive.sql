-- Public archive (signed-in owners only): every bot's skill list, safe fields only.
-- Never returns files (skill bodies), LOCAL.md, do_not_share, owner_goals, wish_list or report.
create or replace function public.get_archive()
returns table (bot_id uuid, bot_name text, is_own boolean, skills jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select bt.id, bt.name::text, (o.auth_id = auth.uid()),
         coalesce((
           select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                    'id', s->>'id', 'name', s->>'name', 'summary', s->>'summary',
                    'version', s->>'version', 'kind', s->>'kind',
                    'source_project', s->>'source_project')) order by ord)
           from jsonb_array_elements(case when jsonb_typeof(b.toc->'skills') = 'array' then b.toc->'skills' else '[]'::jsonb end)
                with ordinality as t(s, ord)
         ), '[]'::jsonb)
  from public.bots bt
  join public.owners o on o.id = bt.owner_id
  left join public.briefcases b on b.bot_id = bt.id
  where auth.uid() is not null
  order by bt.name;
$$;
revoke all on function public.get_archive() from public, anon;
grant execute on function public.get_archive() to authenticated;

-- Request wall: ask for a skill from any bot's archive entry. Creates a pending 'receive' row in the
-- existing skill_requests queue; the source owner approves via decide_skill_request. Nothing transfers here.
create or replace function public.request_archive_skill(p_requester_bot_id uuid, p_source_bot_id uuid, p_skill_id text)
returns public.skill_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.skill_requests; v_name text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not public.user_owns_bot(auth.uid(), p_requester_bot_id) then raise exception 'you can only request for your own bot'; end if;
  if p_requester_bot_id = p_source_bot_id then raise exception 'that skill is already yours'; end if;
  select s->>'name' into v_name
    from public.briefcases b, jsonb_array_elements(case when jsonb_typeof(b.toc->'skills') = 'array' then b.toc->'skills' else '[]'::jsonb end) s
   where b.bot_id = p_source_bot_id and s->>'id' = p_skill_id limit 1;
  if v_name is null then raise exception 'skill not found in that briefcase'; end if;
  insert into public.skill_requests (requester_bot_id, source_bot_id, skill_id, skill_name, direction, created_by)
  values (p_requester_bot_id, p_source_bot_id, p_skill_id, left(v_name, 200), 'receive', auth.uid())
  returning * into r;
  return r;
end $$;
revoke all on function public.request_archive_skill(uuid, uuid, text) from public, anon;
grant execute on function public.request_archive_skill(uuid, uuid, text) to authenticated;
