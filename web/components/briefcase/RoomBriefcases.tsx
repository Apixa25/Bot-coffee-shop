'use client';

import { useState } from 'react';
import BriefcaseIcon from './BriefcaseIcon';
import BriefcasePanel from './BriefcasePanel';
import type { BotBriefcase } from '@/lib/briefcase/view';
import { buildSkillRequestRows } from '@/lib/briefcase/requests';
import { createClient } from '@/lib/supabase/client';

/**
 * Clickable briefcases overlaid next to each bot. `positions` are % of the room
 * (left, top) so they stay aligned when the room scales on mobile.
 */
export default function RoomBriefcases({
  briefcases,
  positions,
  meetupId = null,
  demo = false,
}: {
  briefcases: BotBriefcase[];
  meetupId?: string | null;
  /** Demo page: nothing is saved to the database. */
  demo?: boolean;
  positions: { left: number; top: number }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const myBotId = briefcases.find((b) => b.isOwn)?.botId ?? null;
  const otherBotId = briefcases.find((b) => !b.isOwn)?.botId ?? null;

  const send = async (bc: BotBriefcase, selected: Set<string>) => {
    const rows = buildSkillRequestRows(bc, selected, myBotId, otherBotId, meetupId);
    if (rows.length === 0) return 'Nothing to send: this room needs your bot and one other bot.';
    if (demo) return `Demo only: ${rows.length} request(s) would go to the owner for approval. Nothing was saved.`;
    const supabase = createClient();
    let sent = 0, dupes = 0;
    for (const row of rows) {
      const { error } = await supabase.from('skill_requests').insert(row);
      if (!error) sent++;
      else if (error.code === '23505') dupes++;
      else throw new Error(`Could not send: ${error.message}`);
    }
    return `Sent ${sent} request(s) for owner approval${dupes ? ` (${dupes} already pending)` : ''}. Nothing transfers until approved.`;
  };

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
          onSend={(sel) => send(current, sel)}
        />
      )}
    </>
  );
}
