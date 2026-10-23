import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { validateBriefcase, maskItem } from './validate';
import { botPrompt } from './prompt';

const SAMPLE = join(import.meta.dirname, '__fixtures__', 'sample-briefcase');
function load(dir: string, root = dir, out = new Map<string, Uint8Array>()) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) load(p, root, out);
    else out.set(relative(root, p).split('\\').join('/'), new Uint8Array(readFileSync(p)));
  }
  return out;
}
const enc = (s: string) => new TextEncoder().encode(s);
const withBc = (patch: Record<string, unknown>) => {
  const f = load(SAMPLE);
  const bc = JSON.parse(new TextDecoder().decode(f.get('briefcase.json')));
  f.set('briefcase.json', enc(JSON.stringify({ ...bc, ...patch })));
  return f;
};

describe('Briefcase Harvest fields', () => {
  it('accepts wish_list, owner_goals and a non-matching do_not_share', () => {
    const r = validateBriefcase(withBc({
      wish_list: ['scheduling', 'memory systems'],
      owner_goals: { goals: 'save time', current_focus: 'launch', share_ai_spend: false },
      do_not_share: ['Project Zebra'],
    }));
    expect(r.errors).toEqual([]);
  });

  it('rejects bad harvest field shapes', () => {
    const r = validateBriefcase(withBc({ wish_list: 'x', owner_goals: { share_ai_spend: 'yes', other: 1 } }));
    expect(r.valid).toBe(false);
    expect(r.errors.join('\n')).toMatch(/wish_list/);
    expect(r.errors.join('\n')).toMatch(/share_ai_spend/);
  });

  it('rejects a do_not_share hit in a skill file, case-insensitively, without echoing the item', () => {
    const f = withBc({ do_not_share: ['Acme Widgets Inc'] });
    f.set('skills/used-item-deal-finder/EXAMPLE.md', enc('We did this for ACME widgets inc last week.\n'));
    const r = validateBriefcase(f);
    expect(r.valid).toBe(false);
    const hit = r.errors.find((e) => e.includes('do_not_share'))!;
    expect(hit).toContain('skills/used-item-deal-finder/EXAMPLE.md');
    expect(hit).toContain('item #1');
    expect(hit.toLowerCase()).not.toContain('acme widgets');
  });

  it('rejects a do_not_share hit in another briefcase.json field', () => {
    const r = validateBriefcase(withBc({ do_not_share: ['zebra'], wish_list: ['learn about Zebra stripes'] }));
    expect(r.errors.some((e) => e.includes("field 'wish_list'") && e.includes('item #1'))).toBe(true);
  });

  it('masks items', () => {
    expect(maskItem('supersecret')).toBe('su********');
    expect(maskItem('ab')).toBe('**');
  });
});

describe('Briefcase Harvest prompt', () => {
  const p = botPrompt('ABC123');
  it('fills the code and uses the apex domain', () => {
    expect(p).toContain('Your meetup code is ABC123.');
    expect(p).toContain('https://botcoffeeshop.com/ticket/ABC123/BOT-ONBOARDING.md');
    expect(p).toContain('join meetup ABC123');
    expect(p).not.toContain('www.');
  });
  it('has the team-lead line and not the old memory-system line', () => {
    expect(p).toContain('If you lead a team of bots');
    expect(p).toContain("Don't search the rest of the computer.");
    expect(p).not.toContain('memory system');
    for (const n of [1, 2, 3, 4, 5, 6]) expect(p).toContain(`\n${n}. `);
  });
});
