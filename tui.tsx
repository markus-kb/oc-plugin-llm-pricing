// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal } from "solid-js";
import { PricingSide } from "./pricing-side";

const id = "llm-pricing";

// ModelInfo mirrors the shape in server.ts; kept local to avoid cross-process imports.
export interface ModelInfo {
  inputPerM: number;
  outputPerM: number;
  contextLength: number | null;
  displayName: string;
  features: string[];
}

// Normalise digit-dash-digit to dot: "claude-sonnet-4-5" → "claude-sonnet-4.5"
const norm = (s: string) => s.replace(/(\d)-(\d)/g, (_, a, b) => `${a}.${b}`);

function parseModels(data: unknown, pricingMap: Map<string, ModelInfo>): void {
  const raw = data as { data?: unknown[] } | unknown[];
  const models: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown[] }).data)
      ? (raw as { data: unknown[] }).data
      : [];
  pricingMap.clear();
  for (const item of models) {
    const m = item as Record<string, unknown> & {
      id?: string;
      name?: string;
      pricing?: { prompt?: string; completion?: string };
      context_length?: number;
      top_provider?: { context_length?: number };
      supported_parameters?: string[];
      tags?: string[];
    };
    if (!m.id) continue;
    const inputPerM = parseFloat(m.pricing?.prompt ?? "0") * 1_000_000;
    const outputPerM = parseFloat(m.pricing?.completion ?? "0") * 1_000_000;
    const contextLength =
      m.context_length ?? m.top_provider?.context_length ?? null;
    const displayName = m.name ?? m.id.split("/").pop() ?? m.id;
    const features: string[] = Array.isArray(m.supported_parameters)
      ? m.supported_parameters.slice(0, 6)
      : Array.isArray(m.tags)
        ? m.tags.slice(0, 6)
        : [];
    pricingMap.set(m.id, {
      inputPerM,
      outputPerM,
      contextLength,
      displayName,
      features,
    });
  }
}

const tui: TuiPlugin = async (api) => {
  // pricingMap lives in the plugin factory — created once, shared across all slot renders.
  const pricingMap = new Map<string, ModelInfo>();

  // version is bumped after each OpenRouter fetch so getModelInfo re-evaluates.
  const [version, setVersion] = createSignal(0);

  const refresh = async () => {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      if (!res.ok) return;
      const data = await res.json();
      parseModels(data, pricingMap);
      setVersion((v) => v + 1);
    } catch {
      // Fetch failures are silent — sidebar shows fallback "$0.00" values.
    }
  };

  // Fetch once at startup.
  await refresh();

  // Seed history from config defaults; grows to max 3 via message.updated events.
  const seedPlan = api.state.config?.agent?.plan?.model ?? "";
  const seedBuild = api.state.config?.agent?.build?.model ?? "";
  const [planHistory, setPlanHistory] = createSignal<string[]>(
    seedPlan ? [seedPlan] : [],
  );
  const [buildHistory, setBuildHistory] = createSignal<string[]>(
    seedBuild ? [seedBuild] : [],
  );

  // Push model to front of history, deduplicate, cap at 3.
  function pushHistory(
    set: (fn: (prev: string[]) => string[]) => void,
    model: string,
  ) {
    set((prev) => {
      const deduped = prev.filter((m) => m !== model);
      return [model, ...deduped].slice(0, 3);
    });
  }

  // Each AssistantMessage carries the model actually used for that turn.
  // Update history so the sidebar always reflects the last 3 active models.
  api.event.on("message.updated", (event) => {
    const msg = event.properties.info;
    if (msg.role !== "assistant") return;
    const model = `${msg.providerID}/${msg.modelID}`;
    if (msg.mode === "build") pushHistory(setBuildHistory, model);
    else pushHistory(setPlanHistory, model);
  });

  const getModelInfo = (model: string): ModelInfo => {
    // Reading version() registers a reactive dependency so callers inside
    // createMemo re-evaluate after each OpenRouter fetch.
    version();
    if (!model) {
      return {
        inputPerM: 0,
        outputPerM: 0,
        contextLength: null,
        displayName: "—",
        features: [],
      };
    }
    const exact = pricingMap.get(model);
    if (exact) return exact;
    const name = norm(
      model.includes("/") ? (model.split("/").at(-1) ?? model) : model,
    );
    for (const [key, info] of pricingMap) {
      if (norm(key.split("/").pop() ?? key) === name) return info;
    }
    return {
      inputPerM: 0,
      outputPerM: 0,
      contextLength: null,
      displayName: model.split("/").pop() ?? model,
      features: [],
    };
  };

  api.slots.register({
    order: 60,
    slots: {
      sidebar_content(ctx) {
        return (
          <PricingSide
            theme={ctx.theme.current}
            planHistory={planHistory()}
            buildHistory={buildHistory()}
            getModelInfo={getModelInfo}
            onRefresh={refresh}
          />
        );
      },
    },
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
};

export default plugin;
