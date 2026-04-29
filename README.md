# OpenCode LLM Pricing Plugin

**See pricing, context windows, and features for your last 3 LLMs per agent mode — instantly in the sidebar.**

A lightweight, no-config plugin that fetches fresh data from OpenRouter on every startup and displays exactly what you need while planning or building: **input/output costs (USD per million tokens)**, **context length**, and **key capabilities** (tools, vision, JSON mode, etc.).

- ✅ Last 3 selected models per mode (most recent first, current highlighted)
- ✅ Clean names (no provider prefixes)
- ✅ Theme-aware status badges (success / warning for expensive models / info)
- ✅ OpenCode Zen fallback when a model isn't in OpenRouter data
- ✅ Two handy tools: `update-llm-selection` + `show-llm-pricing`
- ✅ Auto-tracks on session events
- ✅ Zero dependencies, pure TypeScript, ~8 KB
- ⚠️ Sidebar panels require the experimental sidebar panel API (not yet in stable OpenCode)

---

## Installation

1. Copy the plugin file to your global plugins folder:
   ```bash
   # From the repo root:
   mkdir -p ~/.config/opencode/plugins
   cp src/llm-pricing-opencode-plugin.ts ~/.config/opencode/plugins/
   ```

2. Restart OpenCode.  
   The plugin loads automatically and fetches ~300 models from OpenRouter (public endpoint, no API key needed).

That's it — no `opencode.json` changes, no extra packages.

> **Windows:** OpenCode recommends running via WSL. In WSL the path is the same: `~/.config/opencode/plugins/`.

---

## Usage

### Tools (Always Available)

**`show-llm-pricing`** — Full details for both modes in chat:
```
📊 **LLM Pricing + Context + Features** (OpenRouter → Zen fallback)

**Plan Mode** (most recent first):
→ Claude 3.5 Sonnet: $3.00 in / $15.00 out • 200K ctx [tools, vision, max_tokens]
  GPT-4o: $2.50 in / $10.00 out • 128K ctx [tools, json_object]
  ...

**Build Mode** ...
```

**`update-llm-selection`** — Manually record a model switch:
```
update-llm-selection mode=plan model=anthropic/claude-3-opus-20240229
```
Use this after you change models in the UI or config. History updates immediately.

### Sidebar Panels (Experimental)

Sidebar panels (`▶ Plan Mode`, `▶ Build Mode`) require the **experimental sidebar panel API**. This API is not yet part of stable OpenCode. If you don't see the panels, the tools above provide the same data.

---

## How It Works

1. **On load** — Fetches the full OpenRouter models list (`https://openrouter.ai/api/v1/models`).
2. **Enriches** each model with:
   - Pricing (`prompt` + `completion` → USD per million tokens)
   - Context window (`context_length` with `top_provider` fallback)
   - Features (`supported_parameters` or `tags`)
3. **Reads your `opencode.json`** (global + project) to seed Plan/Build history.
4. **Displays** via tools + sidebar panels (if sidebar API is active).
5. **Falls back** gracefully to "N/A — check OpenCode Zen" for any model not found.
6. **Tracks** history on `session.updated` / `session.created` events (best-effort).

Data is cached in memory for the session. Restart OpenCode to refresh pricing/features.

---

## Configuration (Optional)

The plugin works out of the box. You can influence initial models by setting them in your config:

```jsonc
// ~/.config/opencode/opencode.json  or  ./opencode.json
{
  "agent": {
    "plan": {
      "model": "anthropic/claude-3-5-sonnet-20241022"
    },
    "build": {
      "model": "anthropic/claude-3-5-sonnet-20241022"
    }
  }
}
```

After changing these, restart OpenCode or call `update-llm-selection`.

---

## Compatibility

- OpenCode v1.0+ (uses documented plugin hooks)
- Sidebar panels require the experimental sidebar panel API — if not available, use the tools instead
- Works with any provider routed through OpenRouter (or direct IDs matching OpenRouter naming)

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

*Plugin version: 2026-04-29 • Fetches live OpenRouter data on every start*
