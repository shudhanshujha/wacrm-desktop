# WaCRM Desktop

A WhatsApp CRM desktop app for Windows, powered by the [OpenWA](https://github.com/rmyndharis/OpenWA) core (WhatsApp Web engine).

The app runs three processes, all launched automatically by the Electron shell:

1. **OpenWA core** — NestJS WhatsApp engine on `http://127.0.0.1:2785` (API under `/api`).
2. **CRM server** — Express server on `http://127.0.0.1:3100`. Serves the React UI and the CRM API (inbox state, quick replies, AI suggestions, agent performance, broadcasts, automations, handover).
3. **Electron window** — loads the CRM UI from `http://127.0.0.1:3100`.

The core and CRM server run under a **bundled standalone Node.js 22.23.2** (`resources/node/node.exe`), so nothing needs to be installed on the target machine.

## Requirements

- **Windows 10/11 x64**
- **Chrome must be installed** at `C:\Program Files\Google\Chrome\Application\chrome.exe` (the WhatsApp engine launches WhatsApp Web through it). It is not bundled to keep the download small.

## Run the packaged app

1. Unzip `WaCRM-win-unpacked.zip` anywhere.
2. Run `WaCRM.exe`.
3. In the **Connect** tab, click **Create & start session**, then scan the QR code with your phone (WhatsApp → Settings → Linked devices → Link a device).
4. Open the **Inbox** to reply to conversations.

First launch can take ~20–40s while the WhatsApp engine initializes.

## Features

- **Connect** — session creation, QR code, phone pairing code fallback.
- **Inbox** — live chat list, unread badges, message history, replies.
- **AI reply** — one-click Claude-powered suggestion (`claude-sonnet-4-20250514`). Needs an Anthropic API key in **Settings → AI assistant**. Without a key it shows a clear error (no crash).
- **Quick replies** — reusable `/shortcut` replies managed in Settings, shown as one-tap buttons in the Inbox.
- **Human handover** — pause the bot for a chat, assign an agent, add a note; Resume button brings the bot back. Automations are skipped while a chat is handed over.
- **Agent performance** — per-agent handled/resolved counts, manual vs auto replies, response rate, average resolution time.
- **Contacts** — searchable list with full timeline (messages + broadcast receipts).
- **Broadcasts** — send a message to selected/all contacts via the bulk API with progress tracking.
- **Automations** — keyword/regex-triggered flows with send / wait / handover steps.
- **Analytics** — open/resolved/handover counts plus agent performance table.

## Data locations

- **WhatsApp session + message DB**: `resources\core\data\` inside the app folder (also `core\data` in the source tree).
- **CRM data** (quick replies, conversations, broadcasts, templates, automations, AI key): stored in Electron's user-data dir (`%APPDATA%\WaCRM\data\`). The AI key is read from `ANTHROPIC_API_KEY` env var or the `ai-key` file in that folder.
- **API key**: OpenWA's API master key is fixed in `core\.env` as `API_MASTER_KEY` for localhost-only use.

## Development

```bash
# 1. build the OpenWA core
cd core
npm ci        # use PUPPETEER_SKIP_DOWNLOAD=true if Chrome is present
npm run build # -> dist/main.js

# 2. build the frontend
cd ../frontend
npm install
npm run build # -> dist/

# 3. run the desktop app (bundled Node + system Chrome)
cd ..
npm install
npm start
```

### Repackaging

```bash
npm run build:frontend   # if the UI changed
npx electron-builder --win dir
# output lands in build/win-unpacked, zip it as WaCRM-win-unpacked.zip
```

## Ports

| Service     | Address                |
|-------------|------------------------|
| OpenWA core | `http://127.0.0.1:2785` |
| CRM server  | `http://127.0.0.1:3100` |
| API docs    | `http://127.0.0.1:2785/api/docs` |

## Notes

- The WhatsApp session must be re-linked by QR on a new machine (credentials are not portable).
- Keep the app running while a broadcast is in progress; progress is polled live.
- AI suggestions require an internet connection to `api.anthropic.com`.
