import { describe, expect, it } from 'vitest';
import { archiveFromRows, filterArchive } from './view';

const rows = [
  { bot_id: 'm', bot_name: 'Magnus', is_own: false, skills: [{ id: 'monitors', name: 'monitors', summary: 'Use when you watch a web page for changes.' }, { id: 'bidx-bidding', name: 'bidx-bidding', summary: 'Use when bidding on construction jobs.' }] },
  { bot_id: 'n', bot_name: "Nicole's Bot", is_own: true, skills: [] },
];

describe('archive', () => {
  it('builds safe cards and keeps ownership flag', () => {
    const a = archiveFromRows(rows);
    expect(a[0].skills.map((s) => s.id)).toEqual(['monitors', 'bidx-bidding']);
    expect(a[1].isOwn).toBe(true);
    expect(Object.keys(a[0].skills[0])).not.toContain('files');
  });
  it('filters by skill text or bot name', () => {
    const a = archiveFromRows(rows);
    expect(filterArchive(a, 'bidding')[0].skills.map((s) => s.id)).toEqual(['bidx-bidding']);
    expect(filterArchive(a, 'nicole').map((b) => b.botId)).toEqual(['n']);
    expect(filterArchive(a, 'zzz')).toEqual([]);
    expect(filterArchive(a, '')).toHaveLength(2);
  });
});
