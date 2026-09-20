# AGENTS.md

## Repo structure
Single-repo OpenCode plugin (server + TUI). No build step, runs as TypeScript source.
Key files: `server.ts` (server plugin), `tui.tsx` (TUI/CLI plugin), `src/` helpers, `package.json`, `tsconfig.json`, `biome.json`.

Targets **OpenCode V2** (`opencode >= 2.0.0`; plugin API from `@opencode/plugin`, NOT the legacy `@opencode-ai/plugin` V1 package).

## Plugin module shape (V2)

V2 requires a default export of `{ id, setup(ctx) }` (or an Effect). The V1 shape
(`PluginModule & { id, server }`) is rejected at load with:
"Plugin must export a default definition with an id and an effect or setup function" (ref err_d28039f6).

```ts
import { Plugin } from "@opencode/plugin";

export default Plugin.define({
  id: "llm-pricing",
  async setup(ctx) { /* transforms, tools, subscriptions */ },
});
```

- Server plugin: `server.ts` → default-exports `Plugin.define`, registers tools via `ctx.tool.transform`
- TUI plugin: `tui.tsx` → `Plugin.define` from `@opencode/plugin/tui`, registers the sidebar via
  `context.ui.slot({ append: "sidebar.content", render })`; return the unregister fn as cleanup
- Both use the same id `llm-pricing` (separate runtimes, matching previous behavior)

### V1 → V2 notes (keep these in mind when touching the code)
- V1 returned a `tool` map built with `tool()`; V2 tools are `editor.add({ name, description, input: JSON Schema, execute })`
  in a **synchronous** `ctx.tool.transform` callback. Execs return `{ content }`, not plain strings.
- V1 `config` hook → read agents via `ctx.agent.get({ agentID })` in setup (`out.data.model?.id`), plus a manual JSON fallback.
- V1 `$` shell helper → `node:fs/promises` (no `$` in V2).
- V1 `client.app.log` → `console.log`/`console.error` (lands in the server log).
- V2 assistant messages: `{ type: "assistant", agent, model: { providerID, id } }` — was `{ role, mode, providerID, modelID }`.
- Slot API has no `order` option; claim order controls placement.
- `directory` → `ctx.location.directory`.

## Installation (local development)
OpenCode loads the plugin via the `plugins` array in `.opencode/opencode.json`
(this repo is referenced by the relative path `"../"`).
`.opencode/package.json` pins `@opencode/plugin` exactly — that is the copy OpenCode resolves at runtime.

Run OpenCode from **inside this repo directory**; no file copying required:

```
cd /path/to/oc-plugin-llm-pricing
opencode
```

### `@opencode/plugin` dependency
- Root `package.json`: `devDependencies` (type-checking) + `peerDependencies` (>= 2.0.7)
- `.opencode/package.json` pins an exact version — this is what the OpenCode child process resolves at runtime
- Do not reintroduce `@opencode-ai/plugin` (the V1 package) or map manual `tsconfig.json` paths for it

### `@opencode/theme`
TUI type-only dependency (`ResolvedTheme`); devDependency at a fixed version matching
`@opencode/plugin`'s peer range. Not needed at runtime (OpenCode provides it).

## State model
`pricingMap`, `planHistory`, `buildHistory` are module-level variables — in-memory only. State resets on every OpenCode restart. This is intentional. Do not move them into `ctx.storage`.

## Config reading
On load, the plugin seeds plan/build history through (both run):
1. `ctx.agent.get({ agentID: "plan" | "build" })` — the V2-native source
2. Manual JSON parsing fallback — reads these paths in order:
   - `~/.config/opencode/opencode.json`
   - `~/.config/opencode/opencode.jsonc`
   - `{project}/opencode.json`
   - `{project}/.opencode/opencode.json`

## OpenRouter fetch timing
- Fetched once at plugin `setup`
- Re-fetched on demand via `fetch-llm-pricing`
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
npm test             # bun test
npm run typecheck    # tsc --noEmit (root + __tests__)
npm run lint         # biome lint
npm run check        # biome check (lint + format)
npm run check:write  # auto-fix lint + format issues
```
No build step — OpenCode runs the `.ts` source directly.

## Manual testing
1. `cd` into this repo directory
2. Run `opencode` — it picks up `.opencode/opencode.json` automatically
3. Verify the three tools appear in chat: `show-llm-pricing`, `fetch-llm-pricing`, `update-llm-selection`
4. Verify the sidebar "LLM Pricing" panel renders in the TUI
