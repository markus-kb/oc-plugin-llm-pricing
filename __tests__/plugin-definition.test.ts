import { describe, expect, test } from "bun:test";
import plugin from "../server";

// Regression for err_d28039f6: OpenCode V2 rejects the V1 module shape
// ({ id, server }). The default export must be a V2 Plugin definition with an
// id and a setup function, otherwise the loader fails at startup.
describe("plugin definition", () => {
  test("default export has an id and a setup function", () => {
    expect(plugin.id).toBe("llm-pricing");
    expect(typeof (plugin as { setup?: unknown }).setup).toBe("function");
  });

  test("does not use the V1 'server' module shape", () => {
    expect((plugin as { server?: unknown }).server).toBeUndefined();
  });
});
