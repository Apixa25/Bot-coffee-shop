export type StarterSkill = {
  id: string; skill_id: string; version: string; name: string; summary: string; kind: string;
  tags: string[]; good_for: string[]; creator_handle: string; creator_platform: string; license: string;
};

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) || [];

/** Rank starter skills by overlap with what the owner does day to day. Score 0 = no match. */
export function matchStarterSkills<T extends StarterSkill>(dayToDay: string, skills: T[]): (T & { score: number })[] {
  const said = new Set(words(dayToDay).filter((w) => w.length > 2));
  return skills
    .map((s) => {
      let score = 0;
      for (const g of [...s.good_for, ...s.tags]) for (const w of words(g)) if (said.has(w) || said.has(w + 's') || said.has(w.replace(/s$/, ''))) score += 2;
      for (const w of words(`${s.name} ${s.summary}`)) if (w.length > 3 && said.has(w)) score += 1;
      return { ...s, score };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
