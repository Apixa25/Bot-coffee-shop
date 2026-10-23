import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter, cardFromSkillMd, cardsFromManifest, normalizeVersion, oneLine,
  checkboxLabel, toggleSelection, interestRequest, DEFAULTS,
} from './view';
import { MAGNUS_SKILLS, demoBriefcases } from './demo';
import packs from './__fixtures__/magnus-packs.json';

describe('parseFrontmatter', () => {
  it('reads folded >- blocks and plain keys', () => {
    const fm = parseFrontmatter('---\nname: foo\ndescription: >-\n  line one\n  line two\n---\nbody');
    expect(fm).toEqual({ name: 'foo', description: 'line one line two' });
  });
  it('strips quotes', () => {
    expect(parseFrontmatter('name: "Q"').name).toBe('Q');
  });
});

describe('cards', () => {
  it('builds cards with defaults for missing fields', () => {
    const c = cardFromSkillMd('name: bare');
    expect(c).toMatchObject({ name: 'bare', description: DEFAULTS.description, version: 'v0.1', tested: 'not_tested', sourceProject: 'Not listed' });
  });
  it('pulls version from description', () => {
    expect(cardFromSkillMd('name: x\ndescription: Does things. Briefcase skill v0.2 (2026).').version).toBe('v0.2');
  });
  it('normalizes versions', () => {
    expect(normalizeVersion('0.1.0')).toBe('v0.1');
    expect(normalizeVersion('1.2.3')).toBe('v1.2.3');
    expect(normalizeVersion(undefined)).toBe('v0.1');
  });
  it('keeps descriptions to one line', () => {
    expect(oneLine('a'.repeat(300)).length).toBeLessThanOrEqual(140);
    expect(oneLine('First sentence is long enough. Second.')).toBe('First sentence is long enough.');
  });
  it('maps an uploaded manifest TOC', () => {
    const cards = cardsFromManifest({ skills: [{ id: 'abc', name: 'ABC', summary: 'Sum.', version: '0.1.0', path: 'skills/abc', tested_by: 'Magnus' }] });
    expect(cards[0]).toMatchObject({ id: 'abc', version: 'v0.1', tested: 'tested', testedBy: 'Magnus' });
    expect(cardsFromManifest(null)).toEqual([]);
    expect(cardsFromManifest({ skills: 'nope' })).toEqual([]);
  });
});

describe("Magnus's test packs", () => {
  it('loads every pack from SKILL.md frontmatter only', () => {
    expect(MAGNUS_SKILLS.length).toBe(packs.length);
    for (const p of packs) expect(p.frontmatter).not.toMatch(/LOCAL\.md content/);
    expect(MAGNUS_SKILLS.map((s) => s.id)).toContain('memory-system-gold');
    for (const s of MAGNUS_SKILLS) expect(s.description.length).toBeGreaterThan(5);
  });
});

describe('selection / interest', () => {
  it('labels checkboxes by ownership', () => {
    expect(checkboxLabel(true)).toBe('OK to transfer this');
    expect(checkboxLabel(false)).toBe("I'd like to receive this");
  });
  it('toggles immutably', () => {
    const a = new Set<string>();
    const b = toggleSelection(a, 'x');
    expect(a.size).toBe(0);
    expect(toggleSelection(b, 'x').size).toBe(0);
  });
  it('produces interest-only requests', () => {
    const [own, other] = demoBriefcases();
    const r = interestRequest(other, new Set(['monitors', 'not-there']));
    expect(r).toEqual({ kind: 'request', bot_id: 'chuck', skill_ids: ['monitors'], requires_owner_approval: true, transfers_now: false });
    expect(interestRequest(own, new Set()).kind).toBe('offer');
  });
});
