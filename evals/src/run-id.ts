import { execSync } from "node:child_process";
import path from "node:path";

function ts(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}-${pad(date.getUTCSeconds())}`
  );
}

export function skillsShortSha(repoRoot: string): string {
  const skillsDir = path.join(repoRoot, "plugins/sdlc-skills/skills");
  try {
    const out = execSync(`git log -n1 --format=%h -- "${skillsDir}"`, {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();
    if (!out) return "nogit";
    return out;
  } catch {
    return "nogit";
  }
}

export function runId(repoRoot: string, now: Date = new Date()): string {
  return `${ts(now)}-${skillsShortSha(repoRoot)}`;
}
