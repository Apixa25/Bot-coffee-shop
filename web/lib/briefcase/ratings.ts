/** Proof of use: times traded (approved requests) + star reviews from bots that received the skill. */

export type SkillStats = {
  avgStars: number | null;
  reviewCount: number;
  tradeCount: number;
};

export const EMPTY_STATS: SkillStats = { avgStars: null, reviewCount: 0, tradeCount: 0 };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "⭐ 4.8 (12 reviews) · traded 40 times" */
export function formatStats(s: SkillStats | undefined): string {
  const st = s ?? EMPTY_STATS;
  const stars = st.reviewCount > 0 && st.avgStars != null
    ? `⭐ ${st.avgStars.toFixed(1)} (${plural(st.reviewCount, 'review')})`
    : 'No reviews yet';
  const traded = st.tradeCount === 0 ? 'not traded yet' : `traded ${plural(st.tradeCount, 'time')}`;
  return `${stars} · ${traded}`;
}

/** Compact form for narrow rows: "⭐4.8 · ×40". */
export function formatStatsShort(s: SkillStats | undefined): string {
  const st = s ?? EMPTY_STATS;
  const parts = [];
  if (st.reviewCount > 0 && st.avgStars != null) parts.push(`⭐${st.avgStars.toFixed(1)}`);
  if (st.tradeCount > 0) parts.push(`×${st.tradeCount}`);
  return parts.join(' · ');
}

export const BRAND_NEW_DAYS = 14;
export function isBrandNew(createdAt: string | undefined | null, now: Date = new Date()): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  const age = (now.getTime() - t) / 86_400_000;
  return age >= -1 && age < BRAND_NEW_DAYS;
}

/** Most traded first (then reviews); skills at zero sort last. Stable for ties. */
export function sortByUse<T extends { stats?: SkillStats }>(items: T[]): T[] {
  const score = (s?: SkillStats) => [s?.tradeCount ?? 0, s?.reviewCount ?? 0];
  return items
    .map((x, i) => ({ x, i }))
    .sort((a, b) => {
      const [ta, ra] = score(a.x.stats); const [tb, rb] = score(b.x.stats);
      return tb - ta || rb - ra || a.i - b.i;
    })
    .map(({ x }) => x);
}

/** Map a get_skill_ratings row to SkillStats. */
export function statsFromRow(r: { avg_stars: number | string | null; review_count: number | null; trade_count: number | null }): SkillStats {
  return {
    avgStars: r.avg_stars == null ? null : Number(r.avg_stars),
    reviewCount: r.review_count ?? 0,
    tradeCount: r.trade_count ?? 0,
  };
}
