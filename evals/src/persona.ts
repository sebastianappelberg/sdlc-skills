import {
  type AgentSession,
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { applyProviderOptions } from "./models.js";
import type { ModelRef, Persona } from "./schema.js";

function personaPrompt(persona: Persona, sampleIndex: number, scenarioId: string): string {
  return `You are role-playing as a user collaborating with an AI coding assistant on a brainstorming/design session.

[sample:${sampleIndex}] [scenario:${scenarioId}]

== Persona ==
Role: ${persona.role}
Intent: ${persona.intent}

Hard constraints (you have these no matter what — share them when asked, do not volunteer them all up-front):
${persona.hard_constraints.map((c) => `  - ${c}`).join("\n") || "  (none)"}

Soft preferences (mention if asked or if relevant):
${persona.soft_preferences.map((c) => `  - ${c}`).join("\n") || "  (none)"}

Knowledge gaps (things you genuinely don't know):
${persona.knowledge_gaps.map((c) => `  - ${c}`).join("\n") || "  (none)"}

== Rules ==
1. You are the USER, not the assistant. The "user" messages you receive in this session are actually from an assistant talking to YOU; respond as the persona.
2. Never break character. Do not comment on the meta-task, the rubric, or that this is a simulation.
3. If the assistant presents a design and asks for approval, approve it if it matches your intent; push back if it doesn't.
4. If you don't know an answer, say "I don't know" rather than guessing.
5. Output only your next reply as the persona — no prefixes, no quotes, no role labels.
6. Keep replies natural and concise. Real users do not write essays.
7. When the assistant writes a spec file and asks you to review it, respond with "approved" if it captures your intent; otherwise ask for specific changes.`;
}

export class PersonaSimulator {
  private session: AgentSession;
  private disposed = false;

  private constructor(session: AgentSession) {
    this.session = session;
  }

  static async create(opts: {
    persona: Persona;
    scenarioId: string;
    sampleIndex: number;
    model: ModelRef;
    authStorage: AuthStorage;
    modelRegistry: ModelRegistry;
  }): Promise<PersonaSimulator> {
    const { model, thinkingLevel } = applyProviderOptions(opts.model, opts.modelRegistry);
    const prompt = personaPrompt(opts.persona, opts.sampleIndex, opts.scenarioId);
    const loader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: getAgentDir(),
      noSkills: true,
      noPromptTemplates: true,
      noContextFiles: true,
      noExtensions: true,
      systemPromptOverride: () => prompt,
    });
    await loader.reload();
    const { session } = await createAgentSession({
      cwd: process.cwd(),
      authStorage: opts.authStorage,
      modelRegistry: opts.modelRegistry,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(),
      noTools: "all",
      model,
      thinkingLevel,
    });
    return new PersonaSimulator(session);
  }

  async next(args: { agentMessage: string }): Promise<string> {
    if (this.disposed) throw new Error("PersonaSimulator already disposed");
    const trimmed = args.agentMessage.trim();
    const input = trimmed.length > 0 ? trimmed : "(the assistant sent no text — please continue.)";
    await this.session.prompt(input);
    const reply = this.session.getLastAssistantText();
    return (reply ?? "").trim();
  }

  close(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.session.dispose();
    } catch {
      // ignore
    }
  }
}
