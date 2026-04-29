# AGENTS.md

## Repo structure
Single-file OpenCode plugin. No build step, no test suite, no CI.
Key files: `server.ts`, `package.json`, `tsconfig.json`, `biome.json`.

The plugin entry point is `server.ts` at the repo root (not inside `src/`).

## Installation (local development)
OpenCode loads the plugin via the `plugin` array in `.opencode/opencode.json`.
The `.opencode/` directory at repo root contains:
- `opencode.json` — references this repo as a plugin via relative path `"../"`
- `package.json` — pins `@opencode-ai/plugin` so OpenCode can resolve it at load time

Run OpenCode from **inside this repo directory** to pick up `.opencode/opencode.json`.
No file copying required.

```
cd /path/to/oc-plugin-llm-pricing
opencode
```

## `@opencode-ai/plugin` dependency
- Root `package.json`: listed under `peerDependencies` (for type-checking awareness only)
- `.opencode/package.json`: listed under `dependencies` with a pinned version — **this is the copy OpenCode actually resolves at runtime**
- Root `devDependencies`: not listed (peer resolution handles it)

Do not add it to root `dependencies` — that causes a duplicate-module type conflict with the copy bundled inside `@opencode-ai/plugin` itself.

## Plugin module shape
`server.ts` must export a default object matching `PluginModule & { id: string }`:

```ts
import type { Plugin, PluginInput, PluginModule } from "@opencode-ai/plugin";

const server: Plugin = async ({ client, $, directory }) => {
  return { /* hooks */ };
};

const plugin: PluginModule & { id: string } = {
  id: "llm-pricing",
  server,
};

export default plugin;
```

The `./server` exports map entry in `package.json` points OpenCode to this file:
```json
"exports": {
  "./server": { "import": "./server.ts" }
}
```

## Plugin API (hooks return object)
```ts
return {
  config: async (cfg: any) => void,               // fires once at startup with resolved config
  tool: Record<string, tool({ description, args, execute })>
}
```
Tool schema builder is `tool.schema.enum([...])` / `tool.schema.string()` — not raw Zod.

Valid hook keys (from `@opencode-ai/plugin` Hooks interface):
- `event` — receives all bus events; filter by `event.type`
- `config` — fires once at startup with the resolved config object
- `tool` — register custom tools
- `chat.message`, `chat.params`, `chat.headers`
- `permission.ask`
- `command.execute.before`
- `tool.execute.before`, `tool.execute.after`, `tool.definition`
- `shell.env`
- `experimental.chat.messages.transform`, `experimental.chat.system.transform`
- `experimental.session.compacting`, `experimental.compaction.autocontinue`
- `experimental.text.complete`

There is NO `sidebar` key, NO `session.created` key, NO `session.updated` key.
Session events are received via the `event` hook: `if (event.type === "session.created") { ... }`

## Typing the `client` parameter
Type `client` as `PluginInput["client"]` — do **not** import `createOpencodeClient` from
`@opencode-ai/sdk`. Adding `@opencode-ai/sdk` as a devDep causes a duplicate-type conflict
because `@opencode-ai/plugin` bundles its own copy in its `node_modules/`.

## Shell executor `$`
The `$` parameter is the OpenCode runtime shell helper (tagged-template, same syntax as Bun's `$`). It is not `execa` or any npm package.

## State model
`pricingMap`, `planHistory`, `buildHistory` are module-level variables — in-memory only. State resets on every OpenCode restart. This is intentional.

## Config reading
On load, the plugin reads `agent.plan.model` / `agent.build.model` via two mechanisms (both run):
1. Manual JSON parsing fallback — reads from these paths in order:
   - `~/.config/opencode/opencode.json`
   - `~/.config/opencode/opencode.jsonc`
   - `{project}/opencode.json`
   - `{project}/.opencode/opencode.json`
2. `config` hook — fires after manual fallback with the fully resolved config object; moves configured models to front of history.

## OpenRouter fetch timing
- Fetched once at startup (plugin factory body)
- Re-fetched on demand via `fetch-llm-pricing` tool
- No periodic refresh; no fetch on session events

## Pricing logic
- Unknown model condition: `inputPerM === 0 && contextLength === null` → shows Zen fallback message
- History: max 3 entries per mode, most-recent first; duplicate entries are moved to front

## Workflow
- **TDD (Red → Green → Refactor)**: write a failing test first, then minimal code to pass, then refactor. No production changes without a test.
- **Atomic commits**: one logical change per commit. Do not bundle unrelated changes.

## Dev commands
```
npm install          # install devDependencies for local type-checking
npm run typecheck    # tsc --noEmit
npm run lint         # biome lint
npm run check        # biome check (lint + format)
npm run check:write  # auto-fix lint + format issues
```
No build step — OpenCode runs the `.ts` source directly.

## Manual testing
1. `cd` into this repo directory
2. Run `opencode` — it picks up `.opencode/opencode.json` automatically
3. Verify the three tools appear in chat: `show-llm-pricing`, `fetch-llm-pricing`, `update-llm-selection`
