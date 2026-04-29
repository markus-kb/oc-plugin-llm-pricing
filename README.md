# OpenCode LLM Pricing Plugin

**See pricing, context windows, and features for your active LLMs — in chat and in the sidebar.**

A lightweight, no-config plugin that fetches fresh data from OpenRouter on startup. It gives you input/output costs (USD per million tokens), context length, and key capabilities while you work — both as chat tools and as a live sidebar panel.

- ✅ Sidebar updates automatically as you switch models mid-session
- ✅ Live sidebar panel showing Plan + Build pricing at a glance
- ✅ Clean display names (no provider prefixes)
- ✅ OpenCode Zen fallback when a model isn't in OpenRouter data
- ✅ Three tools: `show-llm-pricing`, `fetch-llm-pricing`, `update-llm-selection`
- ✅ Zero runtime dependencies, pure TypeScript

---

## Installation

This plugin is not published to npm. Install it by cloning the repo and referencing it via a local path in your project's OpenCode config.

**1. Clone the repo:**

```bash
git clone https://github.com/backwithambition/oc-plugin-llm-pricing /path/to/oc-plugin-llm-pricing
```

**2. Add it to your project's `.opencode/opencode.json`** (create the file if it doesn't exist):

```jsonc
// your-project/.opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["/path/to/oc-plugin-llm-pricing", { "enabled": true }]
  ]
}
```

You can use a relative path (e.g. `"../../oc-plugin-llm-pricing"`) or an absolute path. OpenCode resolves it at startup — no build step, no file copying, no npm install.

### Developing the plugin itself

Run OpenCode from inside this repo to use the bundled `.opencode/opencode.json`, which loads the plugin from the repo root via `"../"`:

```bash
cd /path/to/oc-plugin-llm-pricing
opencode
```

---

## What You Get

### Sidebar panel

The plugin registers a `sidebar_content` slot that renders a live pricing panel alongside the default sidebar. It shows the currently active model for each agent mode, updating automatically whenever a message completes (via `message.updated` events — the `AssistantMessage` carries the model actually used for that turn).

```
LLM Pricing

▼ Plan
   Claude Sonnet 4.5
   $3.00 in / $15.00 out • 1000K ctx

▼ Build
   MiniMax M2.1
   $0.20 in / $0.20 out • 1000K ctx
```

Section headers are clickable — click to collapse/expand (`▶`/`▼`). The sidebar fetches OpenRouter data independently on startup (the TUI process cannot share state with the server plugin process).

### Chat tools

#### `show-llm-pricing`

Print pricing, context, and features for the last 3 LLMs in each mode:

```
📊 LLM Pricing + Context + Features

Plan Mode (most recent first):
→ Claude Sonnet 4.5: $3.00 in / $15.00 out • 1000K ctx [include_reasoning, max_tokens]

Build Mode (most recent first):
→ MiniMax M2.1: $0.20 in / $0.20 out • 1000K ctx [tools]
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

### TUI plugin (`tui.tsx` + `pricing-side.tsx`)

Registers a `sidebar_content` slot (order 60) that renders `PricingSide` using SolidJS and `@opentui/solid`. The TUI plugin:

1. Fetches OpenRouter data independently at startup (no shared memory with the server process).
2. Seeds `planModel`/`buildModel` signals from `api.state.config` (the config default).
3. Listens for `message.updated` events via `api.event.on` — each `AssistantMessage` carries `providerID`, `modelID`, and `mode`, so the signals update to reflect the model actually used each turn.
4. `PricingSide` re-renders reactively whenever the signals change.

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
| `tui.tsx` | TUI plugin: factory closure, event listener, slot registration |
| `pricing-side.tsx` | Sidebar component: collapsible Plan/Build sections with live pricing |

---

## License

MIT
