# PixooPal Preview

Create and preview standalone PixooPal Clockfaces.

```bash
npx @pixoopal/preview create
cd MyClockface
npx @pixoopal/preview run
```

## Commands

- `npx @pixoopal/preview create` creates a new Clockface.
- `npx @pixoopal/preview run` builds the Clockface in the current folder and starts a local preview server.
- `npx @pixoopal/preview build` builds the current Clockface without starting the server.

The generated Clockface entrypoint is TypeScript (`<ClockfaceName>.ts`). Preview builds that TypeScript entry into `build-<ClockfaceName>/<ClockfaceName>.mjs`.

The preview server defaults to `127.0.0.1:4174`. Use `--host` and `--port` to override it.
