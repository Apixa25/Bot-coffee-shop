import { describe, expect, it } from 'vitest';
import { ownBriefcases } from './view';

describe('ownBriefcases', () => {
  it('maps each own bot to its uploaded skills and marks it as own', () => {
    const out = ownBriefcases(
      [{ id: 'b1', name: 'Magnus' }, { id: 'b2', name: 'Empty Bot' }],
      [{ bot_id: 'b1', toc: { skills: [{ id: 'monitors', name: 'monitors', summary: 'Use when watching a page.', version: '0.1.0' }] } }]
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ botId: 'b1', isOwn: true });
    expect(out[0].skills.map((s) => s.id)).toEqual(['monitors']);
    expect(out[1].skills).toEqual([]);
  });
  it('ignores briefcase rows for bots the owner does not have', () => {
    expect(ownBriefcases([], [{ bot_id: 'x', toc: { skills: [{ id: 'abc' }] } }])).toEqual([]);
  });
});
