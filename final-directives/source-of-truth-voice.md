# Voice & Real-Time UX

Summary

The Voice & Real-Time UX module of SiteSpeak delivers an interactive voice experience that feels instantaneous and natural. It covers everything from capturing the user’s speech, streaming it to the AI backend, to playing back the AI’s spoken responses – all in real time. The emphasis is on duplex audio streaming (the user and AI can speak/listen simultaneously) with ultra-low latency: users start hearing answers within a fraction of a second. The system supports “barge-in”, meaning the user can interrupt the AI’s speech by talking, and the system will immediately pause to listen. It also includes visual feedback elements (like a mic icon, levels, partial transcript text) to give users confidence that the system is hearing and thinking. In short, Voice & Real-Time UX is the layer that turns the static website into a live conversation partner, making interactions feel as fluid as talking to a person.

Application Architecture

Voice Capture & Turn Manager: On the client side, a TurnManager controls the microphone and audio pipeline. It uses the Web Audio API with an AudioWorklet to capture microphone input with minimal delay, perform Voice Activity Detection (VAD), and package audio into small frames (Opus encoded) for transmission
GitHub
GitHub
. The TurnManager is responsible for starting and stopping voice capture and handling barge-in events (when user speech is detected over the AI’s voice).

Realtime Transport (WebSocket Service): A dedicated WebSocket server on the backend maintains a live connection to each user for streaming audio and data. It receives the Opus audio frames from the client, and sends back partial text transcripts, final recognized text, and the AI’s response audio in chunks, as well as any control messages (like “action executed”)
GitHub
GitHub
. This WebSocket connection is duplex and uses a small binary protocol: audio frames go up, and JSON plus audio chunks come down. It implements heartbeat messages (ping/pong) to monitor liveness
GitHub
.

OpenAI Realtime Session: The backend connects to an OpenAI Realtime API (or similar streaming ASR/TTS service) which processes the incoming audio stream and produces live transcription and generated reply audio. This is the core that allows the AI’s thinking and speaking to happen in parallel. The service sends intermediate results (partial transcriptions of the user, partial AI reply text and corresponding audio) which we forward to the client immediately
GitHub
GitHub
.

Voice Widget UI & Visual Feedback: On the front-end (the website or admin interface), the voice widget presents the user with a microphone button and a status panel. This includes a live audio level meter (visualizing the loudness of speech), live captions of what the user is saying (partial ASR text that updates in real time), and indicators of the AI’s thinking and actions (e.g., “...” while the AI is formulating a response, or highlights on elements when the AI clicks something)
GitHub
GitHub
. The widget runs in a Shadow DOM to avoid CSS conflicts, and it can be embedded on any site with a single script tag.

Action Highlighter: As part of the voice UX, when the AI decides to execute an action like clicking a button or navigating, a visual highlight is briefly shown on that element (e.g., a glowing outline)
GitHub
GitHub
. This feedback helps the user see what the AI is doing on the page in response to voice commands, building trust that the assistant is doing the right thing.

Technical Details

Low-Latency Audio Pipeline – The client uses getUserMedia to get microphone access with recommended constraints: enable echo cancellation, noise suppression, and auto gain control if available
GitHub
GitHub
. The raw audio stream is immediately routed into an AudioWorkletProcessor – a special script that runs on the audio rendering thread, not the main UI thread
GitHub
GitHub
. This is critical because it means audio processing (like detecting speech) isn’t blocked by UI or script execution, achieving latency on the order of a few milliseconds. The AudioWorklet implements a simple VAD (voice activity detector), analyzing audio frames (~10–20 ms chunks) to decide if speech is present
GitHub
. As soon as voice is detected, it emits an event to indicate “speech started” and similarly when speech stops (with a hangover period to avoid chopping). The audio is encoded into Opus format frames of about 20 ms each – Opus is a high-quality, low-latency codec ideal for speech
GitHub
GitHub
 (used in WebRTC, etc.). These frames are sent via WebSocket to the server immediately in a continuous stream. The system targets about 150 ms or less from the time the user speaks to when the server receives an audio frame and starts transcription
GitHub
.

