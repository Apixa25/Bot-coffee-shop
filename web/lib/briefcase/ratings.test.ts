import { describe, it, expect, vi } from 'vitest';
import {
  EMPTY_STATS, canTrade, computeTier, formatStats, isBrandNew, parseEvidenceUrl, sortByTier, statsFromRow, verifyEvidence,
  type SkillStats,
} from './ratings';

const s = (over: Partial<SkillStats>): SkillStats => ({ ...EMPTY_STATS, ...over });

describe('formatStats', () => {
  it('formats reviews and uses', () => {
    expect(formatStats(s({ avgStars: 4.8, reviewCount: 12, runCount: 40 }))).toBe('⭐ 4.8 (12 reviews) · used 40 times');
  });
  it('handles singular and empty', () => {
    expect(formatStats(s({ avgStars: 5, reviewCount: 1, runCount: 1 }))).toBe('⭐ 5.0 (1 review) · used 1 time');
    expect(formatStats(undefined)).toBe('No reviews yet · not used yet');
  });
});

describe('computeTier / canTrade', () => {
  it('needs 2 other reviewers for verified', () => {
    expect(computeTier({ distinctReviewers: 2, runCount: 0, evidenceCount: 0 })).toBe('verified');
    expect(computeTier({ distinctReviewers: 1, runCount: 3, evidenceCount: 1 })).toBe('used_by_owner');
  });
  it('runs without evidence stay experimental', () => {
    expect(computeTier({ distinctReviewers: 0, runCount: 3, evidenceCount: 0 })).toBe('experimental');
    expect(computeTier({ distinctReviewers: 0, runCount: 0, evidenceCount: 0 })).toBe('experimental');
  });
  it('blocks experimental and unknown skills from trades', () => {
    expect(canTrade(undefined)).toBe(false);
    expect(canTrade(s({ tier: 'experimental' }))).toBe(false);
    expect(canTrade(s({ tier: 'used_by_owner' }))).toBe(true);
  });
});

describe('isBrandNew', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  it('is true under 14 days', () => {
    expect(isBrandNew('2026-10-20T00:00:00Z', now)).toBe(true);
    expect(isBrandNew('2026-09-01T00:00:00Z', now)).toBe(false);
    expect(isBrandNew(undefined, now)).toBe(false);
    expect(isBrandNew('garbage', now)).toBe(false);
  });
});

describe('sortByTier', () => {
  it('puts verified first and experimental last, stable within tier', () => {
    const out = sortByTier([
      { id: 'a', stats: s({ tier: 'experimental' }) },
      { id: 'b', stats: s({ tier: 'used_by_owner' }) },
      { id: 'c' },
      { id: 'd', stats: s({ tier: 'verified' }) },
      { id: 'e', stats: s({ tier: 'used_by_owner' }) },
    ]);
    expect(out.map((x) => x.id)).toEqual(['d', 'b', 'e', 'a', 'c']);
  });
});

describe('parseEvidenceUrl', () => {
  it('maps commit, PR and release URLs to the API', () => {
    expect(parseEvidenceUrl('https://github.com/a/b/commit/abc1234')?.api).toBe('https://api.github.com/repos/a/b/commits/abc1234');
    expect(parseEvidenceUrl('https://github.com/a/b/pull/12')).toMatchObject({ kind: 'pr', api: 'https://api.github.com/repos/a/b/pulls/12' });
    expect(parseEvidenceUrl('https://github.com/a/b/releases/tag/v1.0')).toMatchObject({ kind: 'release', ref: 'v1.0' });
  });
  it('rejects other hosts and shapes', () => {
    expect(parseEvidenceUrl('http://github.com/a/b/pull/1')).toBeNull();
    expect(parseEvidenceUrl('https://evil.com/a/b/pull/1')).toBeNull();
    expect(parseEvidenceUrl('https://github.com/a/b/issues/1')).toBeNull();
    expect(parseEvidenceUrl('not a url')).toBeNull();
  });
});

describe('verifyEvidence', () => {
  const resp = (status: number, body: unknown = {}) => ({ ok: status < 300, status, json: async () => body }) as Response;
  it('verifies when GitHub finds it, sending token only when given', async () => {
    const f = vi.fn(async () => resp(200, { merged_at: '2026-01-01' }));
    const r = await verifyEvidence('https://github.com/a/b/pull/1', f as unknown as typeof fetch, 'tok');
    expect(r.verified).toBe(true);
    const headers = (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    const g = vi.fn(async () => resp(200));
    await verifyEvidence('https://github.com/a/b/commit/abc1234', g as unknown as typeof fetch);
    expect(((g.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it('is unverified on 404, rate limit, network error or bad URL', async () => {
    expect((await verifyEvidence('https://github.com/a/b/pull/1', (async () => resp(404)) as unknown as typeof fetch)).verified).toBe(false);
    expect((await verifyEvidence('https://github.com/a/b/pull/1', (async () => resp(403)) as unknown as typeof fetch)).detail).toMatch(/403/);
    expect((await verifyEvidence('https://github.com/a/b/pull/1', (async () => { throw new Error('x'); }) as unknown as typeof fetch)).verified).toBe(false);
    expect((await verifyEvidence('https://x.com/a', vi.fn() as unknown as typeof fetch)).verified).toBe(false);
  });
});

describe('statsFromRow', () => {
  it('maps RPC rows', () => {
    expect(statsFromRow({ avg_stars: '4.0', review_count: 1, run_count: 2, evidence: null, tier: 'used_by_owner' }))
      .toMatchObject({ avgStars: 4, reviewCount: 1, runCount: 2, evidence: [], tier: 'used_by_owner' });
    expect(statsFromRow({ avg_stars: null, review_count: 0, run_count: 0, evidence: null, tier: 'weird' }).tier).toBe('experimental');
  });
});
