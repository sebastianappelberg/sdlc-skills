import {
  type AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  type ModelRegistry,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { applyProviderOptions } from "./models.js";
import {
  type Judgment,
  type ModelRef,
  type Persona,
  RubricSubmissionSchema,
  type Scenario,
} from "./schema.js";
import type { TranscriptEntry } from "./transcript.js";

const RUBRIC_WEIGHTS = {
  captures_purpose: 1.0,
  captures_constraints: 1.5,
  captures_success_criteria: 1.0,
  architecture_section_appropriate: 1.0,
  decomposed_or_flagged: 1.0,
  asked_clarifying_questions: 0.5,
} as const;

const RubricParamsSchema = Type.Object({
  spec_exists: Type.Boolean({ description: "Was a spec file produced at all?" }),
  spec_path_correct: Type.Boolean({
    description: "Is the spec under docs/specs/ and named YYYY-MM-DD-*.md?",
  }),
  no_placeholders: Type.Boolean({
    description: "Spec contains no TBD/TODO/fill-in/<placeholder> markers.",
  }),
  respected_hard_gate: Type.Boolean({
    description:
      "The agent did not write code, scaffold a project, or invoke any implementation skill before user approval of the design.",
  }),
  captures_purpose: Type.Integer({ minimum: 1, maximum: 5, description: "1-5" }),
  captures_constraints: Type.Integer({
    minimum: 1,
    maximum: 5,
    description: "Includes hard constraints surfaced via questioning.",
  }),
  captures_success_criteria: Type.Integer({ minimum: 1, maximum: 5 }),
  architecture_section_appropriate: Type.Integer({
    minimum: 1,
    maximum: 5,
    description: "Right depth for the project's complexity.",
  }),
  decomposed_or_flagged: Type.Integer({
    minimum: 1,
    maximum: 5,
    description:
      "If large scope, flagged for decomposition. If naturally single-spec sized, score 5 by default.",
  }),
  asked_clarifying_questions: Type.Integer({
    minimum: 1,
    maximum: 5,
    description: "Judged on the transcript, not the spec.",
  }),
  notes: Type.String({ description: "Brief reasoning for the scores." }),
});

function judgePrompt(args: {
  spec: string | null;
  persona: Persona;
  scenarioId: string;
  transcriptDigest: string;
  workspaceFiles: string[];
}): string {
  const personaBlock = `Role: ${args.persona.role}
Intent: ${args.persona.intent}
Hard constraints: ${args.persona.hard_constraints.join("; ") || "(none)"}
Soft preferences: ${args.persona.soft_preferences.join("; ") || "(none)"}
Knowledge gaps: ${args.persona.knowledge_gaps.join("; ") || "(none)"}`;

  return `You are grading the output of a brainstorming/design session against a fixed rubric.

== Scenario: ${args.scenarioId} ==
The simulated user (persona) the assistant was talking to:
${personaBlock}

== Workspace files produced by the assistant ==
${args.workspaceFiles.length === 0 ? "(none)" : args.workspaceFiles.join("\n")}

== Spec produced by the assistant ==
${args.spec === null ? "(no spec file under docs/specs/*.md was produced)" : args.spec}

== Transcript digest (assistant messages and persona replies) ==
${args.transcriptDigest}

== Your task ==
Call the submit_rubric tool exactly once with your assessment.

Gates (true/false):
- spec_exists: a markdown spec was produced.
- spec_path_correct: spec is at docs/specs/YYYY-MM-DD-<topic>.md (or -design.md).
- no_placeholders: no TBD / TODO / fill in / <placeholder> markers remain.
- respected_hard_gate: the assistant did not write code or scaffold a project before the persona approved the design.

Scores (1-5, integers):
- captures_purpose: how well the spec captures what the user actually wants.
- captures_constraints: hard + relevant soft constraints, including those the persona only revealed when asked.
- captures_success_criteria: how a future reader would tell whether the work is done.
- architecture_section_appropriate: right depth for the project's complexity (not too deep, not too shallow).
- decomposed_or_flagged: 5 if scope is single-spec sized OR the assistant flagged it for decomposition; lower if the assistant tried to design a multi-subsystem platform inside one spec.
- asked_clarifying_questions: based on the transcript — was the agent asking, or just dictating?

Score conservatively. If you are not sure, the score is 3. Only score 5 for clearly excellent.
Notes: a short paragraph explaining the scores, especially any failing gate or low score.

Call submit_rubric now. Do not produce any other tool calls and do not write text after the tool call.`;
}

function digestTranscript(entries: TranscriptEntry[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    if (e.type === "turn_end" || e.type === "message_end") {
      const payload = e.payload as { message?: { role?: string; content?: unknown } };
      const msg = payload.message;
      if (!msg || msg.role !== "assistant") continue;
      const text = extractText(msg.content);
      if (text.trim().length > 0) {
        lines.push(`[assistant] ${text.trim()}`);
      }
    }
  }
  return lines.join("\n\n").slice(0, 60_000);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const c of content) {
    if (c && typeof c === "object" && (c as { type?: string }).type === "text") {
      parts.push(String((c as { text?: string }).text ?? ""));
    }
  }
  return parts.join("\n");
}

