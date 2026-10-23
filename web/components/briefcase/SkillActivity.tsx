'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Outcome } from '@/lib/briefcase/ratings';

type Item = { botId: string; sourceBotId: string; skillId: string; skillName: string; own: boolean };

/** Log runs, add evidence (own skills) and leave reviews (received skills). */
export default function SkillActivity({ bots, ownSkills }: {
  bots: { id: string; name: string }[];
  ownSkills: { botId: string; skillId: string; skillName: string }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [received, setReceived] = useState<Item[]>([]);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const mine = useMemo(() => new Set(bots.map((b) => b.id)), [bots]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('skill_requests').select('requester_bot_id, source_bot_id, skill_id, skill_name').eq('status', 'approved');
    setReceived((data || []).filter((r) => mine.has(r.requester_bot_id) && !mine.has(r.source_bot_id)).map((r) => ({
      botId: r.requester_bot_id, sourceBotId: r.source_bot_id, skillId: r.skill_id, skillName: r.skill_name || r.skill_id, own: false,
    })));
  }, [supabase, mine]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(() => { void load(); }, [load]);

  const items: Item[] = [
    ...ownSkills.map((s) => ({ botId: s.botId, sourceBotId: s.botId, skillId: s.skillId, skillName: s.skillName, own: true })),
    ...received,
  ];
  const key = (i: Item) => `${i.botId}:${i.sourceBotId}:${i.skillId}`;
  const say = (i: Item, m: string) => setMsg((x) => ({ ...x, [key(i)]: m }));

  const logRun = async (i: Item, outcome: Outcome) => {
    const { error } = await supabase.from('skill_runs').insert({ bot_id: i.botId, source_bot_id: i.sourceBotId, skill_id: i.skillId, outcome });
    say(i, error ? error.message : `Logged a ${outcome} run.`);
  };
  const addEvidence = async (i: Item, url: string) => {
    const res = await fetch('/api/skills/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_bot_id: i.sourceBotId, skill_id: i.skillId, url }) });
    const j = await res.json();
    say(i, res.ok ? `${j.verified ? '✓ Verified' : '? Unverified'}: ${j.detail}` : j.error);
  };
  const review = async (i: Item, stars: number, body: string) => {
    const { error } = await supabase.from('skill_reviews').insert({ reviewer_bot_id: i.botId, source_bot_id: i.sourceBotId, skill_id: i.skillId, stars, body });
    say(i, error ? (error.code === '42501' ? 'You can review after your bot has logged a run of this skill.' : error.code === '23505' ? 'Already reviewed.' : error.message) : 'Thanks, review saved.');
  };

  if (items.length === 0) return null;
  return (
    <section className="rounded-2xl border border-latte bg-white/80 p-5 shadow-sm" data-testid="skill-activity">
      <h2 className="text-xl font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Proof of use</h2>
      <p className="text-sm text-espresso/70 mb-3">Log each run of a skill. Add commits, PRs or releases it produced. Review skills your bot received after it has used them. You can&apos;t review your own skills.</p>
      <ul className="space-y-3">
        {items.map((i) => <Row key={key(i)} i={i} botName={bots.find((b) => b.id === i.botId)?.name || ''} msg={msg[key(i)]} onRun={logRun} onEvidence={addEvidence} onReview={review} />)}
      </ul>
    </section>
  );
}

function Row({ i, botName, msg, onRun, onEvidence, onReview }: {
  i: Item; botName: string; msg?: string;
  onRun: (i: Item, o: Outcome) => void; onEvidence: (i: Item, url: string) => void; onReview: (i: Item, s: number, b: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [stars, setStars] = useState(5);
  const [body, setBody] = useState('');
  return (
    <li className="rounded-xl border border-latte bg-cream p-3 text-sm">
      <div className="font-semibold">{i.skillName} <span className="font-normal text-espresso/60">· {i.own ? `${botName}'s own skill` : `received by ${botName}`}</span></div>
      <div className="mt-2 flex flex-wrap gap-2 items-center">
        <span className="text-xs">Log run:</span>
        {(['success', 'partial', 'failed'] as Outcome[]).map((o) => (
          <button key={o} onClick={() => onRun(i, o)} className="rounded-full bg-latte px-3 py-1 text-xs font-semibold">{o}</button>
        ))}
      </div>
      {i.own ? (
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/12" className="flex-1 rounded-lg border border-latte px-2 py-1 text-xs" />
          <button onClick={() => url && onEvidence(i, url)} className="rounded-full bg-caramel px-3 py-1 text-xs font-semibold text-espresso">Add evidence</button>
        </div>
      ) : (
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <select value={stars} onChange={(e) => setStars(Number(e.target.value))} className="rounded-lg border border-latte px-2 py-1 text-xs" aria-label="Stars">
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'⭐'.repeat(n)}</option>)}
          </select>
          <input value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} placeholder="Short review: what did it do for you?" className="flex-1 rounded-lg border border-latte px-2 py-1 text-xs" />
          <button onClick={() => onReview(i, stars, body)} className="rounded-full bg-[#2F7FD8] px-3 py-1 text-xs font-semibold text-white">Post review</button>
        </div>
      )}
      {msg && <p className="mt-1 text-xs text-espresso/80">{msg}</p>}
    </li>
  );
}
