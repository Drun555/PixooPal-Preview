# PixooPal Preview

Create and preview standalone PixooPal Clockfaces.

```bash
npx @pixoopal/preview create
cd MyClockface
npx @pixoopal/preview run
```

## Commands

- `@pixoopal/preview create` scaffolds a Clockface folder.
- `@pixoopal/preview run` builds the current Clockface and starts a local preview server.
- `@pixoopal/preview build` builds the current Clockface without starting the server.

The generated Clockface entrypoint is TypeScript (`<ClockfaceName>.ts`). Preview builds that TypeScript entry into `build-<ClockfaceName>/<ClockfaceName>.mjs`.

The preview server defaults to `127.0.0.1:4174`. Use `--host` and `--port` to override it.
