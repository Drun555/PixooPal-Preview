# __CLOCKFACE_ID__ Clockface AI Instructions

Use these instructions when working on this PixooPal Clockface.

## Scope

- At first, clockface is prefilled with "Example" template.
- Edit only files inside this Clockface folder.
- Keep every asset beside the main entrypoint or in local subfolders inside this Clockface folder.
- Do not reference, create, or require files outside this folder.
- Do not add external dependencies. The only allowed package dependency is `@pixoopal/clockface`.
- The generated entrypoint is TypeScript. Keep the main Clockface code in `__CLOCKFACE_ID__.ts`.

## SDK Rules

- Use `defineClockface`, `data`, `input`, and `context.canvas` from `@pixoopal/clockface`.
- Use `context.homeAssistant` for Home Assistant calls when the Clockface needs them.
- Prefer `context.canvas` helpers before direct buffer writes.
- Direct `context.canvas.buffer` access is allowed only when canvas helpers are not enough.
- For dynamic Clockfaces, prefer frame-by-frame animation state over wall-clock time based animation.

## Validation

- Run `npm run preview` or `npx @pixoopal/preview run` to validate and preview changes.
- Confirm `manifest.json`, the entry file, and `picture.png` are present before finishing.
