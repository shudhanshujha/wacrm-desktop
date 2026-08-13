# WaCRM Desktop Project Rules

## Release Rules
- Always include a portable `.exe` file directly in GitHub releases (not just an installer).
- The `portable` target must always be included in the `win.target` array in `package.json`.

## Build Rules
- Always bump version in both `package.json` (root) and `frontend/package.json` when making releases.
- Always run `npm run build:frontend` before `npm run dist` to ensure frontend assets are fresh.
