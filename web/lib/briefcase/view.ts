/**
 * Briefcase UI view model. Builds skill cards from an uploaded briefcase
 * manifest (briefcase.json TOC) or from SKILL.md frontmatter only.
 * LOCAL.md is never read or shown.
 */

export type TestedStatus = 'tested' | 'not_tested';

export type SkillCard = {
  id: string;
  name: string;
  description: string; // one line
  version: string; // e.g. "v0.1"
  sourceProject: string;
  tested: TestedStatus;
  testedBy?: string;
};

export type BotBriefcase = {
  botId: string;
  botName: string;
  isOwn: boolean;
  skills: SkillCard[];
};

export const DEFAULTS = {
  description: 'No description yet.',
  version: 'v0.1',
  sourceProject: 'Not listed',
  tested: 'not_tested' as TestedStatus,
};

/** Minimal YAML frontmatter reader for flat keys, including `>-` / `|` blocks. */
export function parseFrontmatter(src: string): Record<string, string> {
  let text = src.replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (m) text = m[1];
  const out: Record<string, string> = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    if (/^[>|][-+]?$/.test(val)) {
      const folded = val.startsWith('>');
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === '')) {
        block.push(lines[++i].trim());
      }
      val = folded ? block.filter(Boolean).join(' ') : block.join('\n').trim();
    } else {
      val = val.replace(/^(['"])(.*)\1$/, '$2');
    }
    out[key] = val;
  }
  return out;
}

/** First sentence, capped, so cards stay one line. */
export function oneLine(s: string | undefined, max = 140): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return DEFAULTS.description;
  const cut = t.split(/(?<=[.!?:])\s|\s(?:→|—)\s/)[0].replace(/:$/, '');
  const first = cut.length >= 20 ? cut : t;
  return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first;
}

/** "0.1.0" -> "v0.1", "v0.1" -> "v0.1"; find "v0.1" inside free text. */
export function normalizeVersion(v: string | undefined): string {
  if (!v) return DEFAULTS.version;
  const m = String(v).match(/v?(\d+)\.(\d+)(?:\.(\d+))?/i);
  if (!m) return DEFAULTS.version;
  return m[3] && m[3] !== '0' ? `v${m[1]}.${m[2]}.${m[3]}` : `v${m[1]}.${m[2]}`;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill';
}

/** Combine tested_status / tested_by / tested_by_other_bot (manifest or frontmatter). */
export function testedFromFields(o: Record<string, unknown>): { tested: TestedStatus; testedBy?: string } {
  const by = [o.tested_by, o.tested_by_other_bot].find((v) => typeof v === 'string' && v && !/^(false|no|none)$/i.test(v)) as string | undefined;
  if (by && !/^(true|yes)$/i.test(by)) return { tested: 'tested', testedBy: by };
  if (o.tested_status === 'tested' || o.tested_by_other_bot === true || by) return { tested: 'tested' };
  if (o.tested_status === 'not_tested' || o.tested_by_other_bot === false) return { tested: 'not_tested' };
  return testedFrom(o.tested);
}

function testedFrom(v: unknown): { tested: TestedStatus; testedBy?: string } {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const by = typeof o.by === 'string' ? o.by : typeof o.tested_by === 'string' ? o.tested_by : undefined;
    if (o.status === 'tested' || o.passed === true || by) return { tested: 'tested', testedBy: by };
  }
  if (v === true || v === 'tested' || v === 'true') return { tested: 'tested' };
  if (typeof v === 'string' && v && !/^(no|false|not)/i.test(v)) return { tested: 'tested', testedBy: v };
  return { tested: DEFAULTS.tested };
}

/** Card from SKILL.md frontmatter (only). */
export function cardFromSkillMd(frontmatter: string, fallbackId?: string): SkillCard {
  const fm = parseFrontmatter(frontmatter);
  const name = fm.name || fallbackId || 'Untitled skill';
  const source =
    fm.source_project || fm.project || fm.source ||
    (/bot coffee shop/i.test(fm.description || '') ? 'Bot Coffee Shop briefcase' : DEFAULTS.sourceProject);
  return {
    id: fallbackId || slug(name),
    name,
    description: oneLine(fm.description),
    version: normalizeVersion(fm.version || (fm.description || '').match(/v\d+\.\d+(?:\.\d+)?/i)?.[0]),
    sourceProject: source,
    ...testedFromFields(fm),
  };
}

/** Cards from an uploaded briefcase.json TOC (briefcases.toc). */
export function cardsFromManifest(toc: unknown): SkillCard[] {
  if (!toc || typeof toc !== 'object') return [];
  const t = toc as { skills?: unknown; bot?: { handle?: string } };
  if (!Array.isArray(t.skills)) return [];
  return t.skills
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => {
      const name = String(s.name || s.id || 'Untitled skill');
      return {
        id: String(s.id || slug(name)),
        name,
        description: oneLine(typeof s.summary === 'string' ? s.summary : undefined),
        version: normalizeVersion(typeof s.version === 'string' ? s.version : undefined),
        sourceProject: String(s.source_project || s.project || DEFAULTS.sourceProject),
        ...testedFromFields(s),
      };
    });
}

/** Checkbox meaning depends on whose briefcase it is. Interest only. */
export function checkboxLabel(isOwn: boolean): string {
  return isOwn ? 'OK to transfer this' : "I'd like to receive this";
}

export function toggleSelection(sel: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(sel);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Interest payload handed to the owner-approval flow. Never a transfer. */
export function interestRequest(bc: BotBriefcase, sel: ReadonlySet<string>) {
  return {
    kind: bc.isOwn ? ('offer' as const) : ('request' as const),
    bot_id: bc.botId,
    skill_ids: bc.skills.map((s) => s.id).filter((id) => sel.has(id)),
    requires_owner_approval: true as const,
    transfers_now: false as const,
  };
}

/** Owner's dashboard: one briefcase per own bot, empty when nothing is uploaded yet. */
export function ownBriefcases(
  bots: { id: string; name: string }[],
  rows: { bot_id: string; toc: unknown }[]
): BotBriefcase[] {
  const toc = new Map(rows.map((r) => [r.bot_id, r.toc]));
  return bots.map((b) => ({ botId: b.id, botName: b.name, isOwn: true, skills: cardsFromManifest(toc.get(b.id)) }));
}

/** Archive entry: safe fields only from get_archive(). Stars/traded are a hook until ratings land. */
export type ArchiveSkill = SkillCard & { stars?: number | null; reviews?: number | null; traded?: number | null };
export type ArchiveBot = { botId: string; botName: string; isOwn: boolean; skills: ArchiveSkill[] };

export function archiveFromRows(rows: { bot_id: string; bot_name: string; is_own: boolean; skills: unknown }[]): ArchiveBot[] {
  return rows.map((r) => ({ botId: r.bot_id, botName: r.bot_name, isOwn: !!r.is_own, skills: cardsFromManifest({ skills: r.skills }) }));
}

/** Case-insensitive filter over bot name, skill name and summary. */
export function filterArchive(bots: ArchiveBot[], q: string): ArchiveBot[] {
  const t = q.trim().toLowerCase();
  if (!t) return bots;
  return bots
    .map((b) => (b.botName.toLowerCase().includes(t) ? b : { ...b, skills: b.skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(t)) }))
    .filter((b) => b.botName.toLowerCase().includes(t) || b.skills.length > 0);
}
