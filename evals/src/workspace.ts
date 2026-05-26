import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function createWorkspace(): string {
  return mkdtempSync(path.join(os.tmpdir(), "sdlc-skills-eval-"));
}

export function disposeWorkspace(workspace: string): void {
  try {
    rmSync(workspace, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[workspace] failed to remove ${workspace}: ${(err as Error).message}`);
  }
}

export interface SpecCapture {
  specPath: string | null;
  specContent: string | null;
  status: "ok" | "no_spec" | "multi_spec";
  allSpecs: string[];
}

export function captureSpec(workspace: string): SpecCapture {
  const specsDir = path.join(workspace, "docs", "specs");
  let files: string[] = [];
  try {
    files = readdirSync(specsDir)
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .map((f) => path.join(specsDir, f));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    return { specPath: null, specContent: null, status: "no_spec", allSpecs: [] };
  }
  if (files.length > 1) {
    return {
      specPath: null,
      specContent: null,
      status: "multi_spec",
      allSpecs: files.map((f) => path.relative(workspace, f)),
    };
  }
  const specPath = files[0]!;
  return {
    specPath: path.relative(workspace, specPath),
    specContent: readFileSync(specPath, "utf-8"),
    status: "ok",
    allSpecs: [path.relative(workspace, specPath)],
  };
}

export interface FileInventoryEntry {
  path: string;
  size: number;
}

export function inventoryWorkspace(workspace: string): FileInventoryEntry[] {
  const out: FileInventoryEntry[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(full);
      } else if (s.isFile()) {
        out.push({ path: path.relative(workspace, full), size: s.size });
      }
    }
  };
  walk(workspace);
  return out;
}
