# OpenCode LLM Pricing Plugin

**See pricing, context windows, and features for your last 3 LLMs per agent mode — in chat and in the sidebar.**

A lightweight, no-config plugin that fetches fresh data from OpenRouter on startup. It gives you input/output costs (USD per million tokens), context length, and key capabilities while you work — both as chat tools and as a live sidebar panel.

- ✅ Last 3 selected models per mode (most recent first)
- ✅ Live sidebar panel showing Plan + Build pricing at a glance
- ✅ Clean display names (no provider prefixes)
- ✅ OpenCode Zen fallback when a model isn't in OpenRouter data
- ✅ Three tools: `show-llm-pricing`, `fetch-llm-pricing`, `update-llm-selection`
- ✅ Zero runtime dependencies, pure TypeScript

---

## Installation

Install from the CLI:

```bash
opencode plugin oc-plugin-llm-pricing
```

Or from the OpenCode command palette:

1. Press `Ctrl+P`
2. Select `Install Plugin`
3. Enter `oc-plugin-llm-pricing`

The plugin loads automatically and fetches ~300 models from OpenRouter (public endpoint, no API key needed).

### Local development

Run OpenCode from inside this repo — it picks up `.opencode/opencode.json` automatically:

```bash
cd /path/to/oc-plugin-llm-pricing
opencode
```

No file copying required. The `.opencode/` directory contains the runtime config that loads the plugin from the repo root via a relative path.

---

## What You Get

### Sidebar panel

The plugin registers a `sidebar_content` slot that renders a live pricing panel alongside the default sidebar. It shows the top 3 most recently used models for each agent mode, updating on every model switch.

```
LLM Pricing

Plan
→ Claude 3.5 Sonnet
   $3.00 in / $15.00 out • 200K ctx
  GPT-4o
   $2.50 in / $10.00 out • 128K ctx

Build
→ Claude 3.5 Sonnet
   $3.00 in / $15.00 out • 200K ctx
```

The sidebar fetches OpenRouter data independently on mount (the TUI process cannot share state with the server plugin process).

### Chat tools

#### `show-llm-pricing`

Print pricing, context, and features for the last 3 LLMs in each mode:

```
📊 LLM Pricing + Context + Features

Plan Mode (most recent first):
→ Claude 3.5 Sonnet: $3.00 in / $15.00 out • 200K ctx [tools, vision]
  GPT-4o: $2.50 in / $10.00 out • 128K ctx [tools, json_object]

Build Mode (most recent first):
→ Claude 3.5 Sonnet: $3.00 in / $15.00 out • 200K ctx [tools, vision]
```

#### `fetch-llm-pricing`

Re-fetch fresh data from OpenRouter without restarting OpenCode:

```
✅ Refreshed — 312 models loaded.
```

#### `update-llm-selection`

Manually record a model switch:

```
update-llm-selection mode=plan model=anthropic/claude-3-opus-20240229
```

History updates immediately in both the tool output and the sidebar.

---

## How It Works

### Server plugin (`server.ts`)

1. On startup, fetches the full OpenRouter models list (`https://openrouter.ai/api/v1/models`).
2. Enriches each model with pricing, context window, and features.
3. Reads `opencode.json` (global + project) to seed Plan/Build history.
4. The `config` hook refines history with the resolved config (moves configured models to front).
5. Falls back gracefully to `$0.00 / N/A` for any model not found in OpenRouter data.

Data is cached in memory for the session. Use `fetch-llm-pricing` or restart OpenCode to refresh.

### TUI plugin (`tui.tsx`)

Registers a `sidebar_content` slot (order 60) that renders `PricingSide` using SolidJS and `@opentui/solid`. The TUI plugin fetches OpenRouter data independently on mount — there is no shared memory between the server and TUI processes.

---

## Configuration (Optional)

The plugin works out of the box. Set these in your config to seed initial model history:

```jsonc
// ~/.config/opencode/opencode.json  or  ./opencode.json
{
  "agent": {
    "plan": { "model": "anthropic/claude-3-5-sonnet-20241022" },
    "build": { "model": "anthropic/claude-3-5-sonnet-20241022" }
  }
}
```

---

## Development

```bash
npm install          # install devDependencies (type checking only)
npm run typecheck    # tsc --noEmit
npm run check        # biome lint + format
npm run check:write  # auto-fix lint + format
```

No build step — OpenCode runs `.ts`/`.tsx` source directly.

### Plugin structure

| File | Purpose |
|---|---|
| `server.ts` | Server plugin: OpenRouter fetch, pricing map, three chat tools |
| `tui.tsx` | TUI plugin: registers `sidebar_content` slot |
| `context.tsx` | SolidJS context: fetches OpenRouter data, exposes plan/build history |
| `pricing-side.tsx` | Sidebar component: renders top-3 models per mode |

---

## License

MIT
