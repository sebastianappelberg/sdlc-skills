import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  AuthStorage,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import yaml from "yaml";
import { preflightProviders } from "./auth.js";
import { compare, loadRun } from "./compare.js";
import { resolveModelTriple } from "./models.js";
import { runId, skillsShortSha } from "./run-id.js";
import { ScenarioRunner, type SampleResult } from "./runner.js";
import { loadScenarioSet, pickScenarios } from "./scenario-loader.js";
import {
  ConfigSchema,
  type Config,
  type ManifestJson,
  type ModelRef,
  type Scenario,
  type Summary,
} from "./schema.js";
import { loadSkillsForTest } from "./skills.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EVALS_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EVALS_ROOT, "..");

interface CliArgs {
  command: "run" | "compare" | "help";
  flags: Map<string, string>;
  positional: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { command: "help", flags: new Map(), positional: [] };
  }
  const command = args[0] as CliArgs["command"];
  if (command !== "run" && command !== "compare") {
    return { command: "help", flags: new Map(), positional: [] };
  }
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags.set(key, next);
        i += 1;
      } else {
        flags.set(key, "true");
      }
    } else {
      positional.push(a);
    }
  }
  return { command, flags, positional };
}

function printHelp(): void {
  console.log(`sdlc-skills eval harness

Usage:
  pnpm eval -- run --skill <name> [--scenarios all|csv] [--samples K] [--config <path>]
  pnpm eval -- compare <run-A-dir> <run-B-dir> [--pairwise] [--force]
  pnpm smoke

run:
  --skill <name>        Required. e.g. "brainstorming".
  --scenarios all|csv   Default: all. CSV of scenario ids, or "smoke".
  --samples K           Default: 1.
  --config <path>       Default: evals/config.yaml.

compare:
  --pairwise            Also run the pairwise preference judge (2K calls per scenario).
  --force               Ignore set/persona drift.
`);
}

function loadConfig(p: string): Config {
  const text = readFileSync(p, "utf-8");
  return ConfigSchema.parse(yaml.parse(text));
}

function providersOf(...refs: ModelRef[]): string[] {
  return [...new Set(refs.map((r) => r.provider))];
}

