import packs from './__fixtures__/magnus-packs.json';
import { cardFromSkillMd, type BotBriefcase, type SkillCard } from './view';
import type { SkillStats } from './ratings';

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

/** Demo-only proof-of-use numbers (not real reviews). */
const DEMO_STATS: Record<string, { stats: SkillStats; createdAt?: string }> = {
  'memory-system-gold': { createdAt: daysAgo(60), stats: { avgStars: 4.8, reviewCount: 12, tradeCount: 40 } },
  'release-shipping': { createdAt: daysAgo(40), stats: { avgStars: 4.5, reviewCount: 2, tradeCount: 9 } },
  'deal-finder': { createdAt: daysAgo(30), stats: { avgStars: 5, reviewCount: 1, tradeCount: 4 } },
  'serendipity-heartbeat': { createdAt: daysAgo(35), stats: { avgStars: 3.7, reviewCount: 3, tradeCount: 6 } },
  'spam-call-screener': { createdAt: daysAgo(25), stats: { avgStars: null, reviewCount: 0, tradeCount: 2 } },
  monitors: { createdAt: daysAgo(3), stats: { avgStars: null, reviewCount: 0, tradeCount: 1 } },
  'dmz-mw4-helper': { createdAt: daysAgo(1), stats: { avgStars: null, reviewCount: 0, tradeCount: 0 } },
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
