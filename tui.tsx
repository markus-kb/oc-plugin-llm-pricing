// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal } from "solid-js";
import { PricingSide } from "./src/pricing-side";

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

  // History is derived reactively from the current session's messages inside
  // PricingSide. The slot render function receives session_id from sidebar.tsx
  // and passes a getMessages accessor so PricingSide can read the Solid store
  // reactively — covering both new messages and session resume.
  api.slots.register({    order: 60,
    slots: {
      sidebar_content(ctx, props) {
        const sessionId = props?.session_id as string | undefined;
        // getMessages is called inside createMemo in PricingSide, so it
        // re-evaluates reactively whenever the session message store updates.
        const getMessages = () => {
          if (!sessionId) return [];
          return api.state.session.messages(sessionId);
        };
        return (
          <PricingSide
            theme={ctx.theme.current}
            getMessages={getMessages}
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
