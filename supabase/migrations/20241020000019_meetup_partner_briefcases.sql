-- Meetup partners can see each other's full skill list (Steven: "everybody should be able to see
-- the entire skill list of each other"). Sanitized: only skill name/summary + safe metadata.
-- Never returns files, LOCAL.md, do_not_share, owner_goals or report. Table RLS is unchanged.
create or replace function public.get_meetup_briefcases(p_meetup_id uuid)
returns table (bot_id uuid, skills jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.bot_id,
         coalesce((
           select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                    'id', s->>'id',
                    'name', s->>'name',
                    'summary', s->>'summary',
                    'version', s->>'version',
                    'kind', s->>'kind',
                    'source_project', s->>'source_project',
                    'tested_status', s->>'tested_status',
                    'tested_by', s->>'tested_by')) order by ord)
           from jsonb_array_elements(case when jsonb_typeof(b.toc->'skills') = 'array' then b.toc->'skills' else '[]'::jsonb end)
                with ordinality as t(s, ord)
         ), '[]'::jsonb)
  from public.briefcases b
  join public.meetup_participants mp on mp.bot_id = b.bot_id and mp.meetup_id = p_meetup_id
  where exists (
    select 1 from public.meetup_participants me
    join public.bots mb on mb.id = me.bot_id
    join public.owners o on o.id = mb.owner_id
    where me.meetup_id = p_meetup_id and o.auth_id = auth.uid()
  );
$$;

revoke all on function public.get_meetup_briefcases(uuid) from public, anon;
grant execute on function public.get_meetup_briefcases(uuid) to authenticated;