async function runCommand(args: CliArgs): Promise<number> {
  const skillName = args.flags.get("skill");
  if (!skillName) {
    console.error("error: --skill is required");
    return 2;
  }
  const configPath = args.flags.get("config") ?? path.join(EVALS_ROOT, "config.yaml");
  const config = loadConfig(configPath);
  const samples = Number(args.flags.get("samples") ?? "1");
  if (!Number.isInteger(samples) || samples < 1) {
    console.error("error: --samples must be a positive integer");
    return 2;
  }

  const set = loadScenarioSet(skillName, EVALS_ROOT);
  const scenarios = pickScenarios(set.scenarios, args.flags.get("scenarios"));
  if (scenarios.length === 0) {
    console.error("error: no scenarios selected");
    return 2;
  }

  // Preflight: union of providers across all (scenario, role) triples.
  const allProviders = new Set<string>();
  for (const sc of scenarios) {
    const tri = resolveModelTriple(config, sc);
    for (const p of providersOf(tri.agent, tri.persona, tri.judge)) allProviders.add(p);
  }
  const authStorage = AuthStorage.create();
  const preflight = preflightProviders(authStorage, [...allProviders]);
  if (!preflight.ok) {
    for (const provider of preflight.missing) {
      console.error(`error: no auth configured for "${provider}" — run \`pi /login\` for ${provider}`);
    }
    return 3;
  }
  const modelRegistry = ModelRegistry.create(authStorage);

  const skills = loadSkillsForTest(skillName, REPO_ROOT);

  const id = runId(REPO_ROOT);
  const runDir = path.join(EVALS_ROOT, "results", id);
  if (existsSync(runDir)) {
    console.error(`error: ${runDir} already exists (run-id collision). Wait 1 second and retry.`);
    return 4;
  }
  mkdirSync(runDir, { recursive: true });

  // Per-scenario, all use the same triple if no per-scenario overrides; otherwise
  // we record the FIRST scenario's resolved triple in manifest.models (the comparator
  // is okay because per-scenario overrides also recorded in each run.json).
  const firstTriple = resolveModelTriple(config, scenarios[0]!);

  const manifest: ManifestJson = {
    runId: id,
    startedAt: new Date().toISOString(),
    skill: skillName,
    skillSha: skillsShortSha(REPO_ROOT),
    scenarioSetHash: set.scenarioSetHash,
    samples,
    scenarios: set.manifest.scenarios.filter((s) => scenarios.some((p) => p.id === s.id)),
    models: firstTriple,
  };
  writeFileSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  if (firstTriple.agent.provider === firstTriple.judge.provider &&
      firstTriple.agent.id === firstTriple.judge.id) {
    console.warn(`warn: agent and judge are the same model (${firstTriple.agent.provider}/${firstTriple.agent.id}).`);
  }

  console.log(`run ${id}`);
  console.log(`  skill=${skillName} sha=${manifest.skillSha} scenarios=${scenarios.map((s) => s.id).join(",")} K=${samples}`);

  const summary: Summary = { runId: id, perScenario: {} };

  for (const scenario of scenarios) {
    const triple = resolveModelTriple(config, scenario);
    const runner = new ScenarioRunner(
      { authStorage, modelRegistry, skills, skillName },
      { agentModel: triple.agent, personaModel: triple.persona, judgeModel: triple.judge },
    );
    const scenarioRow: Summary["perScenario"][string] = {
      samples: [],
      meanScore: null,
      gateFailCount: 0,
      statusCounts: {},
    };
    const scores: number[] = [];
    let tokenTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
    for (let k = 0; k < samples; k++) {
      console.log(`  [${scenario.id}] sample ${k + 1}/${samples}`);
      let result: SampleResult;
      try {
        result = await runner.run(scenario, k, runDir);
      } catch (err) {
        console.error(`    failed: ${(err as Error).message}`);
        scenarioRow.samples.push({
          sampleIndex: k,
          status: "agent_error",
          score: null,
          gates: {},
        });
        scenarioRow.statusCounts.agent_error = (scenarioRow.statusCounts.agent_error ?? 0) + 1;
        continue;
      }
      scenarioRow.samples.push({
        sampleIndex: k,
        status: result.status,
        score: result.judgment.score,
        gates: result.judgment.gates,
        failedGate: result.judgment.failed_gate,
      });
      scenarioRow.statusCounts[result.status] =
        (scenarioRow.statusCounts[result.status] ?? 0) + 1;
      if (result.judgment.status === "gate_failed") scenarioRow.gateFailCount += 1;
      if (typeof result.judgment.score === "number") scores.push(result.judgment.score);
      if (result.run.tokens) {
        tokenTotals = {
          input: tokenTotals.input + result.run.tokens.input,
          output: tokenTotals.output + result.run.tokens.output,
          cacheRead: tokenTotals.cacheRead + result.run.tokens.cacheRead,
          cacheWrite: tokenTotals.cacheWrite + result.run.tokens.cacheWrite,
          total: tokenTotals.total + result.run.tokens.total,
        };
      }
      console.log(`    status=${result.status} score=${result.judgment.score ?? "—"}`);
    }
    scenarioRow.meanScore =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    if (tokenTotals.total > 0) scenarioRow.tokens = tokenTotals;
    summary.perScenario[scenario.id] = scenarioRow;
  }

  writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2), "utf-8");
  console.log(`\nwrote ${runDir}`);
  return 0;
}

async function compareCommand(args: CliArgs): Promise<number> {
  if (args.positional.length < 2) {
    console.error("error: compare needs <run-A-dir> <run-B-dir>");
    return 2;
  }
  const runADir = path.resolve(args.positional[0]!);
  const runBDir = path.resolve(args.positional[1]!);
  const pairwiseFlag = args.flags.get("pairwise") === "true";
  const force = args.flags.get("force") === "true";

  const runA = loadRun(runADir);
  const runB = loadRun(runBDir);

  let scenariosById: Map<string, Scenario> | undefined;
  if (pairwiseFlag) {
    if (runA.manifest.skill !== runB.manifest.skill) {
      console.warn(
        `warn: comparing across skills (A=${runA.manifest.skill} B=${runB.manifest.skill}). Pairwise persona context may be inaccurate.`,
      );
    }
    try {
      const set = loadScenarioSet(runB.manifest.skill, EVALS_ROOT);
      scenariosById = new Map(set.scenarios.map((s) => [s.id, s] as const));
    } catch (err) {
      console.warn(
        `warn: could not load current scenarios for persona context: ${(err as Error).message}. Pairwise will use stub personas.`,
      );
    }
  }

  const md = await compare(runA, runB, {
    pairwise: pairwiseFlag,
    force,
    scenariosById,
  });
  process.stdout.write(md);
  return 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  let code = 0;
  if (args.command === "help") {
    printHelp();
    code = 0;
  } else if (args.command === "run") {
    code = await runCommand(args);
  } else if (args.command === "compare") {
    code = await compareCommand(args);
  }
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
