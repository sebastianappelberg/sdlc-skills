import { z } from "zod";

export const ModelRefSchema = z.object({
  provider: z.string().min(1),
  id: z.string().min(1),
  thinkingLevel: z
    .enum(["off", "minimal", "low", "medium", "high", "xhigh"])
    .optional(),
});
export type ModelRef = z.infer<typeof ModelRefSchema>;

export const PersonaSchema = z.object({
  role: z.string().min(1),
  intent: z.string().min(1),
  hard_constraints: z.array(z.string()).default([]),
  soft_preferences: z.array(z.string()).default([]),
  knowledge_gaps: z.array(z.string()).default([]),
  opening_message: z.string().min(1),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  turnCap: z.number().int().positive().default(20),
  seed: z.number().int().nonnegative().default(0),
  persona: PersonaSchema,
  agent: ModelRefSchema.optional(),
  persona_model: ModelRefSchema.optional(),
  judge: ModelRefSchema.optional(),
  notes: z.string().optional(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const ManifestEntrySchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const ScenarioManifestSchema = z.object({
  scenarios: z.array(ManifestEntrySchema).min(1),
});
export type ScenarioManifest = z.infer<typeof ScenarioManifestSchema>;

export const ConfigSchema = z.object({
  defaults: z.object({
    agent: ModelRefSchema,
    persona: ModelRefSchema,
    judge: ModelRefSchema,
  }),
});
export type Config = z.infer<typeof ConfigSchema>;

export const GateName = z.enum([
  "spec_exists",
  "spec_path_correct",
  "no_placeholders",
  "respected_hard_gate",
]);
export type GateName = z.infer<typeof GateName>;

export const RubricScoresSchema = z.object({
  captures_purpose: z.number().min(1).max(5),
  captures_constraints: z.number().min(1).max(5),
  captures_success_criteria: z.number().min(1).max(5),
  architecture_section_appropriate: z.number().min(1).max(5),
  decomposed_or_flagged: z.number().min(1).max(5),
  asked_clarifying_questions: z.number().min(1).max(5),
});
export type RubricScores = z.infer<typeof RubricScoresSchema>;

export const RubricGatesSchema = z.object({
  spec_exists: z.boolean(),
  spec_path_correct: z.boolean(),
  no_placeholders: z.boolean(),
  respected_hard_gate: z.boolean(),
});

export const RubricSubmissionSchema = RubricGatesSchema.merge(RubricScoresSchema).extend({
  notes: z.string().default(""),
});
export type RubricSubmission = z.infer<typeof RubricSubmissionSchema>;

export const JudgmentSchema = z.object({
  status: z.enum(["ok", "gate_failed", "judge_error"]),
  failed_gate: GateName.optional(),
  gates: RubricGatesSchema,
  scores: RubricScoresSchema.partial(),
  score: z.number().nullable(),
  notes: z.string(),
  judgeOutputMode: z.enum(["tool", "text-fallback", "missing"]),
  judgeModel: ModelRefSchema,
  error: z
    .object({
      kind: z.string(),
      message: z.string(),
    })
    .optional(),
});
export type Judgment = z.infer<typeof JudgmentSchema>;

export const PairwiseSubmissionSchema = z.object({
  winner: z.enum(["A", "B", "tie"]),
  confidence: z.enum(["low", "med", "high"]),
  reasoning: z.string(),
});
export type PairwiseSubmission = z.infer<typeof PairwiseSubmissionSchema>;

export const PairwiseResultSchema = PairwiseSubmissionSchema.extend({
  outputMode: z.enum(["tool", "text-fallback", "missing"]),
});
export type PairwiseResult = z.infer<typeof PairwiseResultSchema>;

export const RunStatusSchema = z.enum([
  "ok",
  "gate_failed",
  "turn_cap",
  "no_spec",
  "multi_spec",
  "agent_error",
  "persona_error",
  "judge_error",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const TokenUsageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  total: z.number(),
});

export const RunJsonSchema = z.object({
  status: RunStatusSchema,
  startedAt: z.string(),
  endedAt: z.string(),
  turns: z.number().int().nonnegative(),
  terminationReason: z.string(),
  agentModel: ModelRefSchema,
  personaModel: ModelRefSchema,
  scenarioId: z.string(),
  sampleIndex: z.number().int().nonnegative(),
  tokens: TokenUsageSchema.optional(),
  error: z
    .object({
      kind: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
});
export type RunJson = z.infer<typeof RunJsonSchema>;

export const ManifestJsonSchema = z.object({
  runId: z.string(),
  startedAt: z.string(),
  skill: z.string(),
  skillSha: z.string(),
  scenarioSetHash: z.string(),
  samples: z.number().int().positive(),
  scenarios: z.array(
    z.object({
      id: z.string(),
      file: z.string(),
      sha256: z.string(),
    }),
  ),
  models: z.object({
    agent: ModelRefSchema,
    persona: ModelRefSchema,
    judge: ModelRefSchema,
  }),
});
export type ManifestJson = z.infer<typeof ManifestJsonSchema>;

export const SummarySchema = z.object({
  runId: z.string(),
  perScenario: z.record(
    z.string(),
    z.object({
      samples: z.array(
        z.object({
          sampleIndex: z.number(),
          status: RunStatusSchema,
          score: z.number().nullable(),
          gates: RubricGatesSchema.partial(),
          failedGate: GateName.optional(),
        }),
      ),
      meanScore: z.number().nullable(),
      gateFailCount: z.number(),
      statusCounts: z.record(z.string(), z.number()),
      tokens: TokenUsageSchema.optional(),
    }),
  ),
});
export type Summary = z.infer<typeof SummarySchema>;
