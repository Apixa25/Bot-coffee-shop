import type { BotBriefcase } from './view';

export type Direction = 'receive' | 'transfer';
export type RequestStatus = 'pending' | 'approved' | 'declined';

export type SkillRequestInsert = {
  requester_bot_id: string;
  source_bot_id: string;
  skill_id: string;
  skill_name: string;
  direction: Direction;
  meetup_id: string | null;
};

export type SkillRequestRow = SkillRequestInsert & {
  id: string;
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
};

/**
 * Turn checkmarks into pending skill_requests rows (consent records only).
 * - Another bot's briefcase: my bot asks to RECEIVE; that bot's owner approves.
 * - My own briefcase: I OK a TRANSFER to the other bot; its owner approves.
 */
export function buildSkillRequestRows(
  bc: BotBriefcase,
  selected: ReadonlySet<string>,
  myBotId: string | null,
  otherBotId: string | null,
  meetupId: string | null = null
): SkillRequestInsert[] {
  const counterpart = bc.isOwn ? otherBotId : myBotId;
  if (!counterpart || counterpart === bc.botId) return [];
  return bc.skills
    .filter((s) => selected.has(s.id))
    .map((s) => ({
      requester_bot_id: bc.isOwn ? counterpart : (myBotId as string),
      source_bot_id: bc.botId,
      skill_id: s.id,
      skill_name: s.name,
      direction: bc.isOwn ? 'transfer' : 'receive',
      meetup_id: meetupId,
    }));
}

/** Bot whose owner must approve (mirrors skill_request_approver_bot in SQL). */
export function approverBotId(r: Pick<SkillRequestInsert, 'direction' | 'requester_bot_id' | 'source_bot_id'>) {
  return r.direction === 'receive' ? r.source_bot_id : r.requester_bot_id;
}

export function describeRequest(r: SkillRequestInsert, names: Record<string, string>) {
  const req = names[r.requester_bot_id] || 'A bot';
  const src = names[r.source_bot_id] || 'a bot';
  return r.direction === 'receive'
    ? `${req} would like to receive "${r.skill_name}" from ${src}`
    : `${src}'s owner is OK to transfer "${r.skill_name}" to ${req}`;
}
