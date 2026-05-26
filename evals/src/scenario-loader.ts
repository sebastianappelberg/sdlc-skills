import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import yaml from "yaml";
import {
  type Scenario,
  ScenarioSchema,
  type ScenarioManifest,
  ScenarioManifestSchema,
} from "./schema.js";

export interface LoadedScenarios {
  manifest: ScenarioManifest;
  scenarios: Scenario[];
  scenarioSetHash: string;
  dir: string;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

export function loadScenarioSet(skillName: string, evalsRoot: string): LoadedScenarios {
  const dir = path.join(evalsRoot, "scenarios", skillName);
  const manifestText = readFileSync(path.join(dir, "manifest.yaml"), "utf-8");
  const manifest = ScenarioManifestSchema.parse(yaml.parse(manifestText));
  const scenarios: Scenario[] = [];
  const setHashParts: string[] = [];

  for (const entry of manifest.scenarios) {
    const filePath = path.join(dir, entry.file);
    const text = readFileSync(filePath, "utf-8");
    const actual = sha256Hex(text);
    if (actual !== entry.sha256) {
      throw new Error(
        `Scenario hash mismatch for ${entry.file}: manifest=${entry.sha256} actual=${actual}.\nUpdate evals/scenarios/${skillName}/manifest.yaml.`,
      );
    }
    const parsed = ScenarioSchema.parse(yaml.parse(text));
    if (parsed.id !== entry.id) {
      throw new Error(
        `Scenario id mismatch in ${entry.file}: manifest id=${entry.id} file id=${parsed.id}.`,
      );
    }
    scenarios.push(parsed);
    setHashParts.push(`${entry.id}:${entry.sha256}`);
  }

  const scenarioSetHash = sha256Hex(setHashParts.join("\n"));
  return { manifest, scenarios, scenarioSetHash, dir };
}

export function pickScenarios(all: Scenario[], selector: string | undefined): Scenario[] {
  if (!selector || selector === "all") return all;
  const wanted = new Set(selector.split(",").map((s) => s.trim()).filter(Boolean));
  const out = all.filter((s) => wanted.has(s.id));
  const missing = [...wanted].filter((id) => !all.some((s) => s.id === id));
  if (missing.length > 0) {
    throw new Error(`Unknown scenarios: ${missing.join(", ")}`);
  }
  return out;
}
