# Source-of-Truth: `/services/voice`

## *scope: real-time duplex voice UX (barge-in, partial ASR, low-latency TTS), transport, and visual feedback*

> **Owner note (my voice):** Voice is our “wow” layer. It must feel instant, interruptible, and calm. First audio/words in ≲300 ms, always. Barge-in should just work. All this sits on top of the orchestrator and tools you already specced.

---

## Directory

```plaintext
/services/voice
  turnManager.ts            // dialog orchestration, STT/TTS/VAD, barge-in
  visualFeedbackService.ts  // UI hints: mic/levels/partials/action glows
  transport/wsServer.ts     // WebSocket duplex transport for text+audio
```

---

## 1) `turnManager.ts` — Dialog + Audio Runtime

### Mission

Own a **single, full-duplex “turn”**: capture mic, stream audio frames up, receive partial transcripts & TTS audio down, handle **barge-in** (interrupt TTS when the user speaks), and mediate with the agent graph. Do this with **very low latency** using Web Audio `AudioWorklet` for capture/VAD and Opus framing for the wire.

### Design goals (non-negotiables)

* **Low latency path.** Use `AudioWorklet` for capture/VAD and buffering on the audio thread; it exists precisely for low-latency processing. ([MDN Web Docs][1])
* **Built-in DSP on the mic.** Request `echoCancellation`, `noiseSuppression`, and `autoGainControl` via `getUserMedia` constraints; read back actual settings with `MediaTrackSettings`. ([MDN Web Docs][2])
* **Opus framing.** Encode 20 ms frames (typical for interactive speech; Opus supports 2.5–60 ms) at 48 kHz for network efficiency. ([tech-invite.com][3], [IETF Datatracker][4])
* **Barge-in always.** When VAD detects speech while TTS is playing, **duck/pause** TTS immediately and mark a new user turn. (Industry agents treat barge-in as table-stakes.)
* **Realtime ASR/TTS provider.** Integrate with Realtime APIs (OpenAI Realtime): stream audio over WebSocket, send/receive JSON events, and play downlinked audio chunks. ([OpenAI Platform][5])

### Public surface (TypeScript)

```ts
export type TurnEvent =
  | { type:'ready'|'mic_opened'|'mic_closed'|'tts_play'; data?: any }
  | { type:'vad', active:boolean, level:number }
  | { type:'partial_asr', text:string }
  | { type:'final_asr', text:string, lang:string }
  | { type:'barge_in' }
  | { type:'agent_delta'|'agent_tool'|'agent_final', data:any }
  | { type:'error', code:string, message:string };

export interface TurnManagerCfg {
  locale?: string;                 // BCP-47
  vad: { threshold:number; hangMs:number };
  opus: { frameMs:20|40; bitrate?:number };
  tts: { enable:boolean; duckOnVAD:boolean };
  transport: VoiceTransport;       // ws client abstraction
}

export interface TurnManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  pushText(text:string): Promise<void>; // optional text-only turns
  on(cb: (e:TurnEvent)=>void): () => void;
}
```

### Critical behaviors

* **Mic open/capture.** `getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true } })`; verify actual values via `track.getSettings()` and surface to telemetry. ([MDN Web Docs][2])
* **VAD.** Lightweight energy + zero-crossing gate in an `AudioWorkletProcessor` producing 10–20 ms decisions; debounce with `hangMs`. (AudioWorklet is designed for this: separate audio thread, very low latency.) ([MDN Web Docs][1])
* **Opus framing.** Packetize PCM into 20 ms frames; 48 kHz mono; send as binary messages over WS. (Opus is the IETF standard for interactive speech.) ([IETF Datatracker][4], [opus-codec.org][6])
* **Downlink TTS.** Accept server-pushed audio chunks (Opus/PCM). On the client, either:

  * decode with **WebCodecs/AudioWorklet** and feed an `AudioBufferSourceNode`, or
  * if provider streams playable containers, append to **MSE**; else decode in app and schedule frames with a small jitter buffer.
* **Barge-in.** As soon as VAD transitions **active** while TTS plays: emit `{type:'barge_in'}`, pause/duck TTS, and start a fresh upstream turn. (This is how Realtime voice agents are demonstrated.) ([OpenAI Platform][7])
* **Provider integration.** For OpenAI Realtime: maintain a WebSocket session, send `input_audio_buffer.append` events with base64/bytes, and consume `response` + audio chunks. ([OpenAI Platform][5])

### Performance targets

* **First token/audio ≤ 300 ms** from user speech start.
* **ASR partial latency ≤ 150 ms** median.
* **Barge-in stop/duck ≤ 50 ms** from VAD active.
* **Packet loss tolerance:** 1–2 lost 20 ms frames without user-visible artifacts (jitter buffer).

