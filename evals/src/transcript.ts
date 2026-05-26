import type { AgentSession } from "@earendil-works/pi-coding-agent";

export interface TranscriptEntry {
  ts: number;
  type: string;
  payload: unknown;
}

export function subscribeTranscript(
  session: AgentSession,
  entries: TranscriptEntry[],
): () => void {
  return session.subscribe((event) => {
    const { type, ...rest } = event as { type: string } & Record<string, unknown>;
    entries.push({ ts: Date.now(), type, payload: rest });
  });
}

export function lastAssistantText(session: AgentSession): string {
  const text = session.getLastAssistantText();
  return text ?? "";
}
