import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AuthStorage,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { pairwise } from "./pairwise.js";
import type { Scenario } from "./schema.js";
import {
  type Judgment,
  JudgmentSchema,
  type ManifestJson,
  ManifestJsonSchema,
  type RunJson,
  RunJsonSchema,
} from "./schema.js";
import { bootstrapCI, wilsonCI } from "./stats.js";

interface LoadedRun {
  runId: string;
  dir: string;
  manifest: ManifestJson;
  perScenario: Map<string, SampleRecord[]>;
}

interface SampleRecord {
  sampleIndex: number;
  run: RunJson;
  judgment: Judgment;
  spec: string | null;
}

function readJson<T>(file: string, parse: (data: unknown) => T): T {
  const raw = JSON.parse(readFileSync(file, "utf-8"));
  return parse(raw);
}

export function loadRun(runDir: string): LoadedRun {
  const manifest = readJson(path.join(runDir, "manifest.json"), (d) =>
    ManifestJsonSchema.parse(d),
  );
  const perScenario = new Map<string, SampleRecord[]>();
  let scenarioDirs: string[];
  try {
    scenarioDirs = readdirSync(runDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    scenarioDirs = [];
  }
  for (const scenarioId of scenarioDirs) {
    const scenarioPath = path.join(runDir, scenarioId);
    let sampleDirs: string[];
    try {
      sampleDirs = readdirSync(scenarioPath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }
    const samples: SampleRecord[] = [];
    for (const sampleName of sampleDirs.sort((a, b) => Number(a) - Number(b))) {
      const sampleDir = path.join(scenarioPath, sampleName);
      try {
        const run = readJson(path.join(sampleDir, "run.json"), (d) => RunJsonSchema.parse(d));
        const judgment = readJson(path.join(sampleDir, "judgment.json"), (d) =>
          JudgmentSchema.parse(d),
        );
        let spec: string | null = null;
        try {
          spec = readFileSync(path.join(sampleDir, "spec.md"), "utf-8");
        } catch {
          spec = null;
        }
        samples.push({ sampleIndex: Number(sampleName), run, judgment, spec });
      } catch (err) {
        console.warn(`[compare] skipping ${sampleDir}: ${(err as Error).message}`);
      }
    }
    if (samples.length > 0) perScenario.set(scenarioId, samples);
  }
  return { runId: manifest.runId, dir: runDir, manifest, perScenario };
}

const CRITERIA = [
  "captures_purpose",
  "captures_constraints",
  "captures_success_criteria",
  "architecture_section_appropriate",
  "decomposed_or_flagged",
  "asked_clarifying_questions",
] as const;
type Criterion = (typeof CRITERIA)[number];

function classifyDelta(lo: number, hi: number): "improvement" | "regression" | "noise" {
  if (lo > 0) return "improvement";
  if (hi < 0) return "regression";
  return "noise";
}

interface ScenarioDriftStatus {
  scenarioId: string;
  reason: "set_drift" | "persona_drift" | "missing";
  detail: string;
}

interface ScenarioReport {
  scenarioId: string;
  pairs: number;
  absoluteByCriterion: Record<
    Criterion,
    { mean: number; lo: number; hi: number; classification: ReturnType<typeof classifyDelta> }
  >;
  headlineDelta?: { mean: number; lo: number; hi: number };
  gateFailA: number;
  gateFailB: number;
  pairwise?: {
    scoredPairs: number;
    winA: number;
    winB: number;
    ties: number;
    winRateB: { lo: number; hi: number; p: number };
  };
}

export interface CompareOptions {
  pairwise: boolean;
  force: boolean;
  judgeModelOverride?: { provider: string; id: string };
  scenariosById?: Map<string, Scenario>;
}

export async function compare(
  runA: LoadedRun,
  runB: LoadedRun,
  options: CompareOptions,
): Promise<string> {
  const drift: ScenarioDriftStatus[] = [];
  const reports: ScenarioReport[] = [];
  const scenarioIds = new Set<string>([...runA.perScenario.keys(), ...runB.perScenario.keys()]);

  const hashesA = new Map(runA.manifest.scenarios.map((s) => [s.id, s.sha256] as const));
  const hashesB = new Map(runB.manifest.scenarios.map((s) => [s.id, s.sha256] as const));

  const personaDrift =
    runA.manifest.models.persona.provider !== runB.manifest.models.persona.provider ||
    runA.manifest.models.persona.id !== runB.manifest.models.persona.id;

  let authStorage: AuthStorage | null = null;
  let modelRegistry: ModelRegistry | null = null;
  if (options.pairwise) {
    authStorage = AuthStorage.create();
    modelRegistry = ModelRegistry.create(authStorage);
  }

  for (const scenarioId of [...scenarioIds].sort()) {
    const samplesA = runA.perScenario.get(scenarioId);
    const samplesB = runB.perScenario.get(scenarioId);
    if (!samplesA || !samplesB) {
      drift.push({
        scenarioId,
        reason: "missing",
        detail: !samplesA ? `missing in ${runA.runId}` : `missing in ${runB.runId}`,
      });
      continue;
    }

    if (hashesA.get(scenarioId) !== hashesB.get(scenarioId) && !options.force) {
      drift.push({
        scenarioId,
        reason: "set_drift",
        detail: `sha256 mismatch (${hashesA.get(scenarioId)} vs ${hashesB.get(scenarioId)})`,
      });
      continue;
    }
    if (personaDrift && !options.force) {
      drift.push({
        scenarioId,
        reason: "persona_drift",
        detail: `persona model differs: ${runA.manifest.models.persona.provider}/${runA.manifest.models.persona.id} vs ${runB.manifest.models.persona.provider}/${runB.manifest.models.persona.id}`,
      });
      continue;
    }

    const paired = pairBySampleIndex(samplesA, samplesB);
    const gateFailA = samplesA.filter((s) => s.judgment.status === "gate_failed").length;
    const gateFailB = samplesB.filter((s) => s.judgment.status === "gate_failed").length;

    const absoluteByCriterion = {} as ScenarioReport["absoluteByCriterion"];
    for (const c of CRITERIA) {
      const deltas: number[] = [];
      for (const [a, b] of paired) {
        const va = a.judgment.scores[c];
        const vb = b.judgment.scores[c];
        if (typeof va === "number" && typeof vb === "number") {
          deltas.push(vb - va);
        }
      }
      const ci = bootstrapCI(deltas);
      absoluteByCriterion[c] = {
        mean: ci.mean,
        lo: ci.lo,
        hi: ci.hi,
        classification: classifyDelta(ci.lo, ci.hi),
      };
    }

    const headlineDeltas: number[] = [];
    for (const [a, b] of paired) {
      if (typeof a.judgment.score === "number" && typeof b.judgment.score === "number") {
        headlineDeltas.push(b.judgment.score - a.judgment.score);
      }
    }
    const headline = headlineDeltas.length > 0 ? bootstrapCI(headlineDeltas) : undefined;

    let pairwiseReport: ScenarioReport["pairwise"] | undefined;
    if (options.pairwise && authStorage && modelRegistry) {
      const judgeModel = options.judgeModelOverride ?? runB.manifest.models.judge;
      let winA = 0;
      let winB = 0;
      let ties = 0;
      let scoredPairs = 0;
      for (const [a, b] of paired) {
        if (!a.spec || !b.spec) continue;
        scoredPairs += 1;
        const scenario =
          options.scenariosById?.get(scenarioId) ??
          scenarioFromManifest(runB.manifest, scenarioId, a, b);
        const order1 = await pairwise({
          specA: a.spec,
          specB: b.spec,
          scenario,
          judgeModel,
          authStorage,
          modelRegistry,
        });
        const order2 = await pairwise({
          specA: b.spec,
          specB: a.spec,
          scenario,
          judgeModel,
          authStorage,
          modelRegistry,
        });
        const order2Mapped =
          order2.winner === "A" ? "B" : order2.winner === "B" ? "A" : "tie";
        if (order1.winner === order2Mapped && order1.winner !== "tie") {
          if (order1.winner === "B") winB += 1;
          else winA += 1;
        } else {
          ties += 1;
        }
      }
      pairwiseReport = {
        scoredPairs,
        winA,
        winB,
        ties,
        winRateB: wilsonCI(winB, winA + winB + ties),
      };
    }

    reports.push({
      scenarioId,
      pairs: paired.length,
      absoluteByCriterion,
      headlineDelta: headline ? { mean: headline.mean, lo: headline.lo, hi: headline.hi } : undefined,
      gateFailA,
      gateFailB,
      pairwise: pairwiseReport,
    });
  }

  const md = renderMarkdown(runA, runB, reports, drift, options);
  const outPath = path.join(runB.dir, `compare-vs-${runA.runId}.md`);
  writeFileSync(outPath, md, "utf-8");
  return md;
}

function pairBySampleIndex(a: SampleRecord[], b: SampleRecord[]): Array<[SampleRecord, SampleRecord]> {
  const out: Array<[SampleRecord, SampleRecord]> = [];
  const bByIdx = new Map(b.map((s) => [s.sampleIndex, s] as const));
  for (const aSample of a) {
    const bSample = bByIdx.get(aSample.sampleIndex);
    if (bSample) out.push([aSample, bSample]);
  }
  return out;
}

function scenarioFromManifest(
  manifest: ManifestJson,
  scenarioId: string,
  a: SampleRecord,
  b: SampleRecord,
) {
  // For the pairwise judge we need the scenario's persona to assess constraint coverage.
  // The persona is not in the manifest; reconstruct a minimal scenario stub.
  // Both runs were the same scenario set, so the persona is fixed across samples.
  // We rely on the judge prompt receiving the persona from the original scenario file
  // — for that, callers should pass the scenario in directly. For comparator use, we
  // reconstruct a minimal stub that lets the prompt still work.
  void manifest;
  void a;
  void b;
  return {
    id: scenarioId,
    turnCap: 0,
    seed: 0,
    persona: {
      role: "(unknown — see source scenario)",
      intent: "(unknown — see source scenario)",
      hard_constraints: [],
      soft_preferences: [],
      knowledge_gaps: [],
      opening_message: "",
    },
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function num(n: number, digits = 2): string {
  return n.toFixed(digits);
}

function renderMarkdown(
  runA: LoadedRun,
  runB: LoadedRun,
  reports: ScenarioReport[],
  drift: ScenarioDriftStatus[],
  options: CompareOptions,
): string {
  const out: string[] = [];
  out.push(`# Compare ${runB.runId} vs ${runA.runId}`);
  out.push("");
  out.push(`- Run A: \`${runA.dir}\` — skill SHA \`${runA.manifest.skillSha}\``);
  out.push(`- Run B: \`${runB.dir}\` — skill SHA \`${runB.manifest.skillSha}\``);
  out.push(
    `- Agent: A=${runA.manifest.models.agent.provider}/${runA.manifest.models.agent.id}  →  B=${runB.manifest.models.agent.provider}/${runB.manifest.models.agent.id}`,
  );
  out.push(
    `- Persona: A=${runA.manifest.models.persona.provider}/${runA.manifest.models.persona.id}  →  B=${runB.manifest.models.persona.provider}/${runB.manifest.models.persona.id}`,
  );
  out.push(
    `- Judge: A=${runA.manifest.models.judge.provider}/${runA.manifest.models.judge.id}  →  B=${runB.manifest.models.judge.provider}/${runB.manifest.models.judge.id}`,
  );
  out.push("");
  if (drift.length > 0) {
    out.push("## Excluded scenarios (drift)");
    for (const d of drift) {
      out.push(`- \`${d.scenarioId}\` — ${d.reason}: ${d.detail}`);
    }
    out.push("");
  }
  out.push("## Per-scenario results");
  for (const r of reports) {
    out.push("");
    out.push(`### ${r.scenarioId} (${r.pairs} paired samples)`);
    if (r.headlineDelta) {
      const cls = classifyDelta(r.headlineDelta.lo, r.headlineDelta.hi);
      out.push(
        `- Headline score Δ (B − A): **${num(r.headlineDelta.mean)}** (95% CI [${num(r.headlineDelta.lo)}, ${num(r.headlineDelta.hi)}]) — ${cls}`,
      );
    }
    out.push(`- Gate failures: A=${r.gateFailA}, B=${r.gateFailB}`);
    out.push("");
    out.push("| Criterion | Δ mean | 95% CI lo | 95% CI hi | Verdict |");
    out.push("|---|---|---|---|---|");
    for (const c of CRITERIA) {
      const row = r.absoluteByCriterion[c];
      out.push(
        `| ${c} | ${num(row.mean)} | ${num(row.lo)} | ${num(row.hi)} | ${row.classification} |`,
      );
    }
    if (r.pairwise) {
      out.push("");
      const wr = r.pairwise.winRateB;
      out.push(
        `- Pairwise: scored=${r.pairwise.scoredPairs}, B wins=${r.pairwise.winB}, A wins=${r.pairwise.winA}, ties=${r.pairwise.ties} — B win rate ${pct(wr.p)} (95% CI [${pct(wr.lo)}, ${pct(wr.hi)}])`,
      );
    }
  }
  out.push("");
  out.push("## Reliability");
  let reliableImp = 0;
  let reliableReg = 0;
  let noise = 0;
  for (const r of reports) {
    for (const c of CRITERIA) {
      const cls = r.absoluteByCriterion[c].classification;
      if (cls === "improvement") reliableImp += 1;
      else if (cls === "regression") reliableReg += 1;
      else noise += 1;
    }
  }
  out.push(`- reliable improvements: ${reliableImp}`);
  out.push(`- reliable regressions: ${reliableReg}`);
  out.push(`- within noise: ${noise}`);
  if (!options.pairwise) {
    out.push("");
    out.push("_(Run with `--pairwise` to also compute order-controlled preference votes.)_");
  }
  return out.join("\n") + "\n";
}
