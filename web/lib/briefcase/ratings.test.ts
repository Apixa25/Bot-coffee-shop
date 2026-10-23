import { describe, it, expect } from 'vitest';
import { EMPTY_STATS, formatStats, formatStatsShort, isBrandNew, sortByUse, statsFromRow, type SkillStats } from './ratings';

const s = (over: Partial<SkillStats>): SkillStats => ({ ...EMPTY_STATS, ...over });

describe('formatStats', () => {
  it('formats reviews and trades', () => {
    expect(formatStats(s({ avgStars: 4.8, reviewCount: 12, tradeCount: 40 }))).toBe('⭐ 4.8 (12 reviews) · traded 40 times');
  });
  it('handles singular, traded-but-unreviewed and empty', () => {
    expect(formatStats(s({ avgStars: 5, reviewCount: 1, tradeCount: 1 }))).toBe('⭐ 5.0 (1 review) · traded 1 time');
    expect(formatStats(s({ tradeCount: 3 }))).toBe('No reviews yet · traded 3 times');
    expect(formatStats(undefined)).toBe('No reviews yet · not traded yet');
  });
  it('short form', () => {
    expect(formatStatsShort(s({ avgStars: 4.8, reviewCount: 2, tradeCount: 40 }))).toBe('⭐4.8 · ×40');
    expect(formatStatsShort(undefined)).toBe('');
  });
});

describe('isBrandNew', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  it('is true under 14 days only', () => {
    expect(isBrandNew('2026-10-20T00:00:00Z', now)).toBe(true);
    expect(isBrandNew('2026-10-09T11:00:00Z', now)).toBe(false);
    expect(isBrandNew(undefined, now)).toBe(false);
    expect(isBrandNew('garbage', now)).toBe(false);
  });
});

describe('sortByUse', () => {
  it('most traded first, zero-use skills last, stable within ties', () => {
    const out = sortByUse([
      { id: 'new1' },
      { id: 'a', stats: s({ tradeCount: 3 }) },
      { id: 'zero', stats: s({}) },
      { id: 'b', stats: s({ tradeCount: 40, reviewCount: 12 }) },
      { id: 'c', stats: s({ tradeCount: 3, reviewCount: 1 }) },
    ]);
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a', 'new1', 'zero']);
  });
});

describe('statsFromRow', () => {
  it('maps RPC rows', () => {
    expect(statsFromRow({ avg_stars: '4.0', review_count: 1, trade_count: 2 })).toEqual({ avgStars: 4, reviewCount: 1, tradeCount: 2 });
    expect(statsFromRow({ avg_stars: null, review_count: null, trade_count: null })).toEqual(EMPTY_STATS);
  });
});
