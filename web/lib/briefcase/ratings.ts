/** Proof of use + star ratings: shared helpers for UI, API and tests. */

export type Tier = 'experimental' | 'used_by_owner' | 'verified';
export type Outcome = 'success' | 'partial' | 'failed';
export type EvidenceKind = 'commit' | 'pr' | 'release';
export type Evidence = { kind: EvidenceKind; url: string; verified: boolean };

export type SkillStats = {
  avgStars: number | null;
  reviewCount: number;
  runCount: number;
  successCount?: number;
  evidence: Evidence[];
  tier: Tier;
};

export const EMPTY_STATS: SkillStats = { avgStars: null, reviewCount: 0, runCount: 0, evidence: [], tier: 'experimental' };

export const TIER_LABEL: Record<Tier, string> = {
  experimental: 'Experimental',
  used_by_owner: 'Used by owner',
  verified: 'Verified',
};

/** Mirrors public.skill_tier in SQL. */
export function computeTier(i: { distinctReviewers: number; runCount: number; evidenceCount: number }): Tier {
  if (i.distinctReviewers >= 2) return 'verified';
  if (i.runCount > 0 && i.evidenceCount > 0) return 'used_by_owner';
  return 'experimental';
}

export function canTrade(stats: SkillStats | undefined): boolean {
  return !!stats && stats.tier !== 'experimental';
}

/** "⭐ 4.8 (12 reviews) · used 40 times" */
export function formatStats(s: SkillStats | undefined): string {
  const st = s ?? EMPTY_STATS;
  const stars = st.reviewCount > 0 && st.avgStars != null
    ? `⭐ ${st.avgStars.toFixed(1)} (${st.reviewCount} review${st.reviewCount === 1 ? '' : 's'})`
    : 'No reviews yet';
  const used = st.runCount === 0 ? 'not used yet' : `used ${st.runCount} time${st.runCount === 1 ? '' : 's'}`;
  return `${stars} · ${used}`;
}

export const BRAND_NEW_DAYS = 14;
export function isBrandNew(createdAt: string | undefined | null, now: Date = new Date()): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  const age = (now.getTime() - t) / 86_400_000;
  return age >= -1 && age < BRAND_NEW_DAYS;
}

const TIER_ORDER: Record<Tier, number> = { verified: 0, used_by_owner: 1, experimental: 2 };
/** Stable sort: experimental skills go to the bottom. */
export function sortByTier<T extends { stats?: SkillStats }>(items: T[]): T[] {
  return items
    .map((x, i) => ({ x, i }))
    .sort((a, b) => TIER_ORDER[a.x.stats?.tier ?? 'experimental'] - TIER_ORDER[b.x.stats?.tier ?? 'experimental'] || a.i - b.i)
    .map(({ x }) => x);
}

export type ParsedEvidence =
  | { kind: 'commit'; owner: string; repo: string; ref: string; api: string }
  | { kind: 'pr'; owner: string; repo: string; ref: string; api: string }
  | { kind: 'release'; owner: string; repo: string; ref: string; api: string };

/** github.com/{o}/{r}/commit/{sha} | /pull/{n} | /releases/tag/{tag} -> public API URL. */
export function parseEvidenceUrl(url: string): ParsedEvidence | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'github.com') return null;
  const p = u.pathname.split('/').filter(Boolean);
  if (p.length < 4) return null;
  const [owner, repo, kind, ...rest] = p;
  const ok = /^[A-Za-z0-9_.-]+$/;
  if (!ok.test(owner) || !ok.test(repo)) return null;
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  if (kind === 'commit' && /^[0-9a-f]{7,40}$/i.test(rest[0] || '')) return { kind: 'commit', owner, repo, ref: rest[0], api: `${base}/commits/${rest[0]}` };
  if (kind === 'pull' && /^\d+$/.test(rest[0] || '')) return { kind: 'pr', owner, repo, ref: rest[0], api: `${base}/pulls/${rest[0]}` };
  if (kind === 'releases' && rest[0] === 'tag' && rest[1]) return { kind: 'release', owner, repo, ref: rest[1], api: `${base}/releases/tags/${encodeURIComponent(rest[1])}` };
  return null;
}

/** Check evidence against the public GitHub API. Token (server only) is optional. */
export async function verifyEvidence(
  url: string,
  fetchFn: typeof fetch = fetch,
  token?: string
): Promise<{ verified: boolean; detail: string; kind?: EvidenceKind }> {
  const p = parseEvidenceUrl(url);
  if (!p) return { verified: false, detail: 'Not a GitHub commit, PR or release URL' };
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'bot-coffee-shop' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetchFn(p.api, { headers });
    if (res.status === 404) return { verified: false, detail: 'Not found on GitHub (private or wrong link)', kind: p.kind };
    if (!res.ok) return { verified: false, detail: `GitHub returned ${res.status}; try again later`, kind: p.kind };
    const body = (await res.json()) as Record<string, unknown>;
    if (p.kind === 'pr' && body.merged_at == null && body.state !== 'open') {
      return { verified: true, detail: 'PR exists (closed without merge)', kind: p.kind };
    }
    return { verified: true, detail: `Found on GitHub (${p.owner}/${p.repo})`, kind: p.kind };
  } catch {
    return { verified: false, detail: 'Could not reach GitHub', kind: p.kind };
  }
}

/** Map a get_skill_stats row to SkillStats. */
export function statsFromRow(r: {
  avg_stars: number | string | null; review_count: number; run_count: number; success_count?: number;
  evidence: Evidence[] | null; tier: string;
}): SkillStats {
  return {
    avgStars: r.avg_stars == null ? null : Number(r.avg_stars),
    reviewCount: r.review_count ?? 0,
    runCount: r.run_count ?? 0,
    successCount: r.success_count,
    evidence: r.evidence ?? [],
    tier: (['experimental', 'used_by_owner', 'verified'].includes(r.tier) ? r.tier : 'experimental') as Tier,
  };
}
