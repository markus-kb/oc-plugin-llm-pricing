# OpenCode LLM Pricing Plugin

**See pricing, context windows, and features for your last 3 LLMs per agent mode — directly in chat.**

A lightweight, no-config plugin that fetches fresh data from OpenRouter on startup and gives you exactly what you need while planning or building: **input/output costs (USD per million tokens)**, **context length**, and **key capabilities** (tools, vision, JSON mode, etc.).

- ✅ Last 3 selected models per mode (most recent first)
- ✅ Clean names (no provider prefixes)
- ✅ OpenCode Zen fallback when a model isn't in OpenRouter data
- ✅ Three tools: `show-llm-pricing`, `fetch-llm-pricing`, `update-llm-selection`
- ✅ Zero dependencies, pure TypeScript, ~6 KB

---

## Installation

1. Copy the plugin file to your global plugins folder:
   ```bash
   # From the repo root:
   mkdir -p ~/.config/opencode/plugins
   cp src/llm-pricing-plugin.ts ~/.config/opencode/plugins/
   ```

2. Restart OpenCode.  
   The plugin loads automatically and fetches ~300 models from OpenRouter (public endpoint, no API key needed).

That's it — no `opencode.json` changes, no extra packages.

> **Windows:** OpenCode recommends running via WSL. In WSL the path is the same: `~/.config/opencode/plugins/`.

---

## Usage

### `show-llm-pricing`

Show pricing, context, and features for the last 3 LLMs in each mode:

```
📊 LLM Pricing + Context + Features (OpenRouter → Zen fallback)

Plan Mode (most recent first):
→ Claude 3.5 Sonnet: $3.00 in / $15.00 out • 200K ctx [tools, vision, max_tokens]
  GPT-4o: $2.50 in / $10.00 out • 128K ctx [tools, json_object]
  ...

Build Mode ...
```

### `fetch-llm-pricing`

Re-fetch fresh data from OpenRouter without restarting OpenCode:

```
fetch-llm-pricing
→ ✅ OpenRouter data refreshed — 312 models loaded.
```

### `update-llm-selection`

Manually record a model switch:

```
update-llm-selection mode=plan model=anthropic/claude-3-opus-20240229
```

Use this after you change models in the UI or config. History updates immediately.

---

## How It Works

1. **On startup** — Fetches the full OpenRouter models list (`https://openrouter.ai/api/v1/models`).
2. **Enriches** each model with:
   - Pricing (`prompt` + `completion` → USD per million tokens)
   - Context window (`context_length` with `top_provider` fallback)
   - Features (`supported_parameters` or `tags`)
3. **Reads your `opencode.json`** (global + project) to seed Plan/Build history.
4. **`config` hook** then refines history with the resolved config (moves configured models to front).
5. **Falls back** gracefully to "N/A — check OpenCode Zen" for any model not found.

Data is cached in memory. Use `fetch-llm-pricing` or restart OpenCode to refresh.

---

## Configuration (Optional)

The plugin works out of the box. Set these in your config to seed initial history:

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

No build step — OpenCode runs the `.ts` source directly.

---

## License

MIT

---

*Plugin version: 2026-04-29 • Fetches live OpenRouter data on startup*
