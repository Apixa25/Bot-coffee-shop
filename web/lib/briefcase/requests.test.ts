import { describe, it, expect } from 'vitest';
import { buildSkillRequestRows, approverBotId, describeRequest } from './requests';
import { cardFromSkillMd, cardsFromManifest, type BotBriefcase } from './view';
import { MAGNUS_SKILLS } from './demo';
import { validateBriefcase } from './validate';

const skills = [
  { id: 'monitors', name: 'monitors', description: 'd', version: 'v0.1', sourceProject: 'x', tested: 'not_tested' as const },
  { id: 'deal-finder', name: 'Deal finder', description: 'd', version: 'v0.1', sourceProject: 'x', tested: 'not_tested' as const },
];
const own: BotBriefcase = { botId: 'me', botName: 'Mine', isOwn: true, skills };
const other: BotBriefcase = { botId: 'them', botName: 'Theirs', isOwn: false, skills };

describe('buildSkillRequestRows', () => {
  it("other bot's briefcase -> receive requests approved by that bot's owner", () => {
    const rows = buildSkillRequestRows(other, new Set(['monitors']), 'me', 'them', 'm1');
    expect(rows).toEqual([{ requester_bot_id: 'me', source_bot_id: 'them', skill_id: 'monitors', skill_name: 'monitors', direction: 'receive', meetup_id: 'm1' }]);
    expect(approverBotId(rows[0])).toBe('them');
  });
  it('own briefcase -> transfer offers approved by the receiving owner', () => {
    const rows = buildSkillRequestRows(own, new Set(['deal-finder', 'nope']), 'me', 'them');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ requester_bot_id: 'them', source_bot_id: 'me', direction: 'transfer' });
    expect(approverBotId(rows[0])).toBe('them');
  });
  it('returns nothing without a counterpart bot', () => {
    expect(buildSkillRequestRows(own, new Set(['monitors']), 'me', null)).toEqual([]);
    expect(buildSkillRequestRows(other, new Set(['monitors']), null, 'them')).toEqual([]);
  });
  it('describes requests in plain words', () => {
    const [r] = buildSkillRequestRows(other, new Set(['monitors']), 'me', 'them');
    expect(describeRequest(r, { me: 'Magnus', them: 'Chuck' })).toBe('Magnus would like to receive "monitors" from Chuck');
  });
});

describe('source_project / tested fields', () => {
  it('reads them from SKILL.md frontmatter', () => {
    const c = cardFromSkillMd('name: a\nsource_project: "BidX"\ntested_by_other_bot: false');
    expect(c).toMatchObject({ sourceProject: 'BidX', tested: 'not_tested' });
    expect(cardFromSkillMd('name: a\ntested_by_other_bot: Nicole').testedBy).toBe('Nicole');
    expect(cardFromSkillMd('name: a\ntested_by_other_bot: true').tested).toBe('tested');
  });
  it('reads them from the manifest', () => {
    const [c] = cardsFromManifest({ skills: [{ id: 'abc', name: 'A', summary: 's', version: '0.1.0', path: 'skills/abc', source_project: 'P', tested_status: 'tested' }] });
    expect(c).toMatchObject({ sourceProject: 'P', tested: 'tested' });
  });
  it("Magnus's packs carry source projects (incl. DMZ helper)", () => {
    expect(MAGNUS_SKILLS.find((s) => s.id === 'dmz-mw4-helper')?.sourceProject).toBe('Gaming');
    expect(MAGNUS_SKILLS.length).toBe(11);
  });
  it('validator accepts the new optional fields and rejects bad tested_status', () => {
    const base = (extra: object) => new Map(Object.entries({
      'briefcase.json': JSON.stringify({
        spec_version: '1.0', briefcase_id: 'abc-bc', updated_at: '2026-10-23T00:00:00Z',
        bot: { handle: 'bot', platform: 'custom', specialty: 's' },
        skills: [{ id: 'abc', name: 'A', summary: 's', version: '0.1.0', path: 'skills/abc/', ...extra }],
      }),
      'skills/abc/SKILL.md': '---\nname: abc\ndescription: Use when testing.\n---\n# A\n',
      'skills/abc/label.json': '{}',
    }).map(([k, v]) => [k, new TextEncoder().encode(v)]));
    const ok = validateBriefcase(base({ source_project: 'P', tested_status: 'tested', tested_by: 'Nicole' }));
    expect(ok.errors.filter((e) => /briefcase\.json/.test(JSON.stringify(e)) && /source_project|tested/.test(JSON.stringify(e)))).toEqual([]);
    const bad = validateBriefcase(base({ tested_status: 'maybe' }));
    expect(JSON.stringify(bad.errors)).toMatch(/tested_status|enum|allowed/i);
  });
});
