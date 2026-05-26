import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "yaml";
import {
  ScenarioManifestSchema,
  ScenarioSchema,
} from "../src/schema.js";

const SCENARIOS_ROOT = path.resolve(__dirname, "..", "scenarios");

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

const skillDirs = readdirSync(SCENARIOS_ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const skill of skillDirs) {
  describe(`scenarios/${skill}`, () => {
    const dir = path.join(SCENARIOS_ROOT, skill);
    const manifestPath = path.join(dir, "manifest.yaml");
    const manifestText = readFileSync(manifestPath, "utf-8");
    const manifest = ScenarioManifestSchema.parse(yaml.parse(manifestText));

    it("manifest parses", () => {
      expect(manifest.scenarios.length).toBeGreaterThan(0);
    });

    const yamlFiles = readdirSync(dir)
      .filter((f) => f.endsWith(".yaml") && f !== "manifest.yaml");

    it("every yaml file is in the manifest", () => {
      const manifestFiles = new Set(manifest.scenarios.map((s) => s.file));
      for (const f of yamlFiles) {
        expect(manifestFiles.has(f), `missing ${f}`).toBe(true);
      }
    });

    for (const entry of manifest.scenarios) {
      it(`${entry.file} parses and matches sha256`, () => {
        const text = readFileSync(path.join(dir, entry.file), "utf-8");
        expect(sha256Hex(text)).toBe(entry.sha256);
        const parsed = ScenarioSchema.parse(yaml.parse(text));
        expect(parsed.id).toBe(entry.id);
        expect(parsed.persona.opening_message.length).toBeGreaterThan(0);
      });
    }
  });
}