Duplex Streaming & Partial Results – The WebSocket (/api/voice endpoint on the API Gateway) upgrades from HTTP when the user engages the mic. We authenticate this upgrade with a JWT token to ensure the user is allowed and to identify the tenant/site (no API keys are exposed in the front-end; the token is short-lived)
GitHub
. Over this socket, the client sends binary messages for audio. The server responds with JSON messages for things like {type: "partial_asr", text: "hello wor"} (partial speech-to-text) and audio data for the AI’s spoken reply (often sent as binary frames prefixed or indicated by a message)
GitHub
GitHub
. Because of this design, the user can hear the AI’s answer while they are still speaking or immediately after – there’s no long silence. Typically, the first words from the AI can be heard ~300 ms after the user starts talking
GitHub
GitHub
 (assuming the network and ASR model are fast), which is our target for interactivity. The partial transcripts are crucial; they’re displayed in real time on the interface (“Searching for EDM concerts…” appears word-by-word as the user speaks)
GitHub
. If the user changes what they’re saying mid-sentence, the partial text updates accordingly.

Barge-In Handling – Barge-in is the ability for the user to interrupt the AI’s speech with their own voice. Our TurnManager is built to detect this: while the AI is speaking (we know this because we’re outputting audio to the speakers), the VAD is still monitoring the mic input. The moment VAD flags “user started talking” during the AI’s playback, the system triggers a barge_in event
GitHub
GitHub
. The client immediately pauses or ducks (lowers volume of) the AI’s TTS audio playback
GitHub
GitHub
. It then signals the backend to start a new turn. In practice, the WebSocket server or the orchestrator will treat that as the end of the previous turn – possibly cancelling the rest of the AI’s speech – and begin processing the user’s new utterance. This is implemented by the TurnManager emitting a barge_in message to the app, and our audio player either stops or greatly reduces volume on the existing TTS audio output within ~50 ms
GitHub
GitHub
. Barge-in is considered “table stakes” for modern voice assistants: the user should never be stuck waiting if they already got the info they need or want to correct the assistant.

WebSocket Protocol & Health – The voice WebSocket implements periodic ping/pong frames as per RFC 6455 to ensure the connection is alive
GitHub
GitHub
. Every, say, 15 seconds the server sends a small ping, and the client must respond with a pong (the server expects the pong payload to mirror the ping, per spec). If pongs are not received (within a timeout like 10 seconds), the server assumes the connection is dead and closes it
GitHub
GitHub
. This keeps ghost sessions from hanging around. The server also monitors the bufferedAmount of the socket (how much data is queued to send) – if it grows too large (meaning the client might not be reading or network is slow), it can start dropping non-critical messages (e.g., if volume level messages or partials are flooding, we can skip some) to apply backpressure
GitHub
GitHub
. The audio streaming is binary, text messages are JSON; frames are kept relatively small (a few kilobytes at most). We also ensure the WebSocket is using the correct subprotocol or content type as needed, and masking rules: by spec, frames from browser to server are always masked, and we abide by that
GitHub
.

Audio Playback & Output Handling – On receiving audio chunks for the AI’s speech, the client plays them with minimal delay. We have two strategies: if the chunks are in a playable format (like Opus in an Ogg container or WAV), we might use the Web Audio API or MediaSource Extensions to play seamlessly. In our case, since we already handle raw audio, we often choose to decode audio chunks via Web Audio. For example, using a WebCodecs decoder for Opus or feeding the bytes to another AudioWorklet that outputs to an AudioBufferSourceNode
GitHub
. Another simpler approach is to stream an `<audio>` tag source, but that can introduce buffering we don’t control. For fine control, we typically manage our own small jitter buffer: collecting a few packets (~40–100 ms of audio) then scheduling them one after the other. This ensures smooth playback even if network timing is irregular. Our widget thus either uses AudioBuffer in Web Audio or MediaStream, ensuring that as soon as the first chunk of TTS audio arrives, we start playing it. The result: the user hears a voice response that starts quickly and continues streaming out. If the user interrupts (barge-in), we immediately pause this playback. We also handle the end-of-speech detection – when the AI’s speech is done (or interrupted), the UI can transition back to idle/listening mode.

Visual Feedback Elements – The voice widget UI is carefully designed to be informative yet unobtrusive. Key elements:

