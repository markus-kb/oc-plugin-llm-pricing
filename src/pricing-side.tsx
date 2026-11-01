// @ts-nocheck
/** @jsxImportSource @opentui/solid */

import { usePlugin } from "@opencode/plugin/tui";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { ModelInfo } from "../tui";
import { formatContextLength } from "./format";
import { deriveHistory } from "./history";

interface AnyMsg {
  type: string;
}

interface PricingSideProps {
  // Reactive accessor — returns all messages for the current session.
  // Called inside createMemo so history re-derives on every message update
  // (including session resume, where messages are already populated).
  getMessages: () => ReadonlyArray<AnyMsg>;
  getModelInfo: (model: string) => ModelInfo;
  onRefresh: () => Promise<void>;
}

function fmtCtx(contextLength: number | null): string {
  return formatContextLength(contextLength);
}

function fmtPrice(perM: number): string {
  return `$${perM.toFixed(2)}`;
}

interface ModelRowProps {
  model: string;
  active: boolean;
  getModelInfo: (model: string) => ModelInfo;
}

function ModelRow(props: ModelRowProps) {
  // Theme tokens come from the plugin context rather than a prop. Theme tokens
  // are nested objects in the current theme schema (text.base, text.muted,
  // text.action.primary.base) — the old flat keys (primary, text, textMuted)
  // no longer exist and crashed the slot render on label color resolution.
  const theme = usePlugin().theme;
  // createMemo re-evaluates when getModelInfo's internal version signal bumps.
  const info = createMemo(() => props.getModelInfo(props.model));
  const ctx = () => fmtCtx(info().contextLength);
  const unknown = () => info().inputPerM === 0 && info().contextLength === null;
  // Active model gets an arrow marker; history entries are indented flush.
  const marker = () => (props.active ? "→" : " ");
  const labelText = theme.text.base;
  const labelActive = theme.text.action.primary.base;

  return (
    <box flexDirection="column" paddingLeft={2}>
      <text fg={props.active ? labelActive : labelText}>
        {marker()} {info().displayName}
      </text>
      <Show
        when={!unknown()}
        fallback={<text fg={theme.text.muted}>{"   "}pricing unavailable</text>}
      >
        <text fg={theme.text.muted}>
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
  getModelInfo: (model: string) => ModelInfo;
}

function ModeSection(props: ModeSectionProps) {
  const theme = usePlugin().theme;
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
        <text fg={theme.text.action.primary.base} bold>
          {triangle()} {props.label}
        </text>
      </box>
      <Show when={open()}>
        <Show
          when={props.getHistory().length > 0}
          fallback={
            <text fg={theme.textMuted} paddingLeft={2}>
              (not configured)
            </text>
          }
        >
          <For each={props.getHistory()}>
            {(model, i) => (
              <ModelRow
                model={model}
                active={i() === 0}
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
  const theme = usePlugin().theme;
  // Derive plan and build history reactively from session messages.
  // Re-evaluates whenever getMessages() updates — covers new messages AND
  // session resume (messages are already in the store when the slot renders).
  const planHistory = createMemo(() =>
    deriveHistory(props.getMessages(), "plan"),
  );
  const buildHistory = createMemo(() =>
    deriveHistory(props.getMessages(), "build"),
  );

  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={theme.text.base} bold>
        {/* v3 marker: proves the running TUI loaded this revision.
            Remove together with the diagnostic stack catch in tui.tsx. */}
        LLM Pricing (v3)
      </text>
      <ModeSection
        label="Plan"
        getHistory={planHistory}
        getModelInfo={props.getModelInfo}
      />
      <ModeSection
        label="Build"
        getHistory={buildHistory}
        getModelInfo={props.getModelInfo}
      />
    </box>
  );
}
