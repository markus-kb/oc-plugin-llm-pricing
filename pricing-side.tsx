// @ts-nocheck
/** @jsxImportSource @opentui/solid */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { ModelInfo } from "./tui";

interface PricingSideProps {
  theme: TuiThemeCurrent;
  planHistory: () => string[];
  buildHistory: () => string[];
  getModelInfo: (model: string) => ModelInfo;
  onRefresh: () => Promise<void>;
  // Accessor functions read api.state.config reactively inside createMemo.
  // Used as fallback when history is empty (before any messages are sent).
  getPlanConfig: () => string;
  getBuildConfig: () => string;
}

function fmtCtx(contextLength: number | null): string {
  if (!contextLength) return "N/A";
  return `${Math.round(contextLength / 1000)}K`;
}

function fmtPrice(perM: number): string {
  return `$${perM.toFixed(2)}`;
}

interface ModelRowProps {
  model: string;
  active: boolean;
  theme: TuiThemeCurrent;
  getModelInfo: (model: string) => ModelInfo;
}

function ModelRow(props: ModelRowProps) {
  // createMemo re-evaluates when getModelInfo's internal version signal bumps.
  const info = createMemo(() => props.getModelInfo(props.model));
  const ctx = () => fmtCtx(info().contextLength);
  const unknown = () => info().inputPerM === 0 && info().contextLength === null;
  // Active model gets an arrow marker; history entries are indented flush.
  const marker = () => (props.active ? "→" : " ");

  return (
    <box flexDirection="column" paddingLeft={2}>
      <text fg={props.active ? props.theme.primary : props.theme.text}>
        {marker()} {info().displayName}
      </text>
      <Show
        when={!unknown()}
        fallback={
          <text fg={props.theme.textMuted}>{"   "}pricing unavailable</text>
        }
      >
        <text fg={props.theme.textMuted}>
          {"   "}
          {fmtPrice(info().inputPerM)} in / {fmtPrice(info().outputPerM)} out •{" "}
          {ctx()} ctx
        </text>
      </Show>
    </box>
  );
}

interface ModeSectionProps {
  label: string;
  // Signal accessor — most-recent first; index 0 is the active model.
  getHistory: () => string[];
  // Reads api.state.config reactively — returns the configured model slug or "".
  // Used as fallback when history is empty and config hasn't seeded yet.
  getConfigModel: () => string;
  theme: TuiThemeCurrent;
  getModelInfo: (model: string) => ModelInfo;
}

function ModeSection(props: ModeSectionProps) {
  const [open, setOpen] = createSignal(true);
  const triangle = () => (open() ? "▼" : "▶");

  // Reactively derive the display list: prefer real history, fall back to the
  // configured model once api.state.config is populated (after bootstrap).
  const displayHistory = createMemo(() => {
    const h = props.getHistory();
    if (h.length > 0) return h;
    const cfg = props.getConfigModel();
    return cfg ? [cfg] : [];
  });

  return (
    <box flexDirection="column" marginBottom={1}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: TUI element, not a web DOM node */}
      <box
        flexDirection="row"
        paddingLeft={1}
        // onMouseDown is the correct TUI event — onClick does not fire in @opentui/solid.
        onMouseDown={() => setOpen((v) => !v)}
      >
        <text fg={props.theme.primary} bold>
          {triangle()} {props.label}
        </text>
      </box>
      <Show when={open()}>
        <Show
          when={displayHistory().length > 0}
          fallback={
            <text fg={props.theme.textMuted} paddingLeft={2}>
              (not configured)
            </text>
          }
        >
          <For each={displayHistory()}>
            {(model, i) => (
              <ModelRow
                model={model}
                active={i() === 0}
                theme={props.theme}
                getModelInfo={props.getModelInfo}
              />
            )}
          </For>
        </Show>
      </Show>
    </box>
  );
}

export function PricingSide(props: PricingSideProps) {
  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={props.theme.text} bold paddingLeft={1} marginBottom={1}>
        LLM Pricing
      </text>
      <ModeSection
        label="Plan"
        getHistory={props.planHistory}
        getConfigModel={props.getPlanConfig}
        theme={props.theme}
        getModelInfo={props.getModelInfo}
      />
      <ModeSection
        label="Build"
        getHistory={props.buildHistory}
        getConfigModel={props.getBuildConfig}
        theme={props.theme}
        getModelInfo={props.getModelInfo}
      />
    </box>
  );
}
