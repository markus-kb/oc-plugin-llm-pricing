// Pure history-derivation logic — no Solid or JSX dependencies.
// Extracted here so it can be unit-tested without the TUI runtime.

// V2 SessionMessageAssistant subset used by deriveHistory. V1 used
// role/mode/providerID/modelID; V2 renamed them to type/agent/model ref.
interface AssistantMsg {
  type: "assistant";
  agent: string;
  model: { providerID: string; id: string };
}

interface AnyMsg {
  type: string;
}

/**
 * Derive the last 3 unique model slugs ("providerID/modelID") for a given
 * agent mode from an oldest-first message list.
 *
 * Most-recent first. Skips non-assistant messages and messages from other
 * agent modes. Deduplicates by slug — if a model appears multiple times, the
 * newest occurrence wins (appears at the front).
 */
export function deriveHistory(
  messages: ReadonlyArray<AnyMsg> | undefined | null,
  agent: string,
): string[] {
  // The TUI message store returns undefined for a fresh session before its
  // first sync; treat a missing list as "no history" instead of throwing in
  // the sidebar slot render.
  if (!messages) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  // Iterate newest-first: the store delivers messages oldest-first.
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== "assistant") continue;
    const am = msg as AssistantMsg;
    if (am.agent !== agent) continue;
    const slug = `${am.model.providerID}/${am.model.id}`;
    if (seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
    if (result.length === 3) break;
  }
  return result;
}
