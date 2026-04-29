# AGENTS.md

## Repo structure
Single-file OpenCode plugin. No build step, no test suite, no CI.
Key files: `src/llm-pricing-plugin.ts`, `package.json`, `tsconfig.json`, `biome.json`.

## Deliverable
The built artifact is the `.ts` file itself. Installation is a manual copy:
```
cp src/llm-pricing-plugin.ts ~/.config/opencode/plugins/
```
OpenCode loads `.ts` files directly from that folder — no compilation step.

## `@opencode-ai/plugin` dependency
This package is a `devDependency` for local type-checking only. At runtime it is injected by OpenCode. Do not expect it in `node_modules` inside the plugin environment.

## Plugin API (return object shape)
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
1. Copy plugin to `~/.config/opencode/plugins/`
2. Restart OpenCode
3. Verify plugin appears in ctrl+p → Plugins
4. Call `show-llm-pricing` in chat to verify pricing data
5. Call `fetch-llm-pricing` to verify on-demand refresh works

## Export name
The exported plugin constant is `LLMPricingPlugin` (camelCase, no spaces). The OpenCode runtime discovers it by iterating all named exports and calling any that are functions — the name is not significant.
