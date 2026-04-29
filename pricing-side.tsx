// @ts-nocheck
/** @jsxImportSource @opentui/solid */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import { createMemo, createSignal, Show } from "solid-js";
import type { ModelInfo } from "./tui";

interface PricingSideProps {
  theme: TuiThemeCurrent;
  planModel: string;
  buildModel: string;
  getModelInfo: (model: string) => ModelInfo;
  onRefresh: () => Promise<void>;
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
  theme: TuiThemeCurrent;
  getModelInfo: (model: string) => ModelInfo;
}

function ModelRow(props: ModelRowProps) {
  // createMemo re-evaluates when getModelInfo's internal version signal bumps.
  const info = createMemo(() => props.getModelInfo(props.model));
  const ctx = () => fmtCtx(info().contextLength);
  const unknown = () => info().inputPerM === 0 && info().contextLength === null;

  return (
    <box flexDirection="column" paddingLeft={2}>
      <text fg={props.theme.text} bold>
        {info().displayName}
      </text>
      <Show
        when={!unknown()}
        fallback={
          <text fg={props.theme.textMuted}>{"  "}pricing unavailable</text>
        }
      >
        <text fg={props.theme.textMuted}>
          {"  "}
          {fmtPrice(info().inputPerM)} in / {fmtPrice(info().outputPerM)} out •{" "}
          {ctx()} ctx
        </text>
      </Show>
    </box>
  );
}

interface ModeSectionProps {
  label: string;
  model: string;
  theme: TuiThemeCurrent;
  getModelInfo: (model: string) => ModelInfo;
}

function ModeSection(props: ModeSectionProps) {
  const [open, setOpen] = createSignal(true);
  const triangle = () => (open() ? "▼" : "▶");

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
      <Show when={open() && !!props.model}>
        <ModelRow
          model={props.model}
          theme={props.theme}
          getModelInfo={props.getModelInfo}
        />
      </Show>
      <Show when={open() && !props.model}>
        <text fg={props.theme.textMuted} paddingLeft={2}>
          (not configured)
        </text>
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
        model={props.planModel}
        theme={props.theme}
        getModelInfo={props.getModelInfo}
      />
      <ModeSection
        label="Build"
        model={props.buildModel}
        theme={props.theme}
        getModelInfo={props.getModelInfo}
      />
    </box>
  );
}
