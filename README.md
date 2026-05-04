# OpenCode LLM Pricing Plugin

**See pricing, context windows, and features for your active LLMs — in chat and in the sidebar.**

A lightweight, no-config plugin that fetches fresh data from OpenRouter on startup. It gives you input/output costs (USD per million tokens), context length, and key capabilities while you work — both as chat tools and as a live sidebar panel.

- Last 3 models per mode in the sidebar (most-recent first, active marked with `→`)
- Sidebar populated immediately on session resume — no messages required
- Sidebar updates reactively as new messages complete
- Clean display names (no provider prefixes)
- OpenCode Zen fallback when a model isn't in OpenRouter data
- Three chat tools: `show-llm-pricing`, `fetch-llm-pricing`, `update-llm-selection`
- Zero runtime dependencies, pure TypeScript

---

## Installation

This plugin is not published to npm. Install it by cloning the repo and referencing it via a local path in your OpenCode config.

**1. Clone the repo** to wherever you keep local tools — e.g. `~/plugins/oc-plugin-llm-pricing`:

```bash
git clone https://github.com/markus-kb/oc-plugin-llm-pricing ~/plugins/oc-plugin-llm-pricing
```

The cloned directory is what OpenCode loads directly — no build step required:

```
oc-plugin-llm-pricing/
├── server.ts          # server plugin (chat tools, OpenRouter fetch)
├── tui.tsx            # TUI plugin (sidebar slot registration)
├── pricing-side.tsx   # sidebar UI component
├── history.ts         # pure history-derivation logic (unit-tested)
├── package.json
└── tsconfig.json
```

**2. Add it to your project's `.opencode/opencode.json`** (create the file if it doesn't exist):

```jsonc
// your-project/.opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["/absolute/path/to/oc-plugin-llm-pricing", { "enabled": true }]
  ]
}
```

You can use a relative path (e.g. `"../../plugins/oc-plugin-llm-pricing"`) or an absolute path. OpenCode resolves it at startup — no build step, no file copying, no npm install.

### Global install (shared across all projects, across machines)

If you use a shared `opencode.json` / `opencode.jsonc` across multiple machines where the plugin is cloned to different paths, use an environment variable instead of a hard-coded path.

OpenCode supports `{env:VAR}` substitution in config files. Set a variable on each machine pointing to wherever the repo is cloned:

**Windows** — set as a System Environment Variable (Control Panel → System → Advanced → Environment Variables).

Use **forward slashes** in the path. Windows backslashes are invalid escape characters in JSON, so when OpenCode substitutes the variable into the config it will fail with:

```
InvalidEscapeCharacter at line 6, column 6
  ["C:\Users\you\...\oc-plugin-llm-pricing", { "enabled": true }]
```

Set the value with forward slashes to avoid this:

```
OC_PLUGIN_LLP = C:/path/to/oc-plugin-llm-pricing
```

**Linux / macOS** — add to `~/.bashrc`, `~/.zshrc`, or `~/.profile`:

```bash
export OC_PLUGIN_LLP="/home/youruser/plugins/oc-plugin-llm-pricing"
```

Then reference it in **both** global config files — OpenCode splits server and TUI loading across two separate files, and a missing entry in either one silently loads only that half of the plugin:

```jsonc
// ~/.config/opencode/opencode.json  — loads the server plugin (chat tools)
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["{env:OC_PLUGIN_LLP}", { "enabled": true }]
  ]
}
```

```jsonc
// ~/.config/opencode/tui.json  — loads the TUI plugin (sidebar)
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["{env:OC_PLUGIN_LLP}", { "enabled": true }]
  ]
}
```

OpenCode substitutes `{env:OC_PLUGIN_LLP}` before resolving the plugin path. Each machine uses its own local path; the config file stays identical across all of them.

> **Note:** On Windows, newly set System Environment Variables are only picked up by processes started after the variable was set. Restart your terminal (and OpenCode) after adding it.

---

## What You Get

### Sidebar panel

The plugin registers a `sidebar_content` slot that renders a live pricing panel alongside the default sidebar. It shows the last 3 models used per agent mode (most-recent first), updating automatically as messages complete. The active model is marked with `→`.

```
LLM Pricing

▼ Plan
→ Claude Sonnet 4.5
   $3.00 in / $15.00 out • 1000K ctx
   GPT-4o
   $2.50 in / $10.00 out • 128K ctx

▼ Build
→ MiniMax M2.1
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
3. Reads `opencode.json` (global + project) to seed Plan/Build history from configured model slugs.
4. The `config` hook refines history with the resolved config (moves configured models to front).
5. Falls back gracefully to `$0.00 / N/A` for any model not found in OpenRouter data.

Data is cached in memory for the session. Use `fetch-llm-pricing` or restart OpenCode to refresh.

### TUI plugin (`tui.tsx` + `pricing-side.tsx` + `history.ts`)

Registers a `sidebar_content` slot (order 60) that renders `PricingSide` using SolidJS and `@opentui/solid`. The TUI plugin:

1. Fetches OpenRouter data independently at startup (no shared memory with the server process).
2. Passes a `getMessages` accessor to `PricingSide` — a thin wrapper around `api.state.session.messages(session_id)`, which reads directly from the Solid store for the current session.
3. Inside `PricingSide`, two `createMemo` calls derive `planHistory` and `buildHistory` by scanning messages newest-first via the pure `deriveHistory(messages, mode)` function in `history.ts`.
4. Because `getMessages()` reads from the Solid store, the memos re-evaluate automatically on every message update — covering both new messages in a live session and existing messages when a session is resumed or opened.

The slot render function receives `session_id` from `sidebar.tsx` via the second argument (`props`), making the correct session's messages available without any global state or event accumulation.

---

## Development

```bash
npm install          # install devDependencies (type checking only)
npm run test         # bun test
npm run typecheck    # tsc --noEmit (main + __tests__)
npm run check        # biome lint + format
npm run check:write  # auto-fix lint + format
```

No build step — OpenCode runs `.ts`/`.tsx` source directly.

### Plugin structure

| File | Purpose |
|---|---|
| `server.ts` | Server plugin: OpenRouter fetch, pricing map, three chat tools |
| `tui.tsx` | TUI plugin: factory closure, slot registration, `getMessages` accessor |
| `pricing-side.tsx` | Sidebar component: collapsible Plan/Build sections with reactive history |
| `history.ts` | Pure `deriveHistory(messages, mode)` function — no Solid dependency, unit-tested |
| `__tests__/display-history.test.ts` | 8 unit tests for `deriveHistory` |

---

## Acknowledgements

The TUI sidebar architecture (slot registration pattern, factory closure for shared state, and `onMouseDown` usage) was informed by studying [oc-plugin-vault-tec](https://github.com/kommander/oc-plugin-vault-tec) by [@kommander](https://github.com/kommander). Thank you for the great plugin!

---

## License

MIT
