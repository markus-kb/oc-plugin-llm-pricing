import { afterEach, describe, expect, test } from "bun:test";
import { fetchOpenRouterData, pricingMap } from "../server";

// Regression for the OpenCode 2.2 plugin contract: Promise tool executors
// receive context.signal, and "Pass it to cancellable work such as fetch so
// stopping the Session also stops the underlying operation" (plugins/server
// guide). The fetch tool must therefore accept and forward the signal.
describe("fetchOpenRouterData", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("forwards an AbortSignal to the OpenRouter request", async () => {
    let captured: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      captured = init;
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "test/test-model",
              name: "Test Model",
              pricing: { prompt: "0.000002", completion: "0.000004" },
              context_length: 128_000,
              supported_parameters: ["tools"],
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const controller = new AbortController();
    await fetchOpenRouterData(controller.signal);

    expect(captured?.signal).toBe(controller.signal);
    expect(pricingMap.has("test/test-model")).toBe(true);
  });
});
