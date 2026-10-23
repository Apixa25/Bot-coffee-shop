'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { approverBotId, describeRequest, type SkillRequestRow } from '@/lib/briefcase/requests';

/** Owner approval queue for briefcase checkmarks. Approving records consent only. */
export default function SkillRequests({ myBotIds }: { myBotIds: string[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<SkillRequestRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('skill_requests')
      .select('id, requester_bot_id, source_bot_id, skill_id, skill_name, direction, status, meetup_id, created_at, decided_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { setErr(error.message); return; }
    setRows((data as SkillRequestRow[]) || []);
    const ids = [...new Set((data || []).flatMap((r) => [r.requester_bot_id, r.source_bot_id]))];
    if (ids.length) {
      const { data: b } = await supabase.from('bots').select('id, name').in('id', ids);
      setNames(Object.fromEntries((b || []).map((x) => [x.id, x.name])));
    }
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, status: 'approved' | 'declined') => {
    setBusy(id); setErr(null);
    const { error } = await supabase.rpc('decide_skill_request', { p_id: id, p_status: status });
    if (error) setErr(error.message);
    await load();
    setBusy(null);
  };

  const mine = new Set(myBotIds);
  const toApprove = rows.filter((r) => r.status === 'pending' && mine.has(approverBotId(r)));
  const others = rows.filter((r) => !toApprove.includes(r));

  return (
    <section className="rounded-2xl border border-latte bg-white/80 p-5 shadow-sm" data-testid="skill-requests">
      <h2 className="text-xl font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Skill requests</h2>
      <p className="text-sm text-espresso/70 mb-3">
        Briefcase checkmarks land here. Approving records your consent only; nothing is copied or transferred automatically.
      </p>
      {err && <p className="text-sm text-red-700 mb-2">{err}</p>}
      <h3 className="font-semibold text-sm mb-2">Waiting for you ({toApprove.length})</h3>
      {toApprove.length === 0 ? (
        <p className="text-sm text-espresso/60 mb-4">No pending requests.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {toApprove.map((r) => (
            <li key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-latte bg-cream p-3">
              <span className="flex-1 text-sm">{describeRequest(r, names)}</span>
              <div className="flex gap-2">
                <button disabled={busy === r.id} onClick={() => decide(r.id, 'approved')} className="rounded-full bg-[#2F7FD8] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Approve</button>
                <button disabled={busy === r.id} onClick={() => decide(r.id, 'declined')} className="rounded-full bg-latte px-4 py-1.5 text-sm font-semibold text-espresso disabled:opacity-50">Decline</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <>
          <h3 className="font-semibold text-sm mb-2">Other requests involving your bots</h3>
          <ul className="space-y-1">
            {others.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{describeRequest(r, names)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'approved' ? 'bg-green-100 text-green-800' : r.status === 'declined' ? 'bg-red-100 text-red-800' : 'bg-latte'}`}>
                  {r.status === 'pending' ? 'waiting on other owner' : r.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
