import { describe, expect, test } from "bun:test";
import { deriveHistory } from "../src/history";

// V2 SessionMessageAssistant shape: assistant messages carry `type`,
// `agent` (was `mode` in V1) and a `model` ref (was flat providerID/modelID).
function asst(providerID: string, modelID: string, agent: string) {
  return { type: "assistant" as const, agent, model: { providerID, id: modelID } };
}
function user() {
  return { type: "user" as const };
}

describe("deriveHistory", () => {
  test("empty messages → empty history", () => {
    expect(deriveHistory([], "plan")).toEqual([]);
  });

  test("user-only messages → empty history", () => {
    expect(deriveHistory([user(), user()], "plan")).toEqual([]);
  });

  test("single assistant message → one entry", () => {
    const msgs = [user(), asst("anthropic", "claude-3-5-sonnet", "plan")];
    expect(deriveHistory(msgs, "plan")).toEqual(["anthropic/claude-3-5-sonnet"]);
  });

  test("ignores messages from the wrong mode", () => {
    const msgs = [
      asst("anthropic", "claude-3-5-sonnet", "build"),
      asst("openai", "gpt-4o", "plan"),
    ];
    expect(deriveHistory(msgs, "plan")).toEqual(["openai/gpt-4o"]);
    expect(deriveHistory(msgs, "build")).toEqual(["anthropic/claude-3-5-sonnet"]);
  });

  test("deduplicates — same model used twice → appears once", () => {
    const msgs = [
      asst("anthropic", "claude-3-5-sonnet", "plan"),
      asst("anthropic", "claude-3-5-sonnet", "plan"),
    ];
    expect(deriveHistory(msgs, "plan")).toEqual(["anthropic/claude-3-5-sonnet"]);
  });

  test("caps at 3 most-recent unique models", () => {
    const msgs = [
      asst("openai", "gpt-4o-mini", "plan"),   // oldest
      asst("openai", "gpt-4o", "plan"),
      asst("anthropic", "claude-3-5-sonnet", "plan"),
      asst("anthropic", "claude-opus-4", "plan"), // newest
    ];
    // Most-recent first: opus-4, sonnet, gpt-4o (gpt-4o-mini is 4th, excluded)
    expect(deriveHistory(msgs, "plan")).toEqual([
      "anthropic/claude-opus-4",
      "anthropic/claude-3-5-sonnet",
      "openai/gpt-4o",
    ]);
  });

  test("most-recent occurrence wins when deduplicating across 3-cap", () => {
    // Pattern: A, B, C, A — A appears twice; most-recent A should be at front
    // and B should be dropped (A, C, and latest-A counted — only 2 unique if A deduped)
    const msgs = [
      asst("openai", "gpt-4o-mini", "plan"),         // oldest — 4th unique would be here
      asst("anthropic", "claude-3-5-sonnet", "plan"),
      asst("openai", "gpt-4o", "plan"),
      asst("openai", "gpt-4o-mini", "plan"),          // newest, same as oldest → deduped
    ];
    // Newest-first scan: gpt-4o-mini (seen), gpt-4o (new #2), claude-3-5-sonnet (new #3), gpt-4o-mini (already seen)
    expect(deriveHistory(msgs, "plan")).toEqual([
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "anthropic/claude-3-5-sonnet",
    ]);
  });

  test("mixed modes — plan and build derive independently", () => {
    const msgs = [
      asst("anthropic", "claude-3-5-sonnet", "plan"),
      asst("openai", "gpt-4o", "build"),
      asst("anthropic", "claude-opus-4", "plan"),
      asst("openai", "o3", "build"),
    ];
    expect(deriveHistory(msgs, "plan")).toEqual([
      "anthropic/claude-opus-4",
      "anthropic/claude-3-5-sonnet",
    ]);
    expect(deriveHistory(msgs, "build")).toEqual([
      "openai/o3",
      "openai/gpt-4o",
    ]);
  });

  // Regression for the sidebar crash on session launch ("undefined is not an
  // object (evaluating 'e.length')"): the TUI message store returns undefined
  // for a fresh session before its first sync, so deriveHistory must treat a
  // missing list as empty instead of throwing inside the slot render.
  test("undefined messages → empty history", () => {
    expect(deriveHistory(undefined as unknown as [], "plan")).toEqual([]);
  });

  test("null messages → empty history", () => {
    expect(deriveHistory(null as unknown as [], "build")).toEqual([]);
  });
});
