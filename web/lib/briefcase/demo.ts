import packs from './__fixtures__/magnus-packs.json';
import { cardFromSkillMd, type BotBriefcase, type SkillCard } from './view';
import type { SkillStats } from './ratings';

const ev = (kind: 'commit' | 'pr' | 'release', url: string, verified: boolean) => ({ kind, url, verified });
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

/** Demo-only proof-of-use data (not real reviews). */
const DEMO_STATS: Record<string, { stats: SkillStats; createdAt?: string }> = {
  'memory-system-gold': { createdAt: daysAgo(30), stats: { avgStars: 4.8, reviewCount: 12, runCount: 40, evidence: [ev('pr', 'https://github.com/Apixa25/Bot-coffee-shop/pull/23', true), ev('release', 'https://github.com/example/muse/releases/tag/v0.1.0', false)], tier: 'verified' } },
  'release-shipping': { createdAt: daysAgo(20), stats: { avgStars: 4.5, reviewCount: 2, runCount: 9, evidence: [ev('pr', 'https://github.com/Apixa25/Bot-coffee-shop/pull/25', true)], tier: 'verified' } },
  'deal-finder': { createdAt: daysAgo(25), stats: { avgStars: 5, reviewCount: 1, runCount: 14, evidence: [ev('commit', 'https://github.com/Apixa25/Bot-coffee-shop/commit/91d8746', true)], tier: 'used_by_owner' } },
  monitors: { createdAt: daysAgo(3), stats: { avgStars: null, reviewCount: 0, runCount: 6, evidence: [ev('pr', 'https://github.com/Apixa25/Bot-coffee-shop/pull/24', true)], tier: 'used_by_owner' } },
  'dmz-mw4-helper': { createdAt: daysAgo(1), stats: { avgStars: null, reviewCount: 0, runCount: 0, evidence: [], tier: 'experimental' } },
};

/** Test data: Magnus's packs, built from SKILL.md frontmatter only. */
export const MAGNUS_SKILLS: SkillCard[] = (packs as { pack: string; frontmatter: string }[]).map((p) =>
  cardFromSkillMd(p.frontmatter, p.pack)
);

/** Magnus's packs plus demo proof-of-use stats, for /briefcase-demo only. */
export const DEMO_SKILLS: SkillCard[] = MAGNUS_SKILLS.map((s) => {
  const d = DEMO_STATS[s.id];
  return d ? { ...s, ...d } : { ...s, createdAt: s.createdAt ?? daysAgo(45) };
});

export function demoBriefcases(): BotBriefcase[] {
  return [
    { botId: 'magnus', botName: 'Magnus', isOwn: true, skills: DEMO_SKILLS },
    {
      botId: 'chuck',
      botName: "Chuck's Bot",
      isOwn: false,
      skills: DEMO_SKILLS.filter((s) => ['deal-finder', 'memory-system-gold', 'monitors'].includes(s.id)).map(
        (s, i) => (i === 0 ? { ...s, tested: 'tested', testedBy: 'Magnus' } : s)
      ),
    },
  ];
}
