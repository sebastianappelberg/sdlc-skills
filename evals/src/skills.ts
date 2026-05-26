import path from "node:path";
import { loadSkillsFromDir, type Skill } from "@earendil-works/pi-coding-agent";

const SKILL_DEPENDENCIES: Record<string, string[]> = {
  brainstorming: ["writing-plans"],
  "writing-plans": [],
  "divergent-thinking": [],
};

export function loadSkillsForTest(skillName: string, repoRoot: string): Skill[] {
  const dir = path.join(repoRoot, "plugins/sdlc-skills/skills");
  const { skills, diagnostics } = loadSkillsFromDir({ dir, source: "sdlc-skills-eval" });
  if (diagnostics.length > 0) {
    for (const d of diagnostics) {
      console.warn(`[skills] ${d.type}: ${d.message}`);
    }
  }
  const wanted = new Set<string>([skillName, ...(SKILL_DEPENDENCIES[skillName] ?? [])]);
  const filtered = skills.filter((s) => wanted.has(s.name));
  const missing = [...wanted].filter((name) => !filtered.some((s) => s.name === name));
  if (missing.length > 0) {
    throw new Error(
      `Skills not found under ${dir}: ${missing.join(", ")}. Available: ${skills.map((s) => s.name).join(", ")}`,
    );
  }
  return filtered;
}
