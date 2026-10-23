'use client';

import { useState } from 'react';
import BriefcaseIcon from '@/components/briefcase/BriefcaseIcon';
import { filterArchive, type ArchiveBot, type ArchiveSkill } from '@/lib/briefcase/view';
import { createClient } from '@/lib/supabase/client';

function Meta({ s }: { s: ArchiveSkill }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
      <span className="px-2 py-0.5 rounded-full bg-latte">{s.version}</span>
      {/* Ratings hook: filled in once skill ratings merge. */}
      {s.stars != null ? (
        <span className="px-2 py-0.5 rounded-full bg-white border border-latte">⭐ {s.stars.toFixed(1)} ({s.reviews ?? 0}) · traded {s.traded ?? 0}</span>
      ) : (
        <span className="px-2 py-0.5 rounded-full bg-white border border-latte text-espresso/60">No reviews yet</span>
      )}
    </div>
  );
}

export default function ArchiveClient({ bots, myBots }: { bots: ArchiveBot[]; myBots: { id: string; name: string }[] }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(bots.find((b) => !b.isOwn && b.skills.length)?.botId ?? bots[0]?.botId ?? null);
  const [from, setFrom] = useState(myBots[0]?.id ?? '');
  const [msg, setMsg] = useState<Record<string, string>>({});
  const shown = filterArchive(bots, q);

  const request = async (bot: ArchiveBot, s: ArchiveSkill) => {
    const key = `${bot.botId}:${s.id}`;
    if (!from) return setMsg((m) => ({ ...m, [key]: 'Add a bot first, then request skills for it.' }));
    const { error } = await createClient().rpc('request_archive_skill', { p_requester_bot_id: from, p_source_bot_id: bot.botId, p_skill_id: s.id });
    setMsg((m) => ({ ...m, [key]: !error ? 'Requested. The owner will approve or decline.' : error.code === '23505' ? 'Already requested.' : error.message }));
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bots and skills" aria-label="Search the archive"
          className="flex-1 rounded-full border border-latte bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        {myBots.length > 0 && (
          <label className="text-sm flex items-center gap-2">Request for
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-full border border-latte bg-white px-3 py-2">
              {myBots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {shown.length === 0 && <p className="text-sm text-espresso/70">Nothing matches.</p>}
      <div className="space-y-3" data-testid="archive">
        {shown.map((b) => (
          <section key={b.botId} className="rounded-2xl border border-latte bg-white/80 shadow-sm">
            <button onClick={() => setOpen(open === b.botId ? null : b.botId)} className="w-full flex items-center gap-3 p-4 text-left">
              <BriefcaseIcon size={44} count={b.skills.length} />
              <span className="flex-1 min-w-0">
                <span className="font-display text-lg font-bold">{b.botName}</span>
                {b.isOwn && <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-latte font-semibold">Yours</span>}
                <span className="block text-sm text-espresso/70">{b.skills.length} skill{b.skills.length === 1 ? '' : 's'}</span>
              </span>
              <span className="text-caramel text-xl">{open === b.botId ? '▾' : '▸'}</span>
            </button>
            {open === b.botId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 pt-0">
                {b.skills.length === 0 && <p className="text-sm text-espresso/70">This briefcase is empty for now.</p>}
                {b.skills.map((s) => {
                  const key = `${b.botId}:${s.id}`;
                  return (
                    <div key={s.id} className="rounded-2xl border-2 border-latte bg-white p-4">
                      <h3 className="font-display font-bold">{s.name}</h3>
                      <p className="text-sm mt-1 text-espresso/85">{s.description}</p>
                      <Meta s={s} />
                      <div className="mt-3 rounded-xl bg-cream border border-dashed border-caramel px-3 py-2 text-xs text-espresso/80 flex items-center justify-between gap-2">
                        <span>🔒 Recipe hidden until the owner approves</span>
                        {!b.isOwn && (
                          <button onClick={() => request(b, s)} className="shrink-0 rounded-full bg-espresso text-cream px-3 py-1 font-semibold hover:bg-accent">Request</button>
                        )}
                      </div>
                      {msg[key] && <p className="mt-2 text-xs" aria-live="polite">{msg[key]}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