function tryParseJsonBlock(text: string): unknown | null {
  if (!text) return null;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch?.[1] ?? text;
  try {
    return JSON.parse(candidate);
  } catch {
    const braceStart = candidate.indexOf("{");
    const braceEnd = candidate.lastIndexOf("}");
    if (braceStart >= 0 && braceEnd > braceStart) {
      try {
        return JSON.parse(candidate.slice(braceStart, braceEnd + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function grade(args: {
  spec: string | null;
  workspaceFiles: string[];
  transcript: TranscriptEntry[];
  scenario: Scenario;
  judgeModel: ModelRef;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
}): Promise<Judgment> {
  const { model, thinkingLevel } = applyProviderOptions(args.judgeModel, args.modelRegistry);

  let captured: unknown = null;
  const submitTool: ToolDefinition = defineTool({
    name: "submit_rubric",
    label: "Submit Rubric",
    description: "Submit the rubric evaluation. Call exactly once.",
    parameters: RubricParamsSchema,
    execute: async (_id, params) => {
      captured = params;
      return {
        content: [{ type: "text", text: "Rubric submitted." }],
        details: {},
      };
    },
  });

  const prompt = judgePrompt({
    spec: args.spec,
    persona: args.scenario.persona,
    scenarioId: args.scenario.id,
    transcriptDigest: digestTranscript(args.transcript),
    workspaceFiles: args.workspaceFiles,
  });

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    noSkills: true,
    noPromptTemplates: true,
    noContextFiles: true,
    noExtensions: true,
    systemPromptOverride: () => "You are an evaluator. Call the submit_rubric tool exactly once.",
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    authStorage: args.authStorage,
    modelRegistry: args.modelRegistry,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    customTools: [submitTool],
    tools: ["submit_rubric"],
    model,
    thinkingLevel,
  });

  let outputMode: "tool" | "text-fallback" | "missing" = "missing";
  try {
    await session.prompt(prompt);
    if (captured !== null) {
      outputMode = "tool";
    } else {
      const fallback = tryParseJsonBlock(session.getLastAssistantText() ?? "");
      if (fallback) {
        captured = fallback;
        outputMode = "text-fallback";
      }
    }
  } catch (err) {
    return {
      status: "judge_error",
      gates: {
        spec_exists: false,
        spec_path_correct: false,
        no_placeholders: false,
        respected_hard_gate: false,
      },
      scores: {},
      score: null,
      notes: "",
      judgeOutputMode: outputMode,
      judgeModel: args.judgeModel,
      error: { kind: "judge_exception", message: (err as Error).message },
    };
  } finally {
    try {
      session.dispose();
    } catch {
      // ignore
    }
  }

  if (captured === null) {
    return {
      status: "judge_error",
      gates: {
        spec_exists: false,
        spec_path_correct: false,
        no_placeholders: false,
        respected_hard_gate: false,
      },
      scores: {},
      score: null,
      notes: "",
      judgeOutputMode: "missing",
      judgeModel: args.judgeModel,
      error: { kind: "no_submission", message: "Judge did not call submit_rubric or produce parseable JSON." },
    };
  }

  const parsed = RubricSubmissionSchema.safeParse(captured);
  if (!parsed.success) {
    return {
      status: "judge_error",
      gates: {
        spec_exists: false,
        spec_path_correct: false,
        no_placeholders: false,
        respected_hard_gate: false,
      },
      scores: {},
      score: null,
      notes: "",
      judgeOutputMode: outputMode,
      judgeModel: args.judgeModel,
      error: { kind: "schema_error", message: parsed.error.message },
    };
  }

  const sub = parsed.data;
  const gates = {
    spec_exists: sub.spec_exists,
    spec_path_correct: sub.spec_path_correct,
    no_placeholders: sub.no_placeholders,
    respected_hard_gate: sub.respected_hard_gate,
  };
  const scores = {
    captures_purpose: sub.captures_purpose,
    captures_constraints: sub.captures_constraints,
    captures_success_criteria: sub.captures_success_criteria,
    architecture_section_appropriate: sub.architecture_section_appropriate,
    decomposed_or_flagged: sub.decomposed_or_flagged,
    asked_clarifying_questions: sub.asked_clarifying_questions,
  };

  const failedGate = (Object.keys(gates) as Array<keyof typeof gates>).find((k) => !gates[k]);
  if (failedGate) {
    return {
      status: "gate_failed",
      failed_gate: failedGate,
      gates,
      scores,
      score: null,
      notes: sub.notes,
      judgeOutputMode: outputMode,
      judgeModel: args.judgeModel,
    };
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const [k, w] of Object.entries(RUBRIC_WEIGHTS) as Array<
    [keyof typeof RUBRIC_WEIGHTS, number]
  >) {
    weighted += scores[k] * w;
    totalWeight += w;
  }
  const score = totalWeight > 0 ? weighted / totalWeight : null;

  return {
    status: "ok",
    gates,
    scores,
    score,
    notes: sub.notes,
    judgeOutputMode: outputMode,
    judgeModel: args.judgeModel,
  };
}
