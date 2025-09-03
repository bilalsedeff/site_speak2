# Voice Services Documentation

## Overview

SiteSpeak's voice services provide real-time, duplex voice interactions with the following capabilities:

- **Real-time speech-to-text** with partial results (≤150ms latency)
- **Streaming text-to-speech** with instant barge-in support (≤50ms)
- **Voice Activity Detection** using AudioWorklet for low-latency processing
- **Opus audio framing** at 20ms intervals for optimal network efficiency
- **Raw WebSocket transport** for minimal overhead
- **Visual feedback system** for UI coordination during voice interactions

## Architecture

### Core Components

```plaintext
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   TurnManager   │────│ VoiceOrchestrator│────│ OpenAI Realtime │
│  (AudioWorklet, │    │   (Coordinator)  │    │   API Client    │
│   VAD, Barge-in)│    └──────────────────┘    └─────────────────┘
└─────────────────┘             │
                                │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ VisualFeedback  │────│                  │────│  WebSocket      │
│   Service       │    │                  │    │   Transport     │
└─────────────────┘    │                  │    └─────────────────┘
                       │                  │
┌─────────────────┐    │                  │    ┌─────────────────┐
│  Opus Framer    │────┘                  └────│ Existing Voice  │
│ (20ms frames)   │                            │   Components    │
└─────────────────┘                            └─────────────────┘
```

### Data Flow

1. **Audio Input**: AudioWorklet captures microphone → VAD detection → Opus framing
2. **Transport**: WebSocket sends binary frames → OpenAI Realtime API
3. **Processing**: Streaming STT → AI orchestrator → Streaming TTS
4. **Output**: Real-time audio playback + visual feedback
5. **Barge-in**: VAD detects speech → Instant TTS interruption

## Performance Targets

- **First token/audio**: ≤300ms from speech start
- **Partial ASR latency**: ≤150ms median
- **Barge-in response**: ≤50ms from VAD detection
- **Audio quality**: 48kHz, 16-bit, Opus-encoded
- **Packet loss tolerance**: 1-2 lost frames without artifacts

## API Reference

### VoiceOrchestrator

Main coordination service for voice interactions.

```typescript
import { voiceOrchestrator, VoicePresets } from '@/services/voice';

// Initialize with preset
await voiceOrchestrator.start();

// Start voice session for WebSocket connection
const sessionId = await voiceOrchestrator.startVoiceSession(wsSession);

// Get session status
const session = voiceOrchestrator.getSession(sessionId);

// Stop session
await voiceOrchestrator.stopVoiceSession(sessionId);
```

### Configuration Options

```typescript
interface VoiceOrchestratorConfig {
  turnManager: {
    locale?: string;           // BCP-47 locale
    vad: {
      threshold: number;       // 0.001-0.1, voice detection sensitivity  
      hangMs: number;         // Silence duration before turn end
    };
    opus: {
      frameMs: 20 | 40;       // Frame duration (20ms recommended)
      bitrate?: number;       // 16-24kbps for speech
    };
    tts: {
      enable: boolean;
      duckOnVAD: boolean;     // Enable barge-in
    };
  };
  realtime: {
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    inputAudioFormat: 'pcm16';
    outputAudioFormat: 'pcm16';
  };
  transport: {
    port: number;             // WebSocket port
    maxConnections: number;
  };
  performance: {
    targetFirstTokenMs: number;    // Performance target
    targetPartialLatencyMs: number;
    targetBargeInMs: number;
  };
}
```

### Configuration Presets

```typescript
// High performance - optimized for speed
VoicePresets.highPerformance

// Balanced - good performance with efficiency  
VoicePresets.balanced

// Conservative - optimized for reliability
VoicePresets.conservative
```

## WebSocket API

### Connection

```plaintext
wss://your-domain.com/voice-ws?token=<jwt-token>
```

**Authentication**: JWT token with `tenantId`, `siteId`, `userId` claims.

