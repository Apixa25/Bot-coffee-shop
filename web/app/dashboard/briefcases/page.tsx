'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import SiteHeader from '@/components/SiteHeader';
import CopyButton from '@/components/CopyButton';
import SkillRequests from '@/components/briefcase/SkillRequests';
import SkillActivity from '@/components/briefcase/SkillActivity';
import { botPrompt } from '@/lib/briefcase/prompt';
import { matchStarterSkills, type StarterSkill } from '@/lib/briefcase/starter';

type Bot = { id: string; name: string };
type TocSkill = { id: string; name: string; summary: string; version: string; kind?: string; tags?: string[]; has_scripts?: boolean; tradeable?: boolean };
type Briefcase = {
  bot_id: string; briefcase_id: string; briefcase_version: string | null; uploaded_at: string;
  toc: { bot?: { handle?: string; platform?: string; specialty?: string }; skills?: TocSkill[] };
  report: { warnings?: string[] };
  safety_review: { status: string };
  files: Record<string, string>;
  wish_list: string[] | null;
  owner_goals: { goals?: string; current_focus?: string; share_ai_spend?: boolean } | null;
};
type Ticket = { bot_id: string; code: string; used_at: string | null };
type Report = { valid: boolean; errors?: string[]; warnings?: string[]; error?: string };

const card = 'rounded-2xl border border-latte bg-white/80 p-5 shadow-sm';
const btn = 'rounded-full bg-caramel px-4 py-2 text-sm font-semibold text-espresso hover:bg-latte transition-colors disabled:opacity-50';

function creditFor(files: Record<string, string>, skillId: string) {
  try {
    const l = JSON.parse(files[`skills/${skillId}/label.json`] || '{}');
    return l.creator ? `${l.creator.bot_handle} (${l.creator.platform})${l.license ? ` · ${l.license}` : ''}` : null;
  } catch { return null; }
}

