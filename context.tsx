// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin } from "@opencode-ai/plugin/tui";
import { createContext, createSignal, useContext } from "solid-js";

type Api = Parameters<TuiPlugin>[0];

// ModelInfo mirrors the shape in server.ts; kept local to avoid cross-process imports.
export interface ModelInfo {
  inputPerM: number;
  outputPerM: number;
  contextLength: number | null;
  displayName: string;
  features: string[];
}

interface PricingContextType {
  planHistory: () => string[];
  buildHistory: () => string[];
  getModelInfo: (model: string) => ModelInfo;
  refresh: () => Promise<void>;
}

export const PricingContext = createContext<PricingContextType>();

function seedHistory(api: Api, mode: "plan" | "build"): string[] {
  // Read the configured model for this mode from the resolved config.
  // api.state.config holds the fully resolved opencode config (same shape as opencode.json).
  try {
    const cfg = api.state.config as Record<string, unknown>;
    const agent = cfg?.agent as Record<string, unknown> | undefined;
    const modeConfig = agent?.[mode] as Record<string, unknown> | undefined;
    const model = modeConfig?.model;
    if (typeof model === "string" && model.trim()) return [model.trim()];
  } catch {
    // Defensive: api.state may not be ready yet — fall back silently.
  }
  return [];
}

export function PricingProvider(props: { api: Api; children: unknown }) {
  // pricingMap is local to the TUI — fetched independently from OpenRouter.
  // The server plugin also fetches from OpenRouter but runs in a separate process;
  // there is no shared memory between the two, so TUI must own its own copy.
  const pricingMap = new Map<string, ModelInfo>();

  const [planHistory, setPlanHistory] = createSignal<string[]>(
    seedHistory(props.api, "plan"),
  );
  const [buildHistory, setBuildHistory] = createSignal<string[]>(
    seedHistory(props.api, "build"),
  );
  const [, setVersion] = createSignal(0); // bumped after fetch to trigger re-renders

  // Listen for model-switch events on the bus and update history.
  // Event shape: { type: "config.set", ... } or similar — use the event bus if available.
  // For now, we also poll config on each render via seedHistory (signals are reactive).

  function parseModels(data: unknown): void {
    const raw = data as { data?: unknown[] } | unknown[];
    const models: unknown[] = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { data?: unknown[] }).data)
        ? (raw as { data: unknown[] }).data
        : [];
    if (!Array.isArray(models)) return;
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

  const refresh = async () => {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      if (!res.ok) return;
      const data = await res.json();
      parseModels(data);
      // Re-seed history from config in case models changed while fetching.
      const plan = seedHistory(props.api, "plan");
      if (plan.length) setPlanHistory(plan);
      const build = seedHistory(props.api, "build");
      if (build.length) setBuildHistory(build);
      // Bump version signal so consumers re-derive from getModelInfo.
      setVersion((v) => v + 1);
    } catch {
      // Fetch failures are silent — the sidebar will show fallback "$0.00" values.
    }
  };

  // Fetch on mount; runs once when the PricingProvider is first rendered.
  refresh();

  const getModelInfo = (model: string): ModelInfo => {
    // Exact match first; fall back to model-name suffix match to handle
    // provider-prefixed slugs (e.g. "openai/claude-sonnet-4-5" still matches
    // "anthropic/claude-sonnet-4-5" in the pricing map).
    const exact = pricingMap.get(model);
    if (exact) return exact;
    const name = model.includes("/")
      ? (model.split("/").at(-1) ?? model)
      : model;
    for (const [key, info] of pricingMap) {
      if (key.split("/").pop() === name) return info;
    }
    return {
      inputPerM: 0,
      outputPerM: 0,
      contextLength: null,
      displayName: model.split("/").pop() ?? model,
      features: [],
    };
  };

  return (
    <PricingContext.Provider
      value={{ planHistory, buildHistory, getModelInfo, refresh }}
    >
      {props.children}
    </PricingContext.Provider>
  );
}

export function usePricing(): PricingContextType {
  const ctx = useContext(PricingContext);
  if (!ctx) throw new Error("usePricing must be called inside PricingProvider");
  return ctx;
}
