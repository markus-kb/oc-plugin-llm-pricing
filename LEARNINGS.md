# OpenCode Plugin Development — Core Learnings

Lessons learned building `oc-plugin-llm-pricing`. Errors to not repeat, and their fixes.

---

## 1. Plugin module shape

**Error:** Exporting a plain async function or a named export instead of a default object.

**Fix:** The plugin entry must export a default object matching `PluginModule & { id: string }`:

```ts
import type { Plugin, PluginModule } from "@opencode-ai/plugin";

const server: Plugin = async ({ client, $, directory }) => {
  return { /* hooks */ };
};

const plugin: PluginModule & { id: string } = {
  id: "my-plugin",
  server,
};

export default plugin;
```

For TUI plugins, substitute `TuiPlugin` / `TuiPluginModule` from `@opencode-ai/plugin/tui`.

---

## 2. `@opencode-ai/plugin` dependency placement

**Error:** Adding `@opencode-ai/plugin` to root `dependencies`. This causes a duplicate-module type conflict because `@opencode-ai/plugin` bundles its own copy internally.

**Fix:**
- Root `package.json`: list under `peerDependencies` only (for type-checking awareness)
- `.opencode/package.json`: list under `dependencies` with a pinned version — this is the copy OpenCode actually resolves at runtime
- Root `devDependencies`: do not add it

---

## 3. Do not import `@opencode-ai/sdk` directly

**Error:** Importing `createOpencodeClient` or types from `@opencode-ai/sdk` as a devDependency.

**Fix:** Type `client` as `PluginInput["client"]`. Adding `@opencode-ai/sdk` separately causes a duplicate-type conflict with the copy bundled inside `@opencode-ai/plugin`.

---

## 4. Local dev config format

**Error:** `.opencode/opencode.json` had the wrong plugin array format:
```json
{ "plugin": ["../"] }   // wrong — treated as a string, not a path entry
```

**Fix:** The correct format is a nested array with an options object:
```json
{ "plugin": [["../", { "enabled": true }]] }
```
Or simply:
```json
{ "plugin": ["../"] }
```
Both are valid — but the key mistake was using `opencode.jsonc` (not recognised) instead of `opencode.json`.

---

## 5. TUI and server plugins run in separate processes

**Error:** Assuming the TUI plugin can read state from the server plugin (e.g. sharing `pricingMap`, `planHistory`).

**Fix:** There is no shared memory. Each process must manage its own state independently. The TUI plugin must fetch OpenRouter data itself on startup.

---

## 6. `api.state.config` is a static snapshot, not a reactive store

**Error:** Treating `api.state.config` as reactive and trying to subscribe to config changes.

**Fix:** Read it once at startup. There is no `EventConfigUpdated` or equivalent in the SDK event union. If you need reactivity, store the value in a SolidJS `createSignal` and update it via other mechanisms (e.g. `message.updated` events).

---

## 7. No pre-prompt model-selection event exists

**Error:** Expecting to detect when a user selects a model from the model picker dialog before sending a prompt.

**Fix:** Not possible. The model picker stores its selection in an internal TUI SolidJS context (`local.tsx`) that is inaccessible to plugin code. No event is emitted. The earliest you can observe the active model is after the first `AssistantMessage` completes — via `message.updated`.

---

## 8. `message.updated` is the correct hook for tracking active model

The `AssistantMessage` type carries `providerID`, `modelID`, and `mode` (`"plan"` or `"build"`). Listen via:

```ts
api.event.on("message.updated", (event) => {
  const msg = event.properties.info;
  if (msg.role !== "assistant") return;
  const model = `${msg.providerID}/${msg.modelID}`;
  // use msg.mode to route to plan or build history
});
```

---

## 9. TUI event bus API

**Error:** Calling `api.event(handler)` as if it were a direct function.

**Fix:** `api.event` is a `TuiEventBus` with an `on` method:

```ts
api.event.on("message.updated", (event) => { ... });
```

---

## 10. `onClick` does not fire in `@opentui/solid`

**Error:** Using `onClick` on a `<box>` element expecting a mouse click handler.

**Fix:** Use `onMouseDown`. This is what every built-in OpenCode sidebar component uses (`todo.tsx`, `mcp.tsx`, `lsp.tsx`, `files.tsx`). `onClick` is silently ignored.

```tsx
<box onMouseDown={() => setOpen((v) => !v)}>
```

---

## 11. Hoist plugin logic outside slot registration

**Error:** Creating a `PricingProvider` context component and mounting it inside the `sidebar_content` slot function. The slot function is called on every render, so the provider — and all state inside it — was re-mounting constantly.

