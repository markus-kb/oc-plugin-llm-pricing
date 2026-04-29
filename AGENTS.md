# AGENTS.md

## Repo structure
Single-file OpenCode plugin. No build step, no test suite, no CI.
Key files: `src/llm-pricing-opencode-plugin.ts`, `package.json`, `tsconfig.json`, `biome.json`.

## Deliverable
The built artifact is the `.ts` file itself. Installation is a manual copy:
```
cp src/llm-pricing-opencode-plugin.ts ~/.config/opencode/plugins/
```
OpenCode loads `.ts` files directly from that folder — no compilation step.

## `@opencode-ai/plugin` dependency
This package is a `devDependency` for local type-checking only. At runtime it is injected by OpenCode. Do not expect it in `node_modules` inside the plugin environment.

## Plugin API (return object shape)
```ts
return {
  sidebar: Array<{ id: string; title: string; items: () => { label, value, status? }[] }>,
  "session.created": async (input: any) => void,
  "session.updated": async (input: any) => void,
  tool: Record<string, tool({ description, args, execute })>
}
```
Tool schema builder is `tool.schema.enum([...])` / `tool.schema.string()` — not raw Zod.

## Shell executor `$`
The `$` parameter is the OpenCode runtime shell helper (tagged-template, same syntax as Bun's `$`). It is not `execa` or any npm package.

## State model
`pricingMap`, `planHistory`, `buildHistory` are module-level variables — in-memory only. State resets on every OpenCode restart. This is intentional.

## Config reading
On load, the plugin reads `agent.plan.model` / `agent.build.model` from these paths (first-wins, all tried):
1. `~/.config/opencode/opencode.json`
2. `{project}/opencode.json`
3. `{project}/.opencode/opencode.json`

## Pricing logic
- Expensive threshold: `inputPerM > 10` → `warning` badge
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
3. Verify sidebar panels render and `show-llm-pricing` tool works in chat

## Export name
The exported plugin constant is `LLMPricingPlugin` (camelCase, no spaces). The OpenCode runtime discovers it by the `Plugin` type annotation, not by name — but the identifier must be valid TypeScript.
