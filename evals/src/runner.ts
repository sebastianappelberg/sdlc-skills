import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type AuthStorage,
  createAgentSession,
  createSyntheticSourceInfo,
  DefaultResourceLoader,
  getAgentDir,
  type ModelRegistry,
  SessionManager,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { grade } from "./judge.js";
import { applyProviderOptions } from "./models.js";
import { PersonaSimulator } from "./persona.js";
import type { Judgment, ModelRef, RunJson, RunStatus, Scenario } from "./schema.js";
import { subscribeTranscript, type TranscriptEntry } from "./transcript.js";
import {
  captureSpec,
  createWorkspace,
  disposeWorkspace,
  inventoryWorkspace,
} from "./workspace.js";

const SPEC_WRITTEN_MARKER = "Spec written to ";

export interface SampleResult {
  scenarioId: string;
  sampleIndex: number;
  status: RunStatus;
  run: RunJson;
  judgment: Judgment;
}

export interface RunnerServices {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  skills: Skill[];
  skillName: string;
}

export interface RunnerConfig {
  agentModel: ModelRef;
  personaModel: ModelRef;
  judgeModel: ModelRef;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildSkillsOverride(skills: Skill[]) {
  return () => ({ skills, diagnostics: [] });
}

function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
}

function getLastAssistantText(messages: ReadonlyArray<unknown>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown } | null;
    if (!m || m.role !== "assistant") continue;
    const content = m.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((c) => c && typeof c === "object" && (c as { type?: string }).type === "text")
      .map((c) => String((c as { text?: string }).text ?? ""))
      .join("\n");
    if (text.trim().length > 0) return text;
  }
  return "";
}

export class ScenarioRunner {
  constructor(
    private readonly services: RunnerServices,
    private readonly config: RunnerConfig,
  ) {}