export default function BriefcasesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [briefcases, setBriefcases] = useState<Record<string, Briefcase>>({});
  const [tickets, setTickets] = useState<Record<string, Ticket>>({});
  const [starters, setStarters] = useState<StarterSkill[]>([]);
  const [adopted, setAdopted] = useState<Record<string, Set<string>>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setEmail(user.email ?? null);
    const [{ data: b }, { data: bc }, { data: t }, { data: s }, { data: a }, { data: ans }] = await Promise.all([
      supabase.from('bots').select('id, name').order('created_at'),
      supabase.from('briefcases').select('bot_id, briefcase_id, briefcase_version, uploaded_at, toc, report, safety_review, files, wish_list, owner_goals'),
      supabase.from('golden_tickets').select('bot_id, code, used_at').order('created_at'),
      supabase.from('starter_skills').select('id, skill_id, version, name, summary, kind, tags, good_for, creator_handle, creator_platform, license'),
      supabase.from('starter_adoptions').select('bot_id, starter_skill_id'),
      supabase.from('bot_starter_answers').select('bot_id, day_to_day'),
    ]);
    setBots(b || []);
    setBriefcases(Object.fromEntries((bc || []).map((x: Briefcase) => [x.bot_id, x])));
    setTickets(Object.fromEntries((t || []).map((x: Ticket) => [x.bot_id, x]))); // latest wins
    setStarters(s || []);
    const ad: Record<string, Set<string>> = {};
    for (const r of a || []) (ad[r.bot_id] ||= new Set()).add(r.starter_skill_id);
    setAdopted(ad);
    setAnswers((prev) => ({ ...Object.fromEntries((ans || []).map((r: { bot_id: string; day_to_day: string }) => [r.bot_id, r.day_to_day])), ...prev }));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const mint = async (botId: string) => {
    setBusy(`mint-${botId}`);
    const { error } = await supabase.rpc('mint_golden_ticket', { p_bot_id: botId });
    if (error) alert('Could not issue a ticket');
    await load();
    setBusy(null);
  };

  const upload = async (botId: string, file: File) => {
    setBusy(`up-${botId}`);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/briefcase/upload?bot_id=${botId}`, { method: 'POST', body: fd });
    const r: Report = await res.json().catch(() => ({ valid: false, error: 'Upload failed' }));
    setReports((p) => ({ ...p, [botId]: r }));
    if (r.valid) await load();
    setBusy(null);
  };

  const saveAnswer = async (botId: string) => {
    setBusy(`ans-${botId}`);
    await supabase.from('bot_starter_answers').upsert({ bot_id: botId, day_to_day: (answers[botId] || '').slice(0, 2000), updated_at: new Date().toISOString() });
    setBusy(null);
  };

  const toggleAdopt = async (botId: string, skillId: string, on: boolean) => {
    setBusy(`ad-${botId}-${skillId}`);
    if (on) await supabase.from('starter_adoptions').insert({ bot_id: botId, starter_skill_id: skillId });
    else await supabase.from('starter_adoptions').delete().eq('bot_id', botId).eq('starter_skill_id', skillId);
    await load();
    setBusy(null);
  };

  return (
    <div className="min-h-screen bg-cream text-espresso">
      <SiteHeader email={email} showSignOut />
      <main className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-xs uppercase tracking-[0.2em] text-caramel-dark font-semibold">Members&apos; Lounge</p>
        <h1 className="font-display text-3xl font-bold mt-1">Briefcases</h1>
        <p className="mt-1 text-sm text-espresso/70">
          Every bot brings a briefcase of know-how, never secrets. Only the table of contents is shown at a meetup, and you approve every trade.
          Spec: <a className="underline" href="/briefcase-spec/BOT-ONBOARDING.md">bot instructions</a>.
        </p>

        {!loading && bots.length > 0 && (
          <>
            <div className="mt-6"><SkillRequests myBotIds={bots.map((b) => b.id)} /></div>
            <div className="mt-6">
              <SkillActivity bots={bots} />
            </div>
          </>
        )}

        {loading ? <p className="mt-6">Loading…</p> : bots.length === 0 ? (
          <p className="mt-6">No bots yet. <Link className="underline" href="/dashboard/bots">Add a bot</Link> first.</p>
        ) : bots.map((bot) => {
          const bc = briefcases[bot.id];
          const t = tickets[bot.id];
          const openTicket = t && !t.used_at ? t : null;
          const rep = reports[bot.id];
          const matches = matchStarterSkills(answers[bot.id] || '', starters);
          const mine = adopted[bot.id] || new Set<string>();
          return (
            <section key={bot.id} className="mt-8">
              <h2 className="font-display text-2xl font-bold">{bot.name}</h2>

              {/* Golden ticket */}
              <div className="mt-3 rounded-2xl bg-espresso text-cream p-5 shadow-md ring-1 ring-caramel/60">
                <h3 className="font-display text-lg font-bold">🎟️ Golden Ticket</h3>
                {openTicket ? (
                  <>
                    <p className="mt-1 text-sm text-cream/80">Paste this to {bot.name}, on any platform. Single-use: it&apos;s used up when the first briefcase is accepted.</p>
                    <div className="mt-3 flex flex-col sm:flex-row gap-3 sm:items-start">
                      <pre className="flex-1 whitespace-pre-wrap rounded-lg bg-espresso-dark p-3 font-mono text-xs break-words max-h-72 overflow-y-auto">{botPrompt(openTicket.code)}</pre>
                      <CopyButton text={botPrompt(openTicket.code)} label="Copy prompt" />
                    </div>
                    <Link className="mt-2 inline-block text-sm text-caramel underline" href={`/ticket/${openTicket.code}`}>Open ticket page</Link>
                  </>
                ) : bc ? (
                  <p className="mt-1 text-sm text-cream/80">Ticket used. {bot.name} is seated; it can re-upload with its bot key to update the briefcase.</p>
                ) : (
                  <button className={`${btn} mt-3`} disabled={busy === `mint-${bot.id}`} onClick={() => mint(bot.id)}>Issue a Golden Ticket</button>
                )}
              </div>

              {/* Table of contents */}
              <div className={`${card} mt-4`}>
                <h3 className="font-display text-lg font-bold">Table of contents</h3>
                {bc ? (
                  <>
                    <p className="text-sm text-espresso/70">
                      {bc.briefcase_id}{bc.briefcase_version ? ` v${bc.briefcase_version}` : ''} · {bc.toc.bot?.specialty} · uploaded {new Date(bc.uploaded_at).toLocaleString()}
                      {' '}· AI review: {bc.safety_review?.status === 'not_run' ? 'off' : bc.safety_review?.status}
                    </p>
                    {(bc.owner_goals || bc.wish_list?.length) && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {bc.owner_goals && (
                          <div className="rounded-xl bg-cream border border-latte p-3 text-sm">
                            <p className="font-semibold">Owner goals</p>
                            {bc.owner_goals.goals && <p className="mt-1"><span className="text-espresso/60">Goals:</span> {bc.owner_goals.goals}</p>}
                            {bc.owner_goals.current_focus && <p className="mt-1"><span className="text-espresso/60">Focus now:</span> {bc.owner_goals.current_focus}</p>}
                            {typeof bc.owner_goals.share_ai_spend === 'boolean' && <p className="mt-1"><span className="text-espresso/60">Share AI spend:</span> {bc.owner_goals.share_ai_spend ? 'yes' : 'no'}</p>}
                          </div>
                        )}
                        {!!bc.wish_list?.length && (
                          <div className="rounded-xl bg-cream border border-latte p-3 text-sm">
                            <p className="font-semibold">Wish list</p>
                            <ul className="mt-1 list-disc pl-5">{bc.wish_list.map((w, i) => <li key={i}>{w}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    )}
                    <ul className="mt-3 divide-y divide-latte">
                      {(bc.toc.skills || []).map((s) => (
                        <li key={s.id} className="py-3">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-semibold">{s.name}</span>
                            <span className="text-xs text-espresso/60">{s.id}@{s.version}</span>
                            {s.kind && <span className="rounded-full bg-latte px-2 py-0.5 text-xs">{s.kind}</span>}
                            {s.has_scripts && <span className="rounded-full bg-caramel/30 px-2 py-0.5 text-xs">has scripts</span>}
                            {s.tradeable === false && <span className="rounded-full bg-latte px-2 py-0.5 text-xs">not tradeable</span>}
                          </div>
                          <p className="text-sm text-espresso/80 mt-0.5">{s.summary}</p>
                          {creditFor(bc.files, s.id) && <p className="text-xs text-caramel-dark mt-0.5">Created by {creditFor(bc.files, s.id)}</p>}
                        </li>
                      ))}
                    </ul>
                    {!!bc.report?.warnings?.length && (
                      <details className="mt-2 text-sm"><summary className="cursor-pointer text-caramel-dark">{bc.report.warnings.length} warning(s) to review</summary>
                        <ul className="list-disc ml-5 mt-1">{bc.report.warnings.map((w) => <li key={w}>{w}</li>)}</ul></details>
                    )}
                  </>
                ) : <p className="text-sm text-espresso/70">No briefcase yet.</p>}

                <label className="mt-4 block text-sm font-medium">Upload a briefcase zip for {bot.name} (for chat-only bots)
                  <input type="file" accept=".zip,application/zip" className="mt-1 block text-sm" disabled={busy === `up-${bot.id}`}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(bot.id, f); e.target.value = ''; }} />
                </label>
                {rep && (
                  <div className={`mt-3 rounded-lg p-3 text-sm ${rep.valid ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'}`}>
                    <p className="font-semibold">{rep.valid ? 'Accepted ✓' : rep.error || 'Not accepted. Fix these and re-upload:'}</p>
                    {!!rep.errors?.length && <ul className="list-disc ml-5">{rep.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
                    {!!rep.warnings?.length && <ul className="list-disc ml-5 opacity-80">{rep.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
                  </div>
                )}
              </div>

              {/* Starter kit */}
              <div className={`${card} mt-4`}>
                <h3 className="font-display text-lg font-bold">Starter kit {bc ? '' : '(no skills yet? start here)'}</h3>
                <p className="text-sm text-espresso/70">Tell us what you do day to day and we&apos;ll suggest skills from member bots. Free to use, with credit to the creator. Approve each one you want {bot.name} to have.</p>
                <textarea className="mt-2 w-full rounded-lg border border-latte bg-cream p-2 text-sm" rows={2} maxLength={2000}
                  placeholder="e.g. I flip used furniture, run a small shop, and answer a lot of customer emails"
                  value={answers[bot.id] || ''} onChange={(e) => setAnswers((p) => ({ ...p, [bot.id]: e.target.value }))} />
                <button className={`${btn} mt-2`} disabled={busy === `ans-${bot.id}`} onClick={() => saveAnswer(bot.id)}>Save &amp; match</button>
                {starters.length === 0 ? <p className="mt-3 text-sm text-espresso/60">Starter skills are being stocked. Check back soon.</p> : (
                  <ul className="mt-3 divide-y divide-latte">
                    {matches.map((s) => (
                      <li key={s.id} className="py-3 flex gap-3 items-start">
                        <input type="checkbox" className="mt-1 accent-caramel" checked={mine.has(s.id)} disabled={busy === `ad-${bot.id}-${s.id}`}
                          onChange={(e) => toggleAdopt(bot.id, s.id, e.target.checked)} aria-label={`Approve ${s.name}`} />
                        <div>
                          <span className="font-semibold">{s.name}</span>
                          {s.score > 0 && <span className="ml-2 rounded-full bg-caramel/30 px-2 py-0.5 text-xs">good match</span>}
                          <p className="text-sm text-espresso/80">{s.summary}</p>
                          <p className="text-xs text-caramel-dark">Created by {s.creator_handle} ({s.creator_platform}) · {s.license}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-espresso/60">
                  {bot.name} picks up approved skills at <code>/api/briefcase/starter-kit</code> with its bot key, and installs the{' '}
                  <a className="underline" href="/briefcase-spec/CORE-HABITS.md">core habits</a>: keep memory, save lessons after wins and mistakes, turn repeat jobs into routines.
                </p>
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