A mic button that indicates state: idle (mic off), listening (mic on, capturing), and processing/responding. This might be color or icon changes. It is accessible, with an ARIA label like “Start voice assistant” and proper keyboard focus handling.

A level meter around the mic icon, showing live volume levels. This is driven by the AudioWorklet’s analysis of the mic input; the VAD can output a volume level (RMS or dB level) which we use to animate bars or a circle around the button
GitHub
. This gives immediate feedback that sound is being heard.

Partial Transcript Display: While the user is speaking, their words (as recognized so far) appear as live text (often in a subtle, gray italic style)
GitHub
GitHub
. When the final transcript is done, it turns solid (confirming “this is what we heard”). This helps the user confirm that the system understood them correctly. The element is marked with aria-live="polite" so that if the user is using a screen reader, the partial text is announced without interrupting other speech (important for accessibility)
GitHub
.

Thinking/Typing Indicator: While the AI is formulating an answer (and not yet speaking), the widget can show a “typing dots” animation or a message like “Thinking…”. This is akin to a chatbot indicator and reassures users that the system is working on a response even if there’s a pause of a couple seconds.

Action Highlights: When the AI takes an action (like navigates or clicks something), if the user’s view is on a page, a highlight briefly flashes on that element
GitHub
GitHub
. For example, if it’s adding an item to cart, the “Add to Cart” button might glow. This is done by the front-end receiving an event (via the same WebSocket or another channel) or the widget polling some state. The highlight is important for transparency – the user should see what the AI is doing. We implement it by injecting a small CSS or using the existing DOM (the actions have known data-action selectors, so we can find the element and apply a temporary CSS animation).

Edge Cases & Audio Quality – We request the microphone at 48 kHz which matches the OpenAI model’s expected sample rate (to avoid resampling overhead). The Opus encoder is set to a bitrate that balances quality and bandwidth (often around 16–24 kbps for voice, which is plenty for speech)
GitHub
. We also consider packet loss: Opus can handle a couple of missing frames per second without noticeable issues. We don’t implement our own forward error correction beyond what Opus gives, but we ensure the jitter buffer can stretch a bit if timing is off. If the network is very bad, the WebSocket might drop – in which case our client will notice and attempt to reconnect, or at least change the UI state to indicate it’s offline. The user might then try again.

Permissions and Security – The voice widget must obtain mic permission from the user via the browser’s standard prompt (we can’t bypass that). We instruct users to allow it by explaining the benefit. For cross-origin iframes (like if the widget is embedded from a different domain), we need to use the Permissions Policy header to allow microphone access in iframes, and allow="microphone" on the iframe element hosting the widget
GitHub
. Also, since audio can contain personal data, we by default do not store raw recordings on the server (or only store them ephemerally for short durations for possible debugging, then delete). If recording is an option (for analytics or transcripts), it is off by default and explicitly opt-in, and even then we scrub or anonymize where possible
GitHub
. On the network, all voice WebSocket traffic is wss (TLS) so it’s encrypted in transit.

Best Practices

Use AudioWorklet for Capture: Always capture microphone input on a dedicated audio thread (AudioWorklet) for lowest latency
GitHub
. This prevents UI jank from affecting voice capture and is specifically recommended for real-time audio processing.

Frame Audio in Small Chunks: Use ~20ms Opus frames for streaming
GitHub
GitHub
. Small frames reduce latency and Opus is designed to give good quality at these durations. Avoid waiting for large buffers of audio – send continuously to keep the pipeline full.

Enable Barge-In:** Design the system to allow interruption. The assistant should immediately pause TTS output when the user starts speaking again
GitHub
. This means monitoring mic even during playback and coordinating the client and server to handle an interrupt as a new turn.

Stream Partial Results: Don’t wait for the user to finish speaking to start processing. Partial ASR (automatic speech recognition) results should be sent to the client and optionally displayed
GitHub
GitHub
. This not only gives the user feedback but also can allow the AI to start formulating a response sooner (some systems do incremental intent recognition).

Low Latency First Response: Aim for the first spoken response token ≤ 300 ms from user speech start
GitHub
. Achieving this requires tight integration with a streaming speech-to-text and text-to-speech provider and possibly sending an initial “acknowledgment” sound or phrase if a full answer isn’t ready. Hitting this target makes the experience feel instantaneous.

