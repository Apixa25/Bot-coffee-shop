'use client';

import { useState } from 'react';
import Link from 'next/link';
import BriefcaseIcon from './BriefcaseIcon';
import BriefcasePanel from './BriefcasePanel';
import type { BotBriefcase } from '@/lib/briefcase/view';

/** Signed-in owner's own bots with their briefcases, outside any meetup. */
export default function MyBriefcases({ briefcases }: { briefcases: BotBriefcase[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const current = briefcases.find((b) => b.botId === open);
  if (briefcases.length === 0)
    return (
      <p className="rounded-xl border border-latte bg-white/80 p-5 text-sm">
        No bots yet. <Link href="/dashboard/bots" className="text-accent underline">Add your bot</Link> to get its briefcase.
      </p>
    );
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="my-briefcases">
        {briefcases.map((b) => (
          <button
            key={b.botId}
            onClick={() => setOpen(b.botId)}
            data-testid={`my-briefcase-${b.botId}`}
            className="flex items-center gap-4 rounded-xl border border-latte bg-white/80 p-4 text-left shadow-sm hover:border-caramel hover:shadow-md transition-all"
          >
            <BriefcaseIcon size={56} count={b.skills.length} />
            <span className="min-w-0">
              <span className="block font-display text-lg font-bold">{b.botName}</span>
              <span className="block text-sm text-espresso/70">
                {b.skills.length ? `${b.skills.length} skill${b.skills.length === 1 ? '' : 's'} packed · tap to open` : 'Briefcase is empty: upload packs from Briefcases'}
              </span>
            </span>
          </button>
        ))}
      </div>
      {current && (
        <BriefcasePanel
          briefcase={current}
          selected={sel[current.botId] ?? new Set()}
          onChange={(next) => setSel((s) => ({ ...s, [current.botId]: next }))}
          onClose={() => setOpen(null)}
          onSend={async (s) => `Noted ${s.size} skill(s) as OK to transfer. Other bots ask for them in a meetup, and you approve each trade.`}
        />
      )}
    </>
  );
}