### Message Format

**Binary Messages** (Audio):

```plaintext
ArrayBuffer: Opus-encoded audio frames (20ms, 48kHz)
```

**JSON Messages** (Control):

```typescript
// Text input
{
  type: 'text_input',
  text: string,
  timestamp: number
}

// Control commands  
{
  type: 'control',
  action: 'start_recording' | 'stop_recording' | 'clear_session',
  params?: any,
  timestamp: number
}
```

### Server Events

```typescript
// Session ready
{
  type: 'ready',
  data: {
    sessionId: string,
    supportedFormats: string[],
    maxFrameSize: number,
    sampleRates: number[]
  }
}

// Voice activity detection
{
  type: 'vad',
  active: boolean,
  level: number  // 0-1 normalized audio level
}

// Partial transcription
{
  type: 'partial_asr',
  text: string,
  confidence?: number
}

// Final transcription  
{
  type: 'final_asr',
  text: string,
  lang: string
}

// Agent response streaming
{
  type: 'agent_delta',
  data: any
}

// TTS audio chunk (binary)
ArrayBuffer: PCM audio data for playback

// Barge-in detected
{
  type: 'barge_in'
}

// Errors
{
  type: 'error',
  code: string,
  message: string
}
```

## Integration Guide

### 1. Server Integration

```typescript
import { initializeVoiceServices, VoicePresets } from '@/services/voice';
import { createServer } from 'http';

// Initialize voice services
const httpServer = createServer(app);
await initializeVoiceServices({
  ...VoicePresets.balanced,
  transport: { port: 8080 }
});

// Start server
httpServer.listen(3000);
```

### 2. Client Integration  

```typescript
// Connect to voice WebSocket
const ws = new WebSocket('wss://api.example.com/voice-ws?token=' + jwt);

// Setup audio context and worklet
const audioContext = new AudioContext({ sampleRate: 48000 });
await audioContext.audioWorklet.addModule('/audio-worklet-processor.js');

// Handle voice events
ws.addEventListener('message', (event) => {
  if (event.data instanceof ArrayBuffer) {
    // Play TTS audio
    playAudioChunk(event.data);
  } else {
    // Handle JSON events
    const message = JSON.parse(event.data);
    handleVoiceEvent(message);
  }
});

// Send audio frames
function sendAudioFrame(audioData: ArrayBuffer) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(audioData);
  }
}
```

### 3. React Component Integration

```tsx
import { useVoice } from '@/providers/VoiceProvider';
import { VoiceAssistant } from '@/components/voice/VoiceAssistant';

function App() {
  return (
    <VoiceProvider>
      <div className="app">
        {/* Your app content */}
        <VoiceAssistant />
      </div>
    </VoiceProvider>
  );
}
```

## Visual Feedback System

The `VisualFeedbackService` provides UI coordination:

```typescript
import { visualFeedbackService } from '@/services/voice';

// Update microphone state
visualFeedbackService.updateMicState('listening', sessionId);

// Show audio level
visualFeedbackService.updateAudioLevel(0.5, sessionId);

// Display partial transcript
visualFeedbackService.showPartialTranscript('Hello world', 0.8, sessionId);

// Highlight UI element during tool execution
const highlightId = visualFeedbackService.highlightElement(
  '.purchase-button',
  { type: 'glow', duration: 2000 },
  sessionId
);

// Show error toast
visualFeedbackService.showErrorToast({
  type: 'error',
  title: 'Connection Lost',
  message: 'Reconnecting to voice services...',
  action: {
    label: 'Retry',
    callback: () => reconnect()
  }
}, sessionId);
```

## Performance Monitoring

### Metrics Collection

