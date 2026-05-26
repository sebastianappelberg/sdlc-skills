import { getModel } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Config, ModelRef, Scenario } from "./schema.js";

export interface ResolvedModelTriple {
  agent: ModelRef;
  persona: ModelRef;
  judge: ModelRef;
}

export function resolveModelTriple(
  config: Config,
  scenario: Scenario,
): ResolvedModelTriple {
  return {
    agent: scenario.agent ?? config.defaults.agent,
    persona: scenario.persona_model ?? config.defaults.persona,
    judge: scenario.judge ?? config.defaults.judge,
  };
}

export interface ResolvedModelInvocation {
  model: ReturnType<typeof getModel>;
  thinkingLevel?: ModelRef["thinkingLevel"];
}

export function applyProviderOptions(
  ref: ModelRef,
  modelRegistry: ModelRegistry,
): ResolvedModelInvocation {
  let model: ReturnType<typeof getModel> | undefined;
  try {
    model = getModel(ref.provider as never, ref.id as never);
  } catch {
    model = undefined;
  }
  if (!model) {
    const fromRegistry = modelRegistry.find(ref.provider, ref.id);
    if (!fromRegistry) {
      throw new Error(
        `Unknown model: ${ref.provider}/${ref.id}. Not a built-in and not registered in models.json.`,
      );
    }
    model = fromRegistry as ReturnType<typeof getModel>;
  }
  return { model, thinkingLevel: ref.thinkingLevel };
}
