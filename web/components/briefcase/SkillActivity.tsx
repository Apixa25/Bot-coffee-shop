'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Item = { botId: string; sourceBotId: string; skillId: string; skillName: string };

/** Review skills your bots received through an approved trade (never your own). */
export default function SkillActivity({ bots }: { bots: { id: string; name: string }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [received, setReceived] = useState<Item[]>([]);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<Record<string, string>>({});
  const mine = useMemo(() => new Set(bots.map((b) => b.id)), [bots]);
  const key = (i: { botId: string; sourceBotId: string; skillId: string }) => `${i.botId}:${i.sourceBotId}:${i.skillId}`;

  const load = useCallback(async () => {
    const [{ data }, { data: revs }] = await Promise.all([
      supabase.from('skill_requests').select('requester_bot_id, source_bot_id, skill_id, skill_name').eq('status', 'approved'),
      supabase.from('skill_reviews').select('reviewer_bot_id, source_bot_id, skill_id').in('reviewer_bot_id', [...mine]),
    ]);
    const seen = new Set<string>();
    setReceived((data || [])
      .filter((r) => mine.has(r.requester_bot_id) && !mine.has(r.source_bot_id))
      .map((r) => ({ botId: r.requester_bot_id, sourceBotId: r.source_bot_id, skillId: r.skill_id, skillName: r.skill_name || r.skill_id }))
      .filter((i) => (seen.has(key(i)) ? false : (seen.add(key(i)), true))));
    setReviewed(new Set((revs || []).map((r) => key({ botId: r.reviewer_bot_id, sourceBotId: r.source_bot_id, skillId: r.skill_id }))));
  }, [supabase, mine]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(() => { void load(); }, [load]);

  const review = async (i: Item, stars: number, body: string) => {
    const { error } = await supabase.from('skill_reviews').insert({ reviewer_bot_id: i.botId, source_bot_id: i.sourceBotId, skill_id: i.skillId, stars, body });
    setMsg((x) => ({ ...x, [key(i)]: error ? (error.code === '23505' ? 'Already reviewed.' : error.message) : 'Thanks, review saved.' }));
    if (!error) setReviewed((r) => new Set(r).add(key(i)));
  };

  return (
    <section className="rounded-2xl border border-latte bg-white/80 p-5 shadow-sm" data-testid="skill-reviews">
      <h2 className="text-xl font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Review skills you received</h2>
      <p className="text-sm text-espresso/70 mb-3">Only skills your bots got through an approved trade can be reviewed. You can&apos;t review your own skills.</p>
      {received.length === 0 ? <p className="text-sm">No received skills yet.</p> : (
        <ul className="space-y-3">
          {received.map((i) => (
            <Row key={key(i)} i={i} botName={bots.find((b) => b.id === i.botId)?.name || ''} done={reviewed.has(key(i))} msg={msg[key(i)]} onReview={review} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ i, botName, done, msg, onReview }: {
  i: Item; botName: string; done: boolean; msg?: string; onReview: (i: Item, s: number, b: string) => void;
}) {
  const [stars, setStars] = useState(5);
  const [body, setBody] = useState('');
  return (
    <li className="rounded-xl border border-latte bg-cream p-3 text-sm">
      <div className="font-semibold">{i.skillName} <span className="font-normal text-espresso/60">· received by {botName}</span></div>
      {done ? <p className="mt-1 text-xs text-green-700">✓ You reviewed this skill.</p> : (
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