---

## 2) `visualFeedbackService.ts` — Minimal, Calm UI

### Mission of visualFeedbackService

Give the user confidence without clutter: show that we’re listening, thinking, acting—**and where**.

### Responsibilities

* **Mic state + levels.** Round mic button (idle/listening/sending), animated **level meter** driven by VAD level events.
* **Partial transcripts.** Inline gray **partial ASR** that firm up to black on **final\_asr**.
* **Action glow.** When the agent executes a tool (e.g., `navigate.goto`, `commerce.addToCart`), briefly **highlight** the target region; we already expose selectors/ARIA through the site contract.
* **Streaming deltas.** Small “typing dots”/progress while we stream agent tokens and tool deltas.
* **Error toasts.** Friendly, actionable messages on network/on-device mic errors.

### A11y & implementation notes

* Respect **ARIA**: `aria-live="polite"` for partials; ensure controls have labels. (ARIA landmarks/roles improve both a11y and programmatic targeting.) ([Stack Overflow][8])
* Use **Web Audio API** for level metering (AnalyserNode or from the VAD worklet). ([MDN Web Docs][9])
* Keep motion subtle; prefer opacity/scale transitions; respect `prefers-reduced-motion`.

### Success criteria

* UI settles into **three** clear states: Idle ↔ Listening ↔ Responding.
* Partial ASR visible within **150 ms** median of speech.
* Tool highlights align with actual DOM targets.

---

## 3) `transport/wsServer.ts` — Duplex Transport (Node)

### Mission of wsServer

A **WebSocket** service that carries:
(1) **binary audio upstream** (Opus frames),
(2) **binary/JSON downstream** (TTS audio chunks, partials, tool/plan deltas),
(3) health, backpressure, and **ping/pong**. Use JWT tenant auth.

### Protocol & framing

* **Wire:** WebSocket (RFC 6455). Implement **ping/pong** control frames for keepalive and liveness. A Pong must mirror the Ping payload. ([IETF Datatracker][10], [MDN Web Docs][11])
* **Messages:**

  * **Binary:** `audio/opusr` (20 ms frames) or raw PCM.
  * **Text JSON:** `{type:'partial_asr'|'final_asr'|'agent_delta'|'tool'|'final'|'error', ...}`.
* **Masking:** browsers **must** mask client→server frames; server must not mask. (Protocol rule.) ([Wikipedia][12])
* **Fragmentation:** only control frames (ping/pong/close) may interleave fragments; handle accordingly. ([Open My Mind][13])

### Server API (TS surface)

```ts
export interface WsAuth { tenantId:string; userId?:string; locale?:string; }
export function attachVoiceWsServer(httpServer: import('http').Server): void;

// Per-connection lifecycle
interface VoiceSession {
  id: string;
  auth: WsAuth;
  sendJson(msg:any): void;
  sendAudio(chunk:ArrayBuffer): void;
  close(code?:number, reason?:string): void;
}
```

### Behaviors

* **Auth.** Validate **JWT** (tenant, site, user claims) on `upgrade`. Reject if missing.
* **Backpressure.** If `socket.bufferedAmount` exceeds threshold, **drop non-critical deltas** (e.g., VU levels) and apply flow control to audio.
* **Ping/pong.** Send **ping** every 15 s; close idle connections that fail to pong within timeout. (That’s exactly what RFC 6455 suggests pings are for.) ([IETF Datatracker][10])
* **ASR/TTS coupling.**

  * Upstream audio → provider (e.g., OpenAI Realtime).
  * Downlink provider events → JSON to client; audio chunks → **binary** to client. (Realtime guide shows WS audio with JSON events.) ([OpenAI Platform][5])
* **Codec notes.** Prefer **Opus** at 48 kHz for interactivity (IETF RFC 6716); choose 20 ms frames. ([IETF Datatracker][4])

### Ops & health

* `/api/health` is separate (HTTP) but expose **internal gauges**: sessions, send queue sizes, ping RTT.
* Per-tenant rate limits on message rate and audio bps.

### Success criteria of health

* Median **send → server ingest** < 15 ms (LAN) measured by ping RTT.
* Zero frame leaks after Close handshake.
* Clean backpressure under 3G; no event loop stalls.

---

## End-to-end flow (happy path)