Core Web Vitals for Voice: Treat voice interaction performance like web performance. Monitor metrics like round-trip latency (user speaks to hearing AI) as the “INP” of voice. Ensure the UI thread isn’t blocked (so animations remain smooth) – e.g., use Web Workers for heavy tasks. Keep memory usage in check to avoid device slowdowns.

Accessibility & ARIA: Implement all voice UI elements with accessibility in mind. Use aria-live="polite" for dynamic text like transcripts
GitHub
 so screen readers announce them appropriately. Ensure the mic button is keyboard-focusable and has an ARIA label (e.g., “Activate voice assistant”). Respect prefers-reduced-motion for any visualizations (e.g., don’t flash things aggressively if the user opts out of animation).

Security: JWT and Origin Checks: Never expose API keys or secrets in the front-end; use short-lived JWT tokens for the voice WebSocket auth. The WebSocket endpoint should validate the token on connect. Also, any messages containing user-identifying info or commands should be validated server-side (e.g., ensure the siteId in a message matches the connection’s authenticated site). On the client’s side, configure the targetOrigin for any cross-window messaging (like if the widget is in an iframe controlling the parent page) to avoid eavesdropping
GitHub
GitHub
.

Robust Connection Management: Implement heartbeats (ping/pong) and auto-reconnect logic. The voice connection is long-lived; handle network blips by attempting to reconnect and perhaps buffering a short amount of recent audio to resend if needed. Clean up resources on disconnect (stop the mic, etc.).

Testing with Real Devices: Test the voice UX on various devices (high-end, low-end, mobile, desktop) and in different noise conditions. Fine-tune VAD thresholds for a good balance between quickly activating on speech and not being too sensitive to background noise
GitHub
. For mobile, ensure that if the screen locks or app goes background, the behavior is defined (usually we stop or pause the voice session).

Privacy Considerations: Clearly indicate when the mic is active (e.g., mic icon changes) and only listen when expected (push-to-talk or explicit tap, unless user enabled a wake-word – which we don’t have here by default). Do not keep any raw voice data longer than necessary. Adhere to consent for analytics – if recording or transcripts are stored, inform the user. Also, avoid transmitting more data than needed: e.g., if only voice audio is needed, don’t send video or other sensor data.

Optimize TTS for Speed: Use streaming TTS or pre-warm the TTS engine with a silent request so the first actual response is faster. If using a cloud TTS that’s too slow, consider a local on-device TTS for the first simple acknowledgments (“Sure, searching…”) while the cloud one generates the full answer.

Frontend Performance: The voice widget should be lightweight (ideally a few tens of KB of JS) since it loads on every site. Use Shadow DOM to encapsulate styles. Defer loading heavy parts until user actually clicks the mic (e.g., don’t initialize audio capture or WebSocket until needed to save resources). Also ensure that integrating the widget doesn’t negatively impact the site’s Core Web Vitals (it should idle when not in use).

Graceful Degradation: If the browser doesn’t support AudioWorklet (older browsers), have a fallback (like using ScriptProcessor, albeit with higher latency). If the WebSocket fails, perhaps provide a fallback mode (maybe a regular REST API with full-duplex polyfill or at least an error message to user). And always allow the user to fallback to typing if voice fails – the UI could provide a text input as a backup.

Acceptance Criteria / Success Metrics

First Response Latency: In production, the median time from when the user finishes speaking (or even from start of speech) to the start of the assistant’s spoken response is ≤ 300 ms, with partial words or sounds often earlier
GitHub
. Measured by: instrumentation events (client sends an event when user speaks, and when first TTS audio plays) aggregated in analytics – p50 and p90 should meet targets (e.g., p90 maybe ≤ 500 ms).

Barge-in Reaction Time: When the user interrupts, the system halts AI speech within ≤ 50 ms
GitHub
GitHub
, and begins processing the new query immediately. Test: During a long AI response, start speaking a trigger phrase; verify via logs that audio playback stopped almost instantly and new ASR started. Also, the AI should not complete the old action (e.g., if it was about to navigate, it should cancel that if appropriate).

