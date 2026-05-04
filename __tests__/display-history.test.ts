/**
 * Tests for the displayHistory reactive fallback logic used in ModeSection.
 *
 * The key behaviour: when real message history is empty, the sidebar must fall
 * back to the configured model (read via an accessor that tracks api.state.config
 * reactively). Once real messages arrive the accessor result is ignored.
 *
 * We test the pure reactive logic isolated from @opentui/solid and the TUI
 * runtime, using solid-js createRoot / createSignal / createMemo directly.
 */

// Import the reactive build directly. Under the "node" condition bun resolves
// solid-js to dist/server.js (non-reactive SSR build); dist/solid.js is the
// real reactive build. Types are mapped to solid-js in __tests__/tsconfig.json.
import { createMemo, createRoot, createSignal } from "solid-js/dist/solid.js";
import { describe, expect, test } from "bun:test";

/**
 * Mirror of the displayHistory memo inside ModeSection.
 * Returns `history` when non-empty; falls back to `[getConfigModel()]`
 * if the accessor returns a non-empty string; otherwise returns `[]`.
 */
function makeDisplayHistory(
  getHistory: () => string[],
  getConfigModel: () => string,
) {
  return createMemo(() => {
    const h = getHistory();
    if (h.length > 0) return h;
    const cfg = getConfigModel();
    return cfg ? [cfg] : [];
  });
}

describe("displayHistory", () => {
  test("returns empty array when both history and config are empty", () => {
    createRoot((dispose: () => void) => {
      const getHistory = () => [];
      const getConfigModel = () => "";
      const display = makeDisplayHistory(getHistory, getConfigModel);
      expect(display()).toEqual([]);
      dispose();
    });
  });

  test("returns config model as single-item list when history is empty and config is set", () => {
    createRoot((dispose: () => void) => {
      const getHistory = () => [];
      const getConfigModel = () => "anthropic/claude-sonnet-4-5";
      const display = makeDisplayHistory(getHistory, getConfigModel);
      expect(display()).toEqual(["anthropic/claude-sonnet-4-5"]);
      dispose();
    });
  });

  test("prefers real history over config model when history is non-empty", () => {
    createRoot((dispose: () => void) => {
      const getHistory = () => ["openai/gpt-4o", "anthropic/claude-3-opus"];
      const getConfigModel = () => "anthropic/claude-sonnet-4-5";
      const display = makeDisplayHistory(getHistory, getConfigModel);
      expect(display()).toEqual(["openai/gpt-4o", "anthropic/claude-3-opus"]);
      dispose();
    });
  });

  test("switches from config fallback to real history when first message arrives", () => {
    createRoot((dispose: () => void) => {
      // Simulate: config is populated, history starts empty, then a message arrives.
      const [history, setHistory] = createSignal<string[]>([]);
      const getConfigModel = () => "anthropic/claude-sonnet-4-5";
      const display = makeDisplayHistory(history, getConfigModel);

      // Before any message: should show config model.
      expect(display()).toEqual(["anthropic/claude-sonnet-4-5"]);

      // First real message arrives.
      setHistory(["openai/gpt-4o"]);
      expect(display()).toEqual(["openai/gpt-4o"]);

      dispose();
    });
  });

  test("config accessor is reactive — updates display when config changes from empty to populated", () => {
    createRoot((dispose: () => void) => {
      // Simulate api.state.config starting as {} (bootstrap not done yet)
      // then being populated when bootstrap completes.
      const [configModel, setConfigModel] = createSignal("");
      const getHistory = () => [];
      const display = makeDisplayHistory(getHistory, configModel);

      // Before bootstrap: empty.
      expect(display()).toEqual([]);

      // Bootstrap completes, config populated.
      setConfigModel("anthropic/claude-sonnet-4-5");
      expect(display()).toEqual(["anthropic/claude-sonnet-4-5"]);

      dispose();
    });
  });

  test("real history takes priority even when config is also populated", () => {
    createRoot((dispose: () => void) => {
      const [history, setHistory] = createSignal<string[]>([]);
      const [configModel, setConfigModel] = createSignal("");
      const display = makeDisplayHistory(history, configModel);

      // Both arrive — config first.
      setConfigModel("anthropic/claude-sonnet-4-5");
      expect(display()).toEqual(["anthropic/claude-sonnet-4-5"]);

      // Then a real message.
      setHistory(["openai/gpt-4o"]);
      expect(display()).toEqual(["openai/gpt-4o"]);

      // Config change is now ignored.
      setConfigModel("google/gemini-pro");
      expect(display()).toEqual(["openai/gpt-4o"]);

      dispose();
    });
  });
});