1. **Mic opens** with AEC/NS/AGC; we stream 20 ms **Opus** frames to `wsServer`. ([MDN Web Docs][2])
2. **ASR partials** arrive in ≤150 ms and render in gray; **visual meter** tracks VAD level.
3. Planner streams **agent deltas**; we start **TTS playback immediately**. (OpenAI Realtime supports streaming audio & events over WS.) ([OpenAI Platform][5])
4. User speaks mid-reply → **VAD active** → **barge-in**: pause/duck TTS, mark a new turn, continue capture.
5. Final comes back; we play the remainder and transition to Idle.

---

## Security & privacy

* **Permissions:** Mic access follows browser permission UI; document **Permissions Policy** if widget is cross-origin. ([MDN Web Docs][14])
* **No secrets in WS payloads.** IDs only; tokens stay server-side.
* **Recordings:** Off by default. If enabled, store **ephemeral** and scrub PII.

---

## Testing & DoD

## **turnManager**

* VAD toggles and levels stream at 20–50 Hz without starving UI thread (AudioWorklet). ([MDN Web Docs][1])
* Barge-in stops TTS within **≤50 ms** from VAD active.
* Opus encoder produces valid 20 ms frames at 48 kHz; packet loss simulation OK for 1–2 frames. (Opus designed for robust interactive audio.) ([IETF Datatracker][4])

## **visualFeedbackService**

* `aria-live` politeness verified; `prefers-reduced-motion` respected.
* Highlights map to actual DOM selectors from the site contract.

## **wsServer**

* JWT auth enforced on `upgrade`; cross-tenant isolation verified.
* **Ping/pong** works exactly as RFC 6455: Pong mirrors Ping payload; idle clients closed. ([IETF Datatracker][10], [MDN Web Docs][11])
* Backpressure tests: throttle network, ensure graceful degradation (drop VU, keep ASR/TTS core).

---

## Practical defaults

* `frameMs=20`, `bitrate≈16–24 kbps` (Opus mono speech). ([IETF Datatracker][4])
* `echoCancellation=true`, `noiseSuppression=true`, `autoGainControl=true` on mic. ([MDN Web Docs][2])
* WS ping interval 15 s; timeout 10 s; close on two consecutive misses. ([IETF Datatracker][10])
* Start with **OpenAI Realtime** for ASR+TTS; WS JSON event model as per docs. ([OpenAI Platform][5])

---

### Why these choices

* **AudioWorklet** is the web-native way to do low-latency capture/VAD safely off the main thread. ([MDN Web Docs][1])
* **Opus** is the IETF standard for interactive speech; 20 ms frames hit the sweet spot for latency vs. quality. ([IETF Datatracker][4])
* **WebSocket pings/pongs** give robust liveness & backpressure control; the RFC is explicit about echoing payloads. ([IETF Datatracker][10])
* **Realtime API** (OpenAI) already defines WS audio/event semantics; we align to reduce bespoke glue. ([OpenAI Platform][5])

If you want next, I can scaffold TypeScript stubs for these three files (types, events, state machine skeletons, WS adapter) so your agents can code against a concrete interface immediately.

[1]: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet?utm_source=chatgpt.com "AudioWorklet - MDN - Mozilla"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints?utm_source=chatgpt.com "Capabilities, constraints, and settings - MDN"
[3]: https://www.tech-invite.com/y65/tinv-ietf-rfc-6716.html?utm_source=chatgpt.com "RFC 6716 - Definition of the Opus Audio Codec"
[4]: https://datatracker.ietf.org/doc/html/rfc6716?utm_source=chatgpt.com "RFC 6716 - Definition of the Opus Audio Codec"
[5]: https://platform.openai.com/docs/guides/realtime-conversations?utm_source=chatgpt.com "Realtime conversations - OpenAI API"
[6]: https://opus-codec.org/?utm_source=chatgpt.com "Opus Codec"
[7]: https://platform.openai.com/docs/guides/voice-agents?utm_source=chatgpt.com "Voice agents - OpenAI API"
[8]: https://stackoverflow.com/questions/10585355/sending-websocket-ping-pong-frame-from-browser?utm_source=chatgpt.com "Sending websocket ping/pong frame from browser"
[9]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API?utm_source=chatgpt.com "Web Audio API - MDN - Mozilla"
[10]: https://datatracker.ietf.org/doc/html/rfc6455?utm_source=chatgpt.com "RFC 6455 - The WebSocket Protocol"
[11]: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers?utm_source=chatgpt.com "Writing WebSocket servers - MDN"
[12]: https://en.wikipedia.org/wiki/WebSocket?utm_source=chatgpt.com "WebSocket"
[13]: https://www.openmymind.net/WebSocket-Framing-Masking-Fragmentation-and-More/?utm_source=chatgpt.com "WebSocket Framing: Masking, Fragmentation and More"
[14]: https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints?utm_source=chatgpt.com "MediaTrackConstraints - MDN"
