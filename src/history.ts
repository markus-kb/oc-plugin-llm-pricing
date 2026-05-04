// Pure history-derivation logic — no Solid or JSX dependencies.
// Extracted here so it can be unit-tested without the TUI runtime.

// Subset of AssistantMessage fields used by deriveHistory.
interface AssistantMsg {
  role: "assistant";
  providerID: string;
  modelID: string;
  mode: string;
}

interface AnyMsg {
  role: string;
}

/**
 * Derive the last 3 unique model slugs ("providerID/modelID") for a given mode
 * from an oldest-first message list.
 *
 * Most-recent first. Skips user messages and messages from other modes.
 * Deduplicates by slug — if a model appears multiple times, the newest
 * occurrence wins (appears at the front).
 */
export function deriveHistory(
  messages: ReadonlyArray<AnyMsg>,
  mode: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  // Iterate newest-first: the store delivers messages oldest-first.
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const am = msg as AssistantMsg;
    if (am.mode !== mode) continue;
    const slug = `${am.providerID}/${am.modelID}`;
    if (seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
    if (result.length === 3) break;
  }
  return result;
}
