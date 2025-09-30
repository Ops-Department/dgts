# DGTS – Deepgram Voice Agent Browser Wrapper

Minimal browser-friendly wrapper around Deepgram Agents for real‑time voice experiences. It bundles a small set of services that:

- Capture microphone audio and stream Linear16 PCM to a Deepgram Agent.
- Play agent audio responses in the browser.
- Expose a simple controller API to connect, configure, and interact with the agent.

The build outputs a single IIFE bundle `dist/dgts.js` that exposes a global `DGTS` object.

## Contents

- **Bundle entry:** `src/index.ts`
- **Controller:** `src/services/AgentController.ts`
- **Voice agent client:** `src/services/VoiceAgentService.ts`
- **Mic capture:** `src/services/AudioRecordService.ts`
- **Audio playback:** `src/services/AudioPlaybackService.ts`
- **Base settings (example):** `src/base_config.json`
- **Example page:** `examples/simple.html`

## Install & Build

Prereqs: Node 18+ (tested with Node 22).

```bash
npm ci               # install
npm run build        # builds dist/dgts.js
npm run start        # builds and serves the repo with http-server
```

When running `npm run start`, open:

```
http://localhost:8080/examples/simple.html?dg_token=YOUR_BROWSER_TOKEN
```

> Important: Use a Deepgram browser/client token (JWT). Do not embed raw secret API keys in the browser.

## Quick Start (Script Tag)

The bundle exposes a `DGTS` global. The simplest way to try it is the included example, but here’s a minimal snippet mirroring `examples/simple.html`:

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>DGTS Quick Start</title></head>
  <body>
    <button id="connect">Connect</button>
    <button id="start">Start Mic</button>
    <button id="stop">Stop Mic</button>
    <button id="disconnect">Disconnect</button>

    <pre id="transcript"></pre>

    <script src="./dist/dgts.js"></script>
    <script>
      const token = new URLSearchParams(location.search).get('dg_token');
      const controller = new DGTS.AgentController();

      controller.onTranscript((messages) => {
        document.getElementById('transcript').textContent =
          messages.map(m => `[${m.role}] ${m.content}`).join('\n');
      });

      async function connect() {
        if (!token) return alert('Missing dg_token');
        controller.init({ token, settings: DGTS.baseConfig });
        await controller.connect();
      }

      document.getElementById('connect').onclick = connect;
      document.getElementById('start').onclick = () => controller.startRecording();
      document.getElementById('stop').onclick = () => controller.stopRecording();
      document.getElementById('disconnect').onclick = () => controller.disconnect();
    </script>
  </body>
  </html>
```

For a fuller demo with status and event logging, see `examples/simple.html`.

## Tokens and Security

- This SDK expects a pre-minted Deepgram browser/client token (JWT) passed to `AgentController.init({ token })`.
- Do not expose your Deepgram secret key in client code. If you only have a secret key, mint a short‑lived browser token on your server and pass it to the page (e.g., via query string or fetch).

### Obtain a client token (curl)

Deepgram's `v1/auth/grant` endpoint does not support CORS. Mint the token server‑side or from your terminal, then open the page with `?dg_token=...`.

```bash
# Prints only the token
curl -s -X POST \
  https://api.deepgram.com/v1/auth/grant \
  -H 'Authorization: Token YOUR_DEEPGRAM_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{}' | jq -r .access_token

# Prints a ready-to-open URL for the local example
curl -s -X POST \
  https://api.deepgram.com/v1/auth/grant \
  -H 'Authorization: Token YOUR_DEEPGRAM_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{}' | jq -r '"http://localhost:8080/examples/simple.html?dg_token=\\(.access_token)"'
```

Then open the printed URL (or copy the token into your own URL). The sample page `examples/simple.html` also shows this curl approach and updates the command as you type an API key.

## Public API

The bundle re-exports the following under the `DGTS` global (from `src/index.ts`):

- `AgentController`
- `VoiceAgentService`
- `AudioRecordService`
- `AudioPlaybackService`
- `baseConfig` (example Deepgram settings)
- `AgentEvents` (from `@deepgram/sdk`)
- Enums from `lib/Models.ts` (`ListenModel`, `ThinkModel`, `SpeechModel`)

### AgentController

High‑level orchestrator for mic capture, agent connection, and audio playback.

Constructor:

```ts
const controller = new DGTS.AgentController();
```

Initialization and connection:

```ts
controller.init({
  token: '<browser_jwt>',    // required
  settings: DGTS.baseConfig, // or provide your own Deepgram agent Settings object
  config: {                  // optional typed config shortcut (alternative to settings)
    listenModel: 'nova-3',
    thinkModel: 'gpt-4o-mini',
    speechModel: 'aura-2-callista-en',
    basePrompt: '...'        // used if you rely on config-based setup
  },
});
await controller.connect();
```

Microphone streaming:

```ts
await controller.startRecording({
  onRecordingChange: (isRec) => {},
  onSampleRateDetermined: (sr) => {},
  onError: (err) => {},
});
controller.stopRecording();
```

Events and state helpers:

```ts
controller.on('state', (s) => {/* VoiceAgentState */});
controller.on('audio', (chunk) => {/* raw Int16 PCM as Uint8Array */});
controller.on('error', (msg) => {});

// Subscribe to Deepgram agent events (buffered before connect):
controller.onAgent(DGTS.AgentEvents.Welcome, (data) => {});
controller.onAgent(DGTS.AgentEvents.ConversationText, (msg) => {});
// ...any event from @deepgram/sdk AgentEvents

// Transcript convenience:
controller.onTranscript((messages) => {});
const state = controller.getState();
const transcript = controller.getTranscript();
controller.clearTranscript();
```

Runtime interactions:

```ts
controller.injectUserMessage('hello');
controller.updatePrompt('New system prompt');
controller.updateSettings({ /* Deepgram Settings */ });
controller.updateSpeak({ /* speak provider config */ });
controller.injectAgentMessage('assistant says…');
controller.functionCallResponse({ /* tool response */ });
controller.keepAlive();
controller.disconnect();
```

### Audio specifics

- Mic input is captured as mono Linear16 at 24 kHz and streamed to the agent.
- Agent audio is rendered via `AudioContext` at the configured output sample rate (default 24 kHz).
- Firefox is detected and downsampled accordingly; other browsers request a 24 kHz context.

## Configuration

- `DGTS.baseConfig` exports an example Deepgram Settings object (`src/base_config.json`) that configures:
  - `audio.input`/`audio.output` as Linear16 at 24 kHz
  - `agent.listen` (Deepgram ASR), `agent.speak` (Deepgram TTS), and `agent.think` (LLM provider/model)
  - `agent.greeting` and a long example prompt
- You may pass your own full Settings object via `controller.init({ settings })` or mutate at runtime with `controller.updateSettings()`.

## Development

- Build: `npm run build`
- Local demo: `npm run start` then open `examples/simple.html?dg_token=…`
- The bundle is produced with esbuild as an IIFE, exposing `window.DGTS`.
- The code adds a `Buffer` polyfill for browser compatibility with `@deepgram/sdk`.

## License

Proprietary – internal use only (update as needed).
