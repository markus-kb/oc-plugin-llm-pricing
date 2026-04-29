// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import { createContext, createSignal, useContext } from "solid-js";

// ModelInfo mirrors the shape in server.ts; kept local to avoid cross-process imports.
export interface ModelInfo {
  inputPerM: number;
  outputPerM: number;
  contextLength: number | null;
  displayName: string;
  features: string[];
}

const FALLBACK_MODEL = "anthropic/claude-sonnet-4-5";

interface PricingContextType {
  planHistory: () => string[];
  buildHistory: () => string[];
  getModelInfo: (model: string) => ModelInfo;
  refresh: () => Promise<void>;
}

export const PricingContext = createContext<PricingContextType>();

export function PricingProvider(props: { children: unknown }) {
  // pricingMap is local to the TUI — fetched independently from OpenRouter.
  // The server plugin also fetches from OpenRouter but runs in a separate process;
  // there is no shared memory between the two, so TUI must own its own copy.
  const pricingMap = new Map<string, ModelInfo>();

  const [planHistory, _setPlanHistory] = createSignal<string[]>([
    FALLBACK_MODEL,
  ]);
  const [buildHistory, _setBuildHistory] = createSignal<string[]>([
    FALLBACK_MODEL,
  ]);
  const [, setVersion] = createSignal(0); // bumped after fetch to trigger re-renders

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
      // Bump version signal so consumers re-derive from getModelInfo.
      setVersion((v) => v + 1);
    } catch {
      // Fetch failures are silent — the sidebar will show fallback "$0.00" values.
    }
  };

  // Fetch on mount; runs once when the PricingProvider is first rendered.
  refresh();

  const getModelInfo = (model: string): ModelInfo =>
    pricingMap.get(model) ?? {
      inputPerM: 0,
      outputPerM: 0,
      contextLength: null,
      displayName: model,
      features: [],
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
