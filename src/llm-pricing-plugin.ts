import type { Plugin, PluginInput, PluginModule } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

interface ModelInfo {
  inputPerM: number;
  outputPerM: number;
  contextLength: number | null;
  displayName: string;
  features: string[];
}

const pricingMap = new Map<string, ModelInfo>();

// History per mode (most recent first, max 3)
const planHistory: string[] = [];
const buildHistory: string[] = [];

function addToHistory(mode: "plan" | "build", model: string) {
  const history = mode === "plan" ? planHistory : buildHistory;
  const idx = history.indexOf(model);
  if (idx !== -1) history.splice(idx, 1);
  history.unshift(model);
  if (history.length > 3) history.length = 3;
}

function getModelInfo(model: string): ModelInfo {
  return (
    pricingMap.get(model) ?? {
      inputPerM: 0,
      outputPerM: 0,
      contextLength: null,
      displayName: model,
      features: [],
    }
  );
}

async function fetchOpenRouterData(
  client: PluginInput["client"],
): Promise<void> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = data.data ?? data;

    pricingMap.clear();
    for (const m of models) {
      if (!m.id) continue;

      const inputPerToken = parseFloat(m.pricing?.prompt ?? "0");
      const outputPerToken = parseFloat(m.pricing?.completion ?? "0");
      const ctx = m.context_length ?? m.top_provider?.context_length ?? null;
      // Use clean display name, no provider prefix
      const displayName = m.name ?? m.id.split("/").pop() ?? m.id;
      const features: string[] = Array.isArray(m.supported_parameters)
        ? m.supported_parameters
        : Array.isArray(m.tags)
          ? m.tags
          : [];

      pricingMap.set(m.id, {
        inputPerM: inputPerToken * 1_000_000,
        outputPerM: outputPerToken * 1_000_000,
        contextLength: ctx,
        displayName,
        features: features.slice(0, 6),
      });
    }

    await client.app.log({
      body: {
        service: "llm-pricing-plugin",
        level: "info" as const,
        message: `Fetched data for ${pricingMap.size} models from OpenRouter`,
      },
    });
  } catch (err) {
    await client.app.log({
      body: {
        service: "llm-pricing-plugin",
        level: "error" as const,
        message: `OpenRouter fetch failed: ${err instanceof Error ? err.message : String(err)} (Zen fallback active)`,
      },
    });
  }
}

const server: Plugin = async ({ client, $, directory }) => {
  // Fetch OpenRouter data once at startup
  await fetchOpenRouterData(client);

  // Seed plan/build history from opencode.json (global + project).
  // Kept as a fallback — the config hook provides a cleaner path but
  // may not fire before tools are first called on startup.
  async function loadInitialModels() {
    const paths = [
      `${process.env.HOME ?? process.env.USERPROFILE}/.config/opencode/opencode.json`,
      `${process.env.HOME ?? process.env.USERPROFILE}/.config/opencode/opencode.jsonc`,
      `${directory}/opencode.json`,
      `${directory}/.opencode/opencode.json`,
    ];

    for (const path of paths) {
      try {
        const content = await $`cat ${path}`.text().catch(() => null);
        if (!content) continue;
        // Strip single-line comments before parsing (opencode.jsonc support)
        const stripped = content.replace(/\/\/[^\n]*/g, "");
        const config = JSON.parse(stripped);
        if (config.agent?.plan?.model)
          addToHistory("plan", config.agent.plan.model);
        if (config.agent?.build?.model)
          addToHistory("build", config.agent.build.model);
      } catch {
        // ignore missing or unparseable configs
      }
    }
  }

  await loadInitialModels();

  // Seed defaults if nothing was configured
  if (planHistory.length === 0)
    addToHistory("plan", "anthropic/claude-3-5-sonnet-20241022");
  if (buildHistory.length === 0)
    addToHistory("build", "anthropic/claude-3-5-sonnet-20241022");

  return {
    // config hook fires once after all plugins load with the resolved config.
    // Used to seed history from configured agent models (cleaner than JSON parsing,
    // runs after the manual fallback above so it naturally moves configured models to front).
    config: async (cfg) => {
      // biome-ignore lint/suspicious/noExplicitAny: Config type not fully typed in @opencode-ai/plugin
      const c = cfg as any;
      if (c?.agent?.plan?.model) addToHistory("plan", c.agent.plan.model);
      if (c?.agent?.build?.model) addToHistory("build", c.agent.build.model);
    },

    tool: {
      // Manually re-fetch fresh pricing data from OpenRouter
      "fetch-llm-pricing": tool({
        description:
          "Re-fetch fresh LLM pricing, context window, and feature data from OpenRouter. Use this to refresh stale data without restarting OpenCode.",
        args: {},
        async execute(_args, _ctx) {
          await fetchOpenRouterData(client);
          return `✅ OpenRouter data refreshed — ${pricingMap.size} models loaded.\nUse show-llm-pricing to view current plan/build history.`;
        },
      }),

      // Record a model switch manually
      "update-llm-selection": tool({
        description:
          "Record a newly selected LLM for plan or build mode. Updates history (keeps last 3, most recent first). Use after switching models.",
        args: {
          mode: tool.schema.enum(["plan", "build"]),
          model: tool.schema
            .string()
            .describe("Model ID (e.g. anthropic/claude-3-5-sonnet-20241022)"),
        },
        async execute(args, _ctx) {
          addToHistory(args.mode, args.model);
          const info = getModelInfo(args.model);
          const ctxStr = info.contextLength
            ? `${Math.round(info.contextLength / 1000)}K`
            : "N/A";
          return `✅ ${args.mode} mode updated → ${info.displayName}\n$${info.inputPerM.toFixed(2)} in / $${info.outputPerM.toFixed(2)} out • ${ctxStr} ctx`;
        },
      }),

      // Show full pricing details for both modes
      "show-llm-pricing": tool({
        description:
          "Show pricing, context window, and features for the last 3 LLMs per agent mode. Falls back to 'check OpenCode Zen' for unknown models.",
        args: {},
        async execute(_args, _ctx) {
          let out =
            "📊 **LLM Pricing + Context + Features** (OpenRouter → Zen fallback)\n\n";

          const renderMode = (name: string, history: string[]) => {
            out += `**${name} Mode** (most recent first):\n`;
            if (history.length === 0) {
              out += "  (none)\n";
              return;
            }
            for (const [i, m] of history.entries()) {
              const info = getModelInfo(m);
              const prefix = i === 0 ? "→ " : "  ";
              const ctxStr = info.contextLength
                ? `${Math.round(info.contextLength / 1000)}K`
                : "N/A";
              const feat = info.features.length
                ? ` [${info.features.slice(0, 3).join(", ")}]`
                : "";
              if (info.inputPerM === 0 && info.contextLength === null) {
                out += `${prefix}${info.displayName}: N/A — check OpenCode Zen\n`;
              } else {
                out += `${prefix}${info.displayName}: $${info.inputPerM.toFixed(2)} in / $${info.outputPerM.toFixed(2)} out • ${ctxStr} ctx${feat}\n`;
              }
            }
            out += "\n";
          };

          renderMode("Plan", planHistory);
          renderMode("Build", buildHistory);

          out +=
            "💡 Use `fetch-llm-pricing` to refresh data • `update-llm-selection` after model switches";
          return out;
        },
      }),
    },
  };
};

const plugin: PluginModule & { id: string } = {
  id: "llm-pricing",
  server,
};

export default plugin;
