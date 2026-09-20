import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { Plugin } from "@opencode/plugin";
import { configPaths } from "./src/config";

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

// OpenCode uses dashes in version suffixes (e.g. "claude-sonnet-4-5") while
// OpenRouter uses dots ("claude-sonnet-4.5"). Normalise both sides to dots
// before comparing so the two naming conventions resolve to the same entry.
function normaliseName(s: string): string {
  // Replace runs of digits separated by dashes with dot-separated equivalents,
  // e.g. "sonnet-4-5" → "sonnet-4.5", but leave non-numeric segments alone.
  return s.replace(/(\d)-(\d)/g, "$1.$2");
}

export function getModelInfo(model: string): ModelInfo {
  // Exact match first; fall back to model-name suffix match so that a stored
  // id like "anthropic/claude-sonnet-4-5" resolves even when OpenRouter lists
  // the same model as "anthropic/claude-sonnet-4.5".
  const exact = pricingMap.get(model);
  if (exact) return exact;
  const name = normaliseName(
    model.includes("/") ? (model.split("/").at(-1) ?? model) : model,
  );
  for (const [key, info] of pricingMap) {
    if (normaliseName(key.split("/").pop() ?? key) === name) return info;
  }
  return {
    inputPerM: 0,
    outputPerM: 0,
    contextLength: null,
    displayName: model,
    features: [],
  };
}

async function fetchOpenRouterData(): Promise<void> {
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

    // V2 has no client.app.log hook; plain console output lands in the server
    // log, which is where the V1 log call surfaced anyway.
    console.log(
      `[llm-pricing] Fetched data for ${pricingMap.size} models from OpenRouter`,
    );
  } catch (err) {
    console.error(
      `[llm-pricing] OpenRouter fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export default Plugin.define({
  id: "llm-pricing",
  async setup(ctx) {
    await fetchOpenRouterData();

    // Seed history from the agents' configured models — the V2 replacement
    // for the V1 `config` hook, which no longer exists.
    for (const agentID of ["plan", "build"] as const) {
      try {
        const out = await ctx.agent.get({ agentID });
        if (out.data.model?.id) addToHistory(agentID, out.data.model.id);
      } catch {
        // Agent definitions are user-configured; a missing or renamed agent
        // must not block plugin load — the JSON fallback below still runs.
      }
    }

    async function loadInitialModels() {
      const paths = configPaths(homedir(), ctx.location.directory);
      for (const path of paths) {
        try {
          // Direct file reads replace the V1 `$` shell helper, which is gone
          // from the V2 plugin context.
          const content = await readFile(path, "utf8").catch(() => null);
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

    // Tool definitions use JSON Schema input and structured `{ content }`
    // results — the V2 replacement for the V1 tool() helper.
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "fetch-llm-pricing",
        description:
          "Re-fetch fresh LLM pricing, context, and features from OpenRouter.",
        input: { type: "object", properties: {}, additionalProperties: false },
        async execute() {
          await fetchOpenRouterData();
          return {
            content: `✅ Refreshed — ${pricingMap.size} models loaded.`,
          };
        },
      });

      editor.add({
        name: "update-llm-selection",
        description: "Record a model switch for plan or build mode.",
        input: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["plan", "build"],
              description: "Agent mode the switch applies to.",
            },
            model: {
              type: "string",
              description: 'Model slug, e.g. "anthropic/claude-sonnet-4-5".',
            },
          },
          required: ["mode", "model"],
          additionalProperties: false,
        },
        async execute(input) {
          const { mode, model } = input as {
            mode: "plan" | "build";
            model: string;
          };
          addToHistory(mode, model);
          const info = getModelInfo(model);
          const ctxLen = info.contextLength
            ? `${Math.round(info.contextLength / 1000)}K`
            : "N/A";
          return {
            content: `✅ ${mode} → ${info.displayName} (${ctxLen} ctx)`,
          };
        },
      });

      editor.add({
        name: "show-llm-pricing",
        description:
          "Show pricing + context + features for last 3 models per mode.",
        input: { type: "object", properties: {}, additionalProperties: false },
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
              const ctxLen = info.contextLength
                ? `${Math.round(info.contextLength / 1000)}K`
                : "N/A";
              const feat = info.features.length
                ? ` [${info.features.slice(0, 2).join(", ")}]`
                : "";
              out += `${prefix}${info.displayName}: $${info.inputPerM.toFixed(2)} in / $${info.outputPerM.toFixed(2)} out • ${ctxLen} ctx${feat}\n`;
            });
            out += "\n";
          };
          render("Plan", planHistory);
          render("Build", buildHistory);
          return { content: out };
        },
      });
    });
  },
});