```typescript
// Get orchestrator metrics
const status = voiceOrchestrator.getStatus();

console.log({
  activeSessions: status.activeSessions,
  avgFirstTokenLatency: status.performance.avgFirstTokenLatency,
  avgPartialLatency: status.performance.avgPartialLatency,
  avgBargeInLatency: status.performance.avgBargeInLatency,
  errorRate: status.performance.errorRate
});

// Get session-specific metrics
const session = voiceOrchestrator.getSession(sessionId);
console.log({
  totalTurns: session.metrics.totalTurns,
  errors: session.metrics.errors.length,
  firstTokenLatencies: session.metrics.performance.firstTokenLatencies
});
```

### Health Monitoring

```typescript
import { getVoiceServicesHealth } from '@/services/voice';

// Health check endpoint
app.get('/api/voice/health', (req, res) => {
  const health = getVoiceServicesHealth();
  res.json(health);
});
```

## Troubleshooting

### Common Issues

**High Latency (>300ms first token)**:

- Check OpenAI API key validity
- Verify network connectivity to OpenAI
- Monitor CPU usage (AudioWorklet processing)
- Check WebSocket connection stability

**Audio Quality Issues**:

- Verify microphone permissions granted
- Check sample rate compatibility (48kHz preferred)
- Monitor packet loss rates
- Validate Opus frame integrity

**Barge-in Not Working**:

- Verify VAD threshold settings (try 0.005-0.02 range)
- Check TTS duck settings (`duckOnVAD: true`)
- Monitor AudioWorklet message passing
- Validate TTS audio playback state

**Memory Leaks**:

- Ensure sessions are properly stopped
- Check AudioContext cleanup
- Monitor WebSocket connection cleanup
- Validate event listener removal

### Debug Mode

```typescript
// Enable verbose logging
process.env.VOICE_DEBUG = 'true';

// Performance warnings for latency targets
process.env.VOICE_PERFORMANCE_WARNINGS = 'true';

// Audio processing debug info
process.env.AUDIO_WORKLET_DEBUG = 'true';
```

### Performance Tuning

**For Low Latency** (≤200ms):

```typescript
{
  turnManager: {
    vad: { threshold: 0.005, hangMs: 400 },
    opus: { frameMs: 20, bitrate: 24000 }
  },
  performance: {
    targetFirstTokenMs: 200,
    targetPartialLatencyMs: 100,
    targetBargeInMs: 30
  }
}
```

**For Reliability** (Network issues):

```typescript
{
  turnManager: {
    vad: { threshold: 0.02, hangMs: 1000 },
    opus: { frameMs: 40, bitrate: 12000 }
  },
  performance: {
    targetFirstTokenMs: 500,
    targetPartialLatencyMs: 250,
    targetBargeInMs: 100
  }
}
```

## Security Considerations

- **JWT Authentication**: All WebSocket connections require valid tenant JWT
- **Rate Limiting**: Built-in per-tenant message and audio rate limits
- **Tenant Isolation**: Strict separation of voice sessions by tenant
- **Audio Privacy**: No persistent audio storage, streaming only
- **API Key Security**: OpenAI keys handled server-side only

## Browser Compatibility

- **Chrome**: 66+ (AudioWorklet support)
- **Firefox**: 76+ (AudioWorklet support)
- **Safari**: 14.1+ (AudioWorklet support)
- **Edge**: 79+ (AudioWorklet support)

**Required Permissions**:

- Microphone access
- Secure context (HTTPS) for production

## Deployment Notes

1. **Environment Variables**:

   ```plaintext
   OPENAI_API_KEY=sk-...
   VOICE_WS_PORT=8080
   VOICE_DEBUG=false
   ```

2. **File Requirements**:
   - `/client/public/audio-worklet-processor.js` must be served
   - WebSocket endpoint configured in reverse proxy

3. **Resource Requirements**:
   - CPU: AudioWorklet processing (moderate)
   - Memory: ~10-50MB per active session
   - Network: ~16-24kbps per voice session

4. **Monitoring**:
   - Health check: `GET /api/voice/health`
   - Metrics: `GET /api/voice/status`
   - Session info: `GET /api/voice/session/:id`