  async run(scenario: Scenario, sampleIndex: number, runDir: string): Promise<SampleResult> {
    const sampleDir = path.join(runDir, scenario.id, String(sampleIndex));
    ensureDir(sampleDir);

    const workspace = createWorkspace();
    const transcript: TranscriptEntry[] = [];
    const startedAt = nowIso();
    let status: RunStatus = "ok";
    let terminationReason = "unknown";
    let turns = 0;
    let errorRec: RunJson["error"] | undefined;
    let agentSessionDispose: (() => void) | null = null;
    let persona: PersonaSimulator | null = null;
    let tokens: RunJson["tokens"];

    try {
      persona = await PersonaSimulator.create({
        persona: scenario.persona,
        scenarioId: scenario.id,
        sampleIndex,
        model: this.config.personaModel,
        authStorage: this.services.authStorage,
        modelRegistry: this.services.modelRegistry,
      });

      const agentResolved = applyProviderOptions(
        this.config.agentModel,
        this.services.modelRegistry,
      );

      const skills = this.services.skills.map((s) => ({
        ...s,
        sourceInfo: s.sourceInfo ?? createSyntheticSourceInfo(s.filePath, { source: "sdlc-skills-eval" }),
      }));

      const loader = new DefaultResourceLoader({
        cwd: workspace,
        agentDir: getAgentDir(),
        noPromptTemplates: true,
        noContextFiles: true,
        noExtensions: true,
        skillsOverride: buildSkillsOverride(skills),
      });
      await loader.reload();

      const { session } = await createAgentSession({
        cwd: workspace,
        authStorage: this.services.authStorage,
        modelRegistry: this.services.modelRegistry,
        resourceLoader: loader,
        sessionManager: SessionManager.inMemory(workspace),
        model: agentResolved.model,
        thinkingLevel: agentResolved.thinkingLevel,
      });
      agentSessionDispose = () => session.dispose();
      subscribeTranscript(session, transcript);

      const opening = `/skill:${this.services.skillName}\n\n${scenario.persona.opening_message}`;
      await session.prompt(opening);
      turns = 1;

      let approvedSent = false;
      while (turns < scenario.turnCap) {
        const lastText = getLastAssistantText(session.agent.state.messages);
        const specCheck = captureSpec(workspace);
        const terminalSeen = lastText.includes(SPEC_WRITTEN_MARKER) && specCheck.status === "ok";

        if (terminalSeen && !approvedSent) {
          await session.prompt("approved");
          approvedSent = true;
          turns += 1;
          terminationReason = "spec_written_and_approved";
          break;
        }

        let personaReply: string;
        try {
          personaReply = await persona.next({ agentMessage: lastText });
        } catch (err) {
          status = "persona_error";
          errorRec = {
            kind: "persona_exception",
            message: (err as Error).message,
            stack: (err as Error).stack,
          };
          terminationReason = "persona_error";
          break;
        }

        if (personaReply.trim().length === 0) {
          personaReply = "Looks fine. Please continue.";
        }

        try {
          await session.prompt(personaReply);
        } catch (err) {
          status = "agent_error";
          errorRec = {
            kind: "agent_exception",
            message: (err as Error).message,
            stack: (err as Error).stack,
          };
          terminationReason = "agent_error";
          break;
        }
        turns += 1;
      }

      if (status === "ok" && !approvedSent) {
        status = "turn_cap";
        terminationReason = "turn_cap";
      }

      try {
        const stats = session.getSessionStats();
        tokens = {
          input: stats.tokens.input,
          output: stats.tokens.output,
          cacheRead: stats.tokens.cacheRead,
          cacheWrite: stats.tokens.cacheWrite,
          total: stats.tokens.total,
        };
      } catch {
        // ignore — token stats are best-effort
      }
    } catch (err) {
      status = "agent_error";
      errorRec = {
        kind: "setup_exception",
        message: (err as Error).message,
        stack: (err as Error).stack,
      };
      terminationReason = "setup_error";
    } finally {
      try {
        agentSessionDispose?.();
      } catch {
        // ignore
      }
      persona?.close();
    }

    const finalCapture = captureSpec(workspace);
    if (status === "ok" || status === "turn_cap") {
      if (finalCapture.status === "no_spec") status = "no_spec";
      else if (finalCapture.status === "multi_spec") status = "multi_spec";
    }
    const inventory = inventoryWorkspace(workspace);
    writeJson(path.join(sampleDir, "transcript.json"), transcript);
    if (finalCapture.specContent !== null) {
      writeFileSync(path.join(sampleDir, "spec.md"), finalCapture.specContent, "utf-8");
    }
    writeJson(path.join(sampleDir, "workspace-files.json"), {
      specPath: finalCapture.specPath,
      allSpecs: finalCapture.allSpecs,
      files: inventory,
    });

    let judgment: Judgment;
    if (status === "agent_error" || status === "persona_error") {
      judgment = {
        status: "judge_error",
        gates: {
          spec_exists: false,
          spec_path_correct: false,
          no_placeholders: false,
          respected_hard_gate: false,
        },
        scores: {},
        score: null,
        notes: "Skipped judge due to runner error.",
        judgeOutputMode: "missing",
        judgeModel: this.config.judgeModel,
      };
    } else {
      judgment = await grade({
        spec: finalCapture.specContent,
        workspaceFiles: inventory.map((f) => f.path),
        transcript,
        scenario,
        judgeModel: this.config.judgeModel,
        authStorage: this.services.authStorage,
        modelRegistry: this.services.modelRegistry,
      });
    }

    if (status === "ok" && judgment.status === "gate_failed") status = "gate_failed";
    if (judgment.status === "judge_error" && status === "ok") status = "judge_error";

    writeJson(path.join(sampleDir, "judgment.json"), judgment);

    const run: RunJson = {
      status,
      startedAt,
      endedAt: nowIso(),
      turns,
      terminationReason,
      agentModel: this.config.agentModel,
      personaModel: this.config.personaModel,
      scenarioId: scenario.id,
      sampleIndex,
      tokens,
      error: errorRec,
    };
    writeJson(path.join(sampleDir, "run.json"), run);

    disposeWorkspace(workspace);

    return { scenarioId: scenario.id, sampleIndex, status, run, judgment };
  }
}
