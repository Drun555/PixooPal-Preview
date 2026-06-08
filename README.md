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

The preview server defaults to `127.0.0.1:4174`. Use `--host` and `--port` to override it.

## Using the Clockface

For personal use, you can always just copy your ./build-* folder inside PixooPal/data/CommunityClockfaces. It should instantly appear in the list.


And if you think you did a great job and want to share your new fancy clockface to the masses, you can:
- https://github.com/Drun555/PixooPal-Community <- create an issue here with attached clockface
- Or, if you are a cool hacker boy, you can fork it, put your clockface inside /src and make a PR.