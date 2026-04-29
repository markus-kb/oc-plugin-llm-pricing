import type { Plugin, PluginInput, PluginModule } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

interface ModelInfo {
  inputPerM: number;
  outputPerM: number;
  contextLength: number | null;
  displayName: string;
  features: string[];
}

export const pricingMap = new Map<string, ModelInfo>();
export const planHistory: string[] = [];
export const buildHistory: string[] = [];

function addToHistory(mode: "plan" | "build", model: string) {
  const history = mode === "plan" ? planHistory : buildHistory;
  const idx = history.indexOf(model);
  if (idx !== -1) history.splice(idx, 1);
  history.unshift(model);
  if (history.length > 3) history.length = 3;
}

export function getModelInfo(model: string): ModelInfo {
  // Exact match first; fall back to matching on the model-name portion only
  // (strip provider prefix) so e.g. "claude-sonnet-4-5" matches
  // "anthropic/claude-sonnet-4-5" regardless of which provider is used.
  const exact = pricingMap.get(model);
  if (exact) return exact;
  const name = model.includes("/") ? (model.split("/").at(-1) ?? model) : model;
  for (const [key, info] of pricingMap) {
    if (key.split("/").pop() === name) return info;
  }
  return {
    inputPerM: 0,
    outputPerM: 0,
    contextLength: null,
    displayName: model,
    features: [],
  };
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
        message: `OpenRouter fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
  }
}

const server: Plugin = async ({ client, $, directory }) => {
  await fetchOpenRouterData(client);

  async function loadInitialModels() {
    const paths = [
      `${Bun.env.HOME ?? Bun.env.USERPROFILE}/.config/opencode/opencode.json`,
      `${Bun.env.HOME ?? Bun.env.USERPROFILE}/.config/opencode/opencode.jsonc`,
      `${directory}/opencode.json`,
      `${directory}/.opencode/opencode.json`,
    ];
    for (const path of paths) {
      try {
        const content = await $`cat ${path}`.text().catch(() => null);
        if (!content) continue;
        const stripped = content.replace(/\/\/[^\n]*/g, "");
        const config = JSON.parse(stripped);
        if (config.agent?.plan?.model)
          addToHistory("plan", config.agent.plan.model);
        if (config.agent?.build?.model)
          addToHistory("build", config.agent.build.model);
      } catch {}
    }
  }

  await loadInitialModels();
  if (planHistory.length === 0)
    addToHistory("plan", "anthropic/claude-sonnet-4-5");
  if (buildHistory.length === 0)
    addToHistory("build", "anthropic/claude-sonnet-4-5");

  return {
    config: async (cfg) => {
      const c = cfg as {
        agent?: { plan?: { model?: string }; build?: { model?: string } };
      };
      if (c?.agent?.plan?.model) addToHistory("plan", c.agent.plan.model);
      if (c?.agent?.build?.model) addToHistory("build", c.agent.build.model);
    },

    tool: {
      "fetch-llm-pricing": tool({
        description:
          "Re-fetch fresh LLM pricing, context, and features from OpenRouter.",
        args: {},
        async execute() {
          await fetchOpenRouterData(client);
          return `✅ Refreshed — ${pricingMap.size} models loaded.`;
        },
      }),

      "update-llm-selection": tool({
        description: "Record a model switch for plan or build mode.",
        args: {
          mode: tool.schema.enum(["plan", "build"]),
          model: tool.schema.string(),
        },
        async execute(args) {
          addToHistory(args.mode, args.model);
          const info = getModelInfo(args.model);
          const ctx = info.contextLength
            ? `${Math.round(info.contextLength / 1000)}K`
            : "N/A";
          return `✅ ${args.mode} → ${info.displayName} (${ctx} ctx)`;
        },
      }),

      "show-llm-pricing": tool({
        description:
          "Show pricing + context + features for last 3 models per mode.",
        args: {},
        async execute() {
          let out = "📊 **LLM Pricing + Context + Features**\n\n";
          const render = (name: string, history: string[]) => {
            out += `**${name} Mode** (most recent first):\n`;
            if (history.length === 0) {
              out += "  (none)\n";
              return;
            }
            history.forEach((m, i) => {
              const info = getModelInfo(m);
              const prefix = i === 0 ? "→ " : "  ";
              const ctx = info.contextLength
                ? `${Math.round(info.contextLength / 1000)}K`
                : "N/A";
              const feat = info.features.length
                ? ` [${info.features.slice(0, 2).join(", ")}]`
                : "";
              out += `${prefix}${info.displayName}: $${info.inputPerM.toFixed(2)} in / $${info.outputPerM.toFixed(2)} out • ${ctx} ctx${feat}\n`;
            });
            out += "\n";
          };
          render("Plan", planHistory);
          render("Build", buildHistory);
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