Streaming Feedback: Users see visual feedback of their speech and the AI’s thinking in real time. Acceptance: In usability testing, users consistently report that “the system clearly shows it’s hearing me (levels and my words appear) and I see when it’s working or doing something.” Technically, this means partial transcripts appear within ~<150 ms of speech start (for at least 75% of utterances)
GitHub
GitHub
, and the level meter is responsive to talking. We also ensure that every partial and final transcript is accurate as per the ASR output (no missing or out-of-order updates).

Audio Quality & Continuity: The played TTS audio is clear and without jarring gaps. Criteria: No more than, say, 1% of user sessions encounter an audible glitch or cut-off in the AI’s speech. This is monitored by user feedback or by internal metrics (e.g., checking if audio frames were dropped frequently). Additionally, voice responses use a natural sounding voice and correct language (matching the site’s locale when possible).

Stability of Connection: The voice connection remains stable during typical interactions. Metric: WebSocket drop rate – less than a certain small percentage (e.g., < 0.1%) of voice sessions should terminate unexpectedly due to network issues. And if they do, the client properly indicates it (e.g., changing the mic icon or showing “Reconnecting…”).

Security Checks Passing: Penetration testing and code review show that the voice service does not expose vulnerabilities. For example, attempt to use the voice WebSocket with a forged token or from a different origin – it should reject. Ensure that no sensitive user data is leaking in messages (we strip or hash IP addresses, etc.). Acceptance: all OWASP top 10 relevant to websockets (like injection via audio metadata or DoS via flooding) are mitigated. Ping/pong respects the protocol (verified by unit tests that Pong mirrors Ping payload)
GitHub
GitHub
.

Accessibility Verification: The voice UI is operable and understandable by users with disabilities. Test: Using a screen reader, confirm that the mic button and transcript have proper labels (the transcript field should be announced as the user’s dictated text, etc.). Using only keyboard, a user can activate voice and get results (the mic button can be focused and triggered with space/enter). Also test high contrast mode and reduced motion settings: the UI should adjust accordingly (no essential info lost with animations off). Achieve WCAG 2.1 AA compliance for the widget (color contrasts, focus indicators, etc.).

Resource Footprint: The voice feature should not consume excessive resources on the client. Measure: When idle, the widget uses negligible CPU. During a voice interaction, CPU usage might spike (for encoding/decoding) but should not freeze the page (e.g., keep under 50 ms per frame on average for audio processing
GitHub
GitHub
). Memory usage remains modest (no large leaks after many interactions). We consider it acceptable if after e.g. 10 minutes of continuous use, the memory is stable (any buffers are freed).

User Satisfaction: In beta tests or user studies, the voice assistant is responsive and enjoyable to use – specifically, users don’t feel they have to wait or repeat themselves often. While subjective, we can gauge satisfaction via feedback forms or by usage frequency (if people find it too slow or inaccurate, they won’t use it again). Goal: a high percentage of users engage with voice successfully and a low bounce rate (not many give up immediately).

Error Handling: If speech recognition fails (no text or gibberish) or if the AI doesn’t respond, the system should time out and provide a graceful message (like “Sorry, I didn’t catch that.”). Acceptance: simulate no audio input or nonsense input, ensure the system prompts again appropriately. Likewise, if the AI’s answer audio fails to play (say a chunk missing), the UI detects silence and possibly shows a message. No infinite waiting states.

Integration with Actions: Verify that when the voice command includes an actionable request (e.g., “click the first result” or “add that to cart”), the system triggers the corresponding site action through the orchestrator and the highlight is shown. Acceptance: In end-to-end testing on a sample site, voice commands that involve navigation or clicking indeed result in the correct page change or action (and are highlighted). This ties voice UX with the tool system – ensuring that pipeline is connected and quick (optimistic actions should occur concurrently with voice).

Cross-Browser/Device Support: The voice UX meets the criteria on all modern browsers (Chrome, Firefox, Safari, Edge) and on mobile (Android Chrome, iOS Safari WKWebView). Test: run through smoke tests on each; the experience should be consistent. Any exceptions (like Safari not supporting certain codecs or AudioWorklet on older versions) are handled with fallbacks or documented limits. Achieve broad compatibility or at least degrade gracefully where full features aren’t available