**Fix:** All shared state (fetch results, signals, derived values) must live in the TUI plugin factory closure, which runs once at startup. Pass data down as props to the slot component:

```ts
const tui: TuiPlugin = async (api) => {
  // All state created here — once.
  const pricingMap = new Map();
  const [version, setVersion] = createSignal(0);

  api.slots.register({
    slots: {
      sidebar_content(ctx) {
        // Props passed down — no context provider needed.
        return <PricingSide getModelInfo={getModelInfo} />;
      },
    },
  });
};
```

---

## 12. OpenRouter vs OpenCode model slug normalisation

**Error:** Exact slug lookup failing silently because OpenCode uses dashes in version suffixes (`claude-sonnet-4-5`) while OpenRouter uses dots (`claude-sonnet-4.5`).

**Fix:** Normalise both sides before comparing:

```ts
const norm = (s: string) => s.replace(/(\d)-(\d)/g, "$1.$2");
```

Apply to both the stored model string and the OpenRouter key when doing a suffix fallback lookup.

---

## 13. `version()` signal trick for reactive map lookups

SolidJS reactivity does not track mutations to a `Map`. To make `createMemo`-wrapped lookups re-evaluate after a fetch:

```ts
const [version, setVersion] = createSignal(0);

// In refresh():
pricingMap.clear();
// ... populate map ...
setVersion((v) => v + 1);  // triggers reactive re-evaluation

// In getModelInfo():
version();  // read the signal — registers dependency
return pricingMap.get(model);
```

---

## 14. `// @ts-nocheck` is necessary on TUI files

`@opentui/solid` and `solid-js` are resolved from OpenCode's own bundle at runtime, not from the plugin's `node_modules`. TypeScript cannot resolve them at typecheck time. Add `// @ts-nocheck` to all `.tsx` files that import from these packages.

---

## 15. Avoid `context.tsx` / `createContext` for plugin state

**Error:** Using SolidJS context (`createContext` / `useContext`) to share state between the plugin factory and slot components.

**Fix:** Capture `api` and all derived state in the factory closure. Pass everything as props. This is simpler, avoids mounting issues, and matches the pattern used by vault-tec and other reference plugins.

---

## 17. Global install requires entries in both `opencode.json` and `tui.json`

**Error:** Adding the plugin path only to `~/.config/opencode/opencode.json` (or `opencode.jsonc`). The server plugin loads, but the TUI sidebar never appears.

**Fix:** A plugin with both `./server` and `./tui` entrypoints must be registered in **two separate config files**:

- `~/.config/opencode/opencode.json` — loads the server plugin (chat tools, hooks)
- `~/.config/opencode/tui.json` — loads the TUI plugin (sidebar)

Both files need the same plugin entry:

```jsonc
// opencode.json  AND  tui.json
{
  "plugin": [
    ["{env:OC_PLUGIN_LLP}", { "enabled": true }]
  ]
}
```

OpenCode splits server and TUI loading across these two files. A reference in only one of them silently loads only that half of the plugin — no error is shown.

---

## 18. Use `{env:VAR}` for cross-machine plugin paths

**Error:** Hard-coding an absolute path in a shared config file, which breaks on any machine where the plugin is cloned to a different location.

**Fix:** OpenCode supports `{env:VAR}` substitution in config files before JSON parsing. Set an environment variable on each machine pointing to the local clone:

**Windows** — System Environment Variable (use forward slashes — backslashes are invalid in JSON and cause a parse error when the variable is substituted):
```
OC_PLUGIN_LLP = C:/path/to/oc-plugin-llm-pricing
```

**Linux / macOS** — `~/.bashrc` or `~/.profile`:
```bash
export OC_PLUGIN_LLP="/home/user/plugins/oc-plugin-llm-pricing"
```

Then reference it in config:
```jsonc
["{env:OC_PLUGIN_LLP}", { "enabled": true }]
```

The config file is identical on all machines; only the env var differs per machine.

---

## 16. Hook keys — what exists and what doesn't

Valid return keys from the server `Plugin` function:
- `event`, `config`, `tool`
- `chat.message`, `chat.params`, `chat.headers`
- `permission.ask`
- `command.execute.before`
- `tool.execute.before`, `tool.execute.after`, `tool.definition`
- `shell.env`
- `experimental.*` (various)

**Does not exist:** `sidebar`, `session.created`, `session.updated` as direct hook keys.
Session lifecycle events are received via the `event` hook: `if (event.type === "session.created") { ... }`
