// @ts-nocheck
/** @jsxImportSource @opentui/solid */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import { For } from "solid-js";
import { usePricing } from "./context";

interface PricingSideProps {
  theme: TuiThemeCurrent;
  sessionId: string;
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
  isActive: boolean;
  theme: TuiThemeCurrent;
}

function ModelRow(props: ModelRowProps) {
  const { getModelInfo } = usePricing();
  const info = getModelInfo(props.model);
  const prefix = props.isActive ? "→ " : "  ";
  const ctx = fmtCtx(info.contextLength);
  const color = props.isActive ? props.theme.text : props.theme.textMuted;

  return (
    <box flexDirection="column" paddingLeft={1}>
      <text fg={color} bold={props.isActive}>
        {prefix}
        {info.displayName}
      </text>
      <text fg={props.theme.textMuted}>
        {"   "}
        {fmtPrice(info.inputPerM)} in / {fmtPrice(info.outputPerM)} out • {ctx}{" "}
        ctx
      </text>
    </box>
  );
}

interface ModeSectionProps {
  label: string;
  history: string[];
  theme: TuiThemeCurrent;
}

function ModeSection(props: ModeSectionProps) {
  return (
    <box flexDirection="column" marginBottom={1}>
      <text fg={props.theme.primary} bold paddingLeft={1}>
        {props.label}
      </text>
      <For each={props.history}>
        {(model, i) => (
          <ModelRow model={model} isActive={i() === 0} theme={props.theme} />
        )}
      </For>
    </box>
  );
}

export function PricingSide(props: PricingSideProps) {
  const { planHistory, buildHistory } = usePricing();

  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={props.theme.text} bold paddingLeft={1} marginBottom={1}>
        LLM Pricing
      </text>
      <ModeSection label="Plan" history={planHistory()} theme={props.theme} />
      <ModeSection label="Build" history={buildHistory()} theme={props.theme} />
    </box>
  );
}
