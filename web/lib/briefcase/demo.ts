import packs from './__fixtures__/magnus-packs.json';
import { cardFromSkillMd, type BotBriefcase, type SkillCard } from './view';

/** Test data: Magnus's packs, built from SKILL.md frontmatter only. */
export const MAGNUS_SKILLS: SkillCard[] = (packs as { pack: string; frontmatter: string }[]).map((p) =>
  cardFromSkillMd(p.frontmatter, p.pack)
);

export function demoBriefcases(): BotBriefcase[] {
  return [
    { botId: 'magnus', botName: 'Magnus', isOwn: true, skills: MAGNUS_SKILLS },
    {
      botId: 'chuck',
      botName: "Chuck's Bot",
      isOwn: false,
      skills: MAGNUS_SKILLS.filter((s) => ['deal-finder', 'memory-system-gold', 'monitors'].includes(s.id)).map(
        (s, i) => (i === 0 ? { ...s, tested: 'tested', testedBy: 'Magnus' } : s)
      ),
    },
  ];
}
