'use client';

import { useState } from 'react';
import BriefcaseIcon from './BriefcaseIcon';
import BriefcasePanel from './BriefcasePanel';
import type { BotBriefcase } from '@/lib/briefcase/view';

/**
 * Clickable briefcases overlaid next to each bot. `positions` are % of the room
 * (left, top) so they stay aligned when the room scales on mobile.
 */
export default function RoomBriefcases({
  briefcases,
  positions,
}: {
  briefcases: BotBriefcase[];
  positions: { left: number; top: number }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    if (typeof window === 'undefined') return init;
    for (const b of briefcases) {
      try {
        const raw = localStorage.getItem(`bcs-interest:${b.botId}`);
        if (raw) init[b.botId] = new Set(JSON.parse(raw).skill_ids || []);
      } catch {}
    }
    return init;
  });

  const current = briefcases.find((b) => b.botId === open);
  return (
    <>
      {briefcases.map((b, i) => {
        const p = positions[i];
        if (!p) return null;
        return (
          <button
            key={b.botId}
            data-testid={`briefcase-${b.botId}`}
            onClick={() => setOpen(b.botId)}
            aria-label={`Open ${b.botName}'s briefcase (${b.skills.length} skills)`}
            className="absolute z-30 -translate-x-1/2 -translate-y-1/2 transition hover:scale-110 hover:-rotate-3 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2F7FD8] rounded-xl animate-[bounce_2.5s_ease-in-out_3]"
            style={{ left: `${p.left}%`, top: `${p.top}%`, width: 'clamp(36px, 7vw, 64px)' }}
          >
            <span className="block w-full [&>span]:!w-full [&>span]:!h-auto [&_svg]:w-full [&_svg]:h-auto">
              <BriefcaseIcon count={b.skills.length} />
            </span>
          </button>
        );
      })}
      {current && (
        <BriefcasePanel
          briefcase={current}
          selected={selections[current.botId] ?? new Set()}
          onChange={(next) => setSelections((s) => ({ ...s, [current.botId]: next }))}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
