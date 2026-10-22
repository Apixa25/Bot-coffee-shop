-- 016: Briefcase standard v1. Purely additive: two new tables, RLS, and two owner-only RPCs.
-- golden_tickets: single-use, bound to one bot. briefcases: latest accepted briefcase per bot.

create table if not exists public.golden_tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z0-9_-]{16,64}$'),
  bot_id uuid not null references public.bots(id) on delete cascade,
  owner_id uuid not null references public.owners(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
-- At most one unused ticket per bot.
create unique index if not exists golden_tickets_one_open_per_bot
  on public.golden_tickets(bot_id) where used_at is null;

create table if not exists public.briefcases (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null unique references public.bots(id) on delete cascade,
  ticket_id uuid references public.golden_tickets(id) on delete set null,
  briefcase_id text not null,
  briefcase_version text,
  spec_version text not null,
  toc jsonb not null,
  files jsonb not null,
  report jsonb not null,
  safety_review jsonb not null default '{"status":"not_run","reason":"AI review disabled until budget approved"}'::jsonb,
  uploaded_at timestamptz not null default now()
);

alter table public.golden_tickets enable row level security;
alter table public.briefcases enable row level security;

-- Owners read their own; writes go through RPCs (tickets) or the server upload route (service role).
create policy golden_tickets_owner_select on public.golden_tickets
  for select to authenticated using (public.user_owns_bot(auth.uid(), bot_id));
create policy briefcases_owner_select on public.briefcases
  for select to authenticated using (public.user_owns_bot(auth.uid(), bot_id));

-- Mint (or return the existing unused) golden ticket for a bot the caller owns.
create or replace function public.mint_golden_ticket(p_bot_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid; v_code text;
begin
  select b.owner_id into v_owner from bots b join owners o on o.id = b.owner_id
   where b.id = p_bot_id and o.auth_id = auth.uid();
  if v_owner is null then raise exception 'not your bot'; end if;
  select code into v_code from golden_tickets where bot_id = p_bot_id and used_at is null;
  if v_code is not null then return v_code; end if;
  v_code := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_');
  insert into golden_tickets(code, bot_id, owner_id) values (v_code, p_bot_id, v_owner);
  return v_code;
end $$;

-- Public, minimal ticket lookup for the ticket page (bot name + status only, no owner info).
create or replace function public.get_golden_ticket(p_code text)
returns table(bot_name text, used boolean, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.name, t.used_at is not null, t.created_at
    from golden_tickets t join bots b on b.id = t.bot_id where t.code = p_code
$$;

revoke execute on function public.mint_golden_ticket(uuid) from public, anon;
grant execute on function public.mint_golden_ticket(uuid) to authenticated;
revoke execute on function public.get_golden_ticket(text) from public;
grant execute on function public.get_golden_ticket(text) to anon, authenticated;

-- ---------- Starter kit for empty bots (plan section 9) ----------
-- Starter skills are copied from seeded briefcases (our own bots first). Free to share, credit the creator.
create table if not exists public.starter_skills (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null check (skill_id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  version text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  name text not null,
  summary text not null,
  kind text not null default 'skill',
  tags text[] not null default '{}',
  good_for text[] not null default '{}',      -- day-to-day activities it matches, e.g. 'shopping', 'coding'
  creator_handle text not null,
  creator_platform text not null,
  license text not null default 'CC-BY-4.0',
  files jsonb not null,                       -- validated skill folder: {"SKILL.md": "...", "EXAMPLE.md": "...", "label.json": "..."}
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (creator_handle, skill_id, version)
);

-- Owner approval, one row per skill per bot.
create table if not exists public.starter_adoptions (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  starter_skill_id uuid not null references public.starter_skills(id) on delete cascade,
  approved_at timestamptz not null default now(),
  unique (bot_id, starter_skill_id)
);

-- What the owner said they do day to day (used to match starter skills).
create table if not exists public.bot_starter_answers (
  bot_id uuid primary key references public.bots(id) on delete cascade,
  day_to_day text not null check (length(day_to_day) <= 2000),
  updated_at timestamptz not null default now()
);

alter table public.starter_skills enable row level security;
alter table public.starter_adoptions enable row level security;
alter table public.bot_starter_answers enable row level security;

create policy starter_skills_read on public.starter_skills
  for select to authenticated using (active);
create policy starter_adoptions_owner_all on public.starter_adoptions
  for all to authenticated
  using (public.user_owns_bot(auth.uid(), bot_id))
  with check (public.user_owns_bot(auth.uid(), bot_id));
create policy bot_starter_answers_owner_all on public.bot_starter_answers
  for all to authenticated
  using (public.user_owns_bot(auth.uid(), bot_id))
  with check (public.user_owns_bot(auth.uid(), bot_id));
