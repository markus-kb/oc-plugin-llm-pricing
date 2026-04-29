// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin } from "@opencode-ai/plugin/tui";
import { createContext, createMemo, createSignal, useContext } from "solid-js";

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

export function PricingProvider(props: { api: Api; children: unknown }) {
  // pricingMap is local to the TUI — fetched independently from OpenRouter.
  // The server plugin also fetches from OpenRouter but runs in a separate process;
  // there is no shared memory between the two, so TUI must own its own copy.
  const pricingMap = new Map<string, ModelInfo>();

  // version is bumped after each OpenRouter fetch so that getModelInfo memos
  // re-evaluate even though pricingMap is mutated in place (not a signal).
  const [version, setVersion] = createSignal(0);

  // planHistory and buildHistory are derived reactively from api.state.config
  // so the sidebar updates automatically when the user switches models in OpenCode.
  // api.state.config is a SolidJS reactive store — reading it inside createMemo
  // registers a dependency and re-runs the memo whenever config changes.
  const planHistory = createMemo(() => {
    const model = props.api.state.config?.agent?.plan?.model;
    return typeof model === "string" && model.trim() ? [model.trim()] : [];
  });

  const buildHistory = createMemo(() => {
    const model = props.api.state.config?.agent?.build?.model;
    return typeof model === "string" && model.trim() ? [model.trim()] : [];
  });

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
      // Bump version so getModelInfo memos re-evaluate with fresh pricing data.
      setVersion((v) => v + 1);
    } catch {
      // Fetch failures are silent — the sidebar will show fallback "$0.00" values.
    }
  };

  // Fetch on mount; runs once when PricingProvider is first rendered.
  refresh();

  // Normalise digit-dash-digit to dot so "claude-sonnet-4-5" (OpenCode style)
  // matches "claude-sonnet-4.5" (OpenRouter style).
  const norm = (s: string) => s.replace(/(\d)-(\d)/g, (_, a, b) => `${a}.${b}`);

  const getModelInfo = (model: string): ModelInfo => {
    // Track version so this re-evaluates inside a createMemo after each fetch.
    version();
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
