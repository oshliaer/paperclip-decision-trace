# Paperclip Decision Trace

A Paperclip plugin

## Development

```bash
pnpm install
pnpm dev            # watch builds
pnpm dev:ui         # local dev server with hot-reload events
pnpm test
```

This scaffold snapshots `@paperclipai/plugin-sdk` and `@paperclipai/shared` from a local Paperclip checkout.
The packed tarballs live in `.paperclip-sdk/` for local development. Before publishing this plugin, switch those dependencies to published package versions once they are available on npm.

## Install Into Paperclip

```bash
PLUGIN_DIR=$(pwd)
curl -X POST "${PAPERCLIP_API_URL:-http://127.0.0.1:3100}/api/plugins/install" \
  -H "Content-Type: application/json" \
  -d "{\"packageName\":\"$PLUGIN_DIR\",\"isLocalPath\":true}"
```

## Build Options

- `pnpm build` uses esbuild presets from `@paperclipai/plugin-sdk/bundlers`.
- `pnpm build:rollup` uses rollup presets from the same SDK.
