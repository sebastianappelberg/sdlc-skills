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
  type ModelRef,
  type PairwiseResult,
  PairwiseSubmissionSchema,
  type Persona,
  type Scenario,
} from "./schema.js";

const PairwiseParamsSchema = Type.Object({
  winner: Type.Union(
    [Type.Literal("A"), Type.Literal("B"), Type.Literal("tie")],
    { description: "Which spec is better." },
  ),
  confidence: Type.Union([Type.Literal("low"), Type.Literal("med"), Type.Literal("high")]),
  reasoning: Type.String({ description: "Why this winner." }),
});

function pairwisePrompt(args: {
  scenario: Scenario;
  persona: Persona;
  specA: string;
  specB: string;
}): string {
  const personaBlock = `Role: ${args.persona.role}
Intent: ${args.persona.intent}
Hard constraints: ${args.persona.hard_constraints.join("; ") || "(none)"}
Soft preferences: ${args.persona.soft_preferences.join("; ") || "(none)"}
Knowledge gaps: ${args.persona.knowledge_gaps.join("; ") || "(none)"}`;

  return `You are comparing two design specs produced for the same scenario. Pick which is better — or call it a tie when they are genuinely equivalent in quality.

== Scenario: ${args.scenario.id} ==
${personaBlock}

== Spec A ==
${args.specA}

== Spec B ==
${args.specB}

== Your task ==
Call submit_pairwise exactly once. Judge by:
- Captures the persona's stated and unstated constraints.
- Right level of architectural depth for the work.
- Concrete, falsifiable success criteria.
- No placeholders or contradictions.
- Decomposes appropriately if the scope is large.

Score conservatively. "tie" is acceptable when the specs are genuinely close. Confidence: "low" if you nearly called it a tie; "high" if one is clearly better.`;
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

export async function pairwise(args: {
  specA: string;
  specB: string;
  scenario: Scenario;
  judgeModel: ModelRef;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
}): Promise<PairwiseResult> {
  const { model, thinkingLevel } = applyProviderOptions(args.judgeModel, args.modelRegistry);

  let captured: unknown = null;
  const submitTool: ToolDefinition = defineTool({
    name: "submit_pairwise",
    label: "Submit Pairwise",
    description: "Submit the pairwise preference. Call exactly once.",
    parameters: PairwiseParamsSchema,
    execute: async (_id, params) => {
      captured = params;
      return { content: [{ type: "text", text: "Preference submitted." }], details: {} };
    },
  });

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    noSkills: true,
    noPromptTemplates: true,
    noContextFiles: true,
    noExtensions: true,
    systemPromptOverride: () =>
      "You are an evaluator comparing two specs. Call the submit_pairwise tool exactly once.",
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    authStorage: args.authStorage,
    modelRegistry: args.modelRegistry,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    customTools: [submitTool],
    tools: ["submit_pairwise"],
    model,
    thinkingLevel,
  });

  let outputMode: "tool" | "text-fallback" | "missing" = "missing";
  try {
    await session.prompt(
      pairwisePrompt({
        scenario: args.scenario,
        persona: args.scenario.persona,
        specA: args.specA,
        specB: args.specB,
      }),
    );
    if (captured !== null) {
      outputMode = "tool";
    } else {
      const fb = tryParseJsonBlock(session.getLastAssistantText() ?? "");
      if (fb) {
        captured = fb;
        outputMode = "text-fallback";
      }
    }
  } finally {
    try {
      session.dispose();
    } catch {
      // ignore
    }
  }

  if (captured === null) {
    return { winner: "tie", confidence: "low", reasoning: "No submission.", outputMode: "missing" };
  }
  const parsed = PairwiseSubmissionSchema.safeParse(captured);
  if (!parsed.success) {
    return {
      winner: "tie",
      confidence: "low",
      reasoning: `Schema error: ${parsed.error.message}`,
      outputMode,
    };
  }
  return { ...parsed.data, outputMode };
}
