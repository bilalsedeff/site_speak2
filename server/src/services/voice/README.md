# Voice Services - Real-time Voice System

## Overview

Complete voice interaction system providing low-latency, full-duplex voice conversations with AI assistants. Built for production-grade performance with ≤300ms first token latency and real-time barge-in capabilities.

## Architecture

```plaintext
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│  Client (Browser)   │────│   WebSocket Layer   │────│   Voice Services    │
│                     │    │                      │    │                     │
│ • AudioWorklet      │    │ • Raw WebSocket      │    │ • VoiceOrchestrator │
│ • MediaRecorder     │    │   (Binary Audio)     │    │ • TurnManager       │
│ • Web Audio API     │    │ • Socket.IO          │    │ • OpusFramer        │
│                     │    │   (JSON Messages)    │    │ • OpenAI Realtime   │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
                                      │
                           ┌──────────▼──────────┐
                           │  AI Services        │
                           │                     │
                           │ • UniversalAI       │
                           │ • Knowledge Base    │
                           │ • Retrieval System  │
                           └─────────────────────┘
```

## Core Components

### 1. VoiceOrchestrator

**File**: `VoiceOrchestrator.ts`
**Purpose**: Central coordination service that manages voice sessions, WebSocket connections, and AI integration.

```typescript
// Start a voice session
const session = await voiceOrchestrator.startVoiceSession({
  tenantId: 'tenant-123',
  siteId: 'site-456',
  userId: 'user-789'
});

// Process voice input
await voiceOrchestrator.processVoiceInput(sessionId, audioBuffer);
```

**Key Features**:

- Session lifecycle management (create, manage, cleanup)
- Performance monitoring and metrics
- Integration with AI services through UniversalAIAssistantService
- WebSocket connection coordination

### 2. TurnManager

**File**: `turnManager.ts`
**Purpose**: Dialog orchestration with VAD, STT/TTS, and barge-in handling.

```typescript
const turnManager = new TurnManager({
  locale: 'en-US',
  vad: { threshold: 0.01, hangMs: 800 },
  opus: { frameMs: 20, bitrate: 16000 },
  tts: { enable: true, duckOnVAD: true },
  transport: webSocketTransport
});

// Listen for events
turnManager.on('vad', ({ active, level }) => {
  console.log('Voice activity:', active, level);
});

turnManager.on('partial_asr', ({ text, confidence }) => {
  console.log('Partial recognition:', text);
});
```

**Performance Targets**:

- First token: ≤300ms
- Partial ASR: ≤150ms  
- Barge-in response: ≤50ms

### 3. OpusFramer

**File**: `opusFramer.ts`
**Purpose**: High-efficiency audio encoding with 20ms Opus frames for optimal network performance.

```typescript
const opusFramer = new OpusFramer({
  sampleRate: 48000,
  frameMs: 20,
  channels: 1,
  bitrate: 16000,
  enableFEC: true
});

// Process PCM audio
await opusFramer.processPCMFrame({
  data: pcmData,
  sampleRate: 48000,
  channels: 1,
  timestamp: Date.now()
});
```

**Features**:

- 20ms frame optimization for low latency
- Forward Error Correction (FEC) for packet loss tolerance
- Performance monitoring and adaptive bitrate
- Real-time frame validation

### 4. OpenAI Realtime Client

**File**: `openaiRealtimeClient.ts`
**Purpose**: Direct integration with OpenAI's Realtime API for streaming STT/TTS.

```typescript
const client = new OpenAIRealtimeClient({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-realtime-preview',
  voice: 'alloy',
  inputAudioFormat: 'pcm16',
  outputAudioFormat: 'pcm16'
});

await client.connect();
await client.sendAudio(audioBuffer);
```

**Capabilities**:

- Streaming speech-to-text with partial results
- Real-time text-to-speech generation
- Function calling and tool integration
- Session management and error recovery

### 5. OpusEncoder

**File**: `OpusEncoder.ts`
**Purpose**: Production-grade Opus audio encoding with fallback support.

```typescript
const encoder = new OpusEncoder({
  sampleRate: 48000,
  channels: 1,
  frameSize: 960,
  bitrate: 16000
});

const encoded = await encoder.encode(pcmData);
```

### 6. Visual Feedback Service

**File**: `visualFeedbackService.ts`
**Purpose**: Coordinates UI visual feedback during voice interactions.

```typescript
visualFeedbackService.start();
visualFeedbackService.setVADState(true, 0.8);
visualFeedbackService.setListeningState('partial');
```

## WebSocket Architecture

### Raw WebSocket Server

**File**: `../modules/voice/infrastructure/websocket/RawWebSocketServer.ts`
**Purpose**: RFC 6455 compliant WebSocket server optimized for binary audio streaming.

**Features**:

- JWT authentication on WebSocket upgrade
- 20ms Opus frame streaming with VAD
- Ping/pong health monitoring
- OpenAI Realtime API integration
- Tool calling support (search, navigation, info)

**Endpoints**:

- `/voice-ws` - Binary audio streaming endpoint

### Socket.IO Handler

**File**: `../modules/voice/infrastructure/websocket/VoiceWebSocketHandler.ts`
**Purpose**: Socket.IO based messaging for JSON communication and fallback support.

**Features**:

- JSON message handling
- Session management
- Fallback for environments without Raw WebSocket support
- Integration with VoiceOrchestrator

**Namespaces**:

- `/voice` - Voice interaction namespace

### Integrated WebSocket Management

**Implementation**: Built into `VoiceOrchestrator.ts`
**Purpose**: Unified WebSocket server management integrated directly into the voice orchestrator.

```typescript
const orchestrator = new VoiceOrchestrator({
  httpServer: server,
  enableRawWebSocket: true,
  enableSocketIO: true,
  paths: {
    rawWebSocket: '/voice-ws',
    socketIO: '/socket.io'
  }
});

orchestrator.setAIAssistantService(universalAIAssistant);
await orchestrator.start();
```

## Configuration Presets

### High Performance

```typescript
const config = VoicePresets.highPerformance;
// Target: 200ms first token, 100ms partials, 30ms barge-in
```

### Balanced (Default)

```typescript
const config = VoicePresets.balanced;
// Target: 300ms first token, 150ms partials, 50ms barge-in
```

### Conservative

```typescript
const config = VoicePresets.conservative;  
// Target: 500ms first token, 250ms partials, 100ms barge-in
```

## Integration Examples

### Basic Voice Session

```typescript
import { voiceOrchestrator } from './voice/VoiceOrchestrator';

// Start session
const session = await voiceOrchestrator.startVoiceSession({
  tenantId: 'tenant-123',
  siteId: 'site-456'
});

// Handle audio input
session.on('audio_input', async (audioData) => {
  await voiceOrchestrator.processVoiceInput(session.id, audioData);
});

// Handle transcription
session.on('transcription', (result) => {
  console.log('User said:', result.text);
});
```

### Custom Transport Implementation

```typescript
class CustomVoiceTransport implements VoiceTransport {
  async send(data: ArrayBuffer | object): Promise<void> {
    if (data instanceof ArrayBuffer) {
      // Send binary audio data
      await this.sendBinary(data);
    } else {
      // Send JSON message
      await this.sendJSON(data);
    }
  }

  on(event: string, callback: (data: any) => void): void {
    this.eventEmitter.on(event, callback);
  }

  disconnect(): void {
    this.cleanup();
  }
}
```

## Performance Monitoring

### Metrics Collection

```typescript
// Get voice services health
const health = getVoiceServicesHealth();
console.log('Voice system status:', health.status);

// Get session metrics
const metrics = voiceOrchestrator.getMetrics();
console.log('Active sessions:', metrics.activeSessions);
console.log('Average response time:', metrics.avgResponseTime);
```

### Performance Targets

- **Connection Setup**: ≤100ms
- **First Audio Token**: ≤300ms
- **ASR Partial Results**: ≤150ms
- **Barge-in Response**: ≤50ms
- **Audio Frame Processing**: ≤20ms
- **WebSocket Latency**: ≤10ms

## Error Handling

### Session Errors

```typescript
session.on('error', (error) => {
  if (error.code === 'AUDIO_PROCESSING_FAILED') {
    // Restart audio processing
    await session.restartAudioProcessing();
  } else if (error.code === 'CONNECTION_LOST') {
    // Attempt reconnection
    await session.reconnect();
  }
});
```

### Automatic Recovery

- WebSocket reconnection with exponential backoff
- Opus encoder fallback to PCM
- Session cleanup on connection loss
- Graceful degradation for network issues

## Development

### Environment Setup

```bash
# Install dependencies
npm install

# Set environment variables
OPENAI_API_KEY=your-api-key-here
JWT_SECRET=your-jwt-secret-here

# Start development server
npm run dev:server
```

### Testing

```bash
# Run type checking
npm run type-check

# Run voice system tests
npm run test:voice

# Run performance tests
npm run test:performance
```

### Debugging

```typescript
// Enable detailed logging
process.env.VOICE_DEBUG = 'true';

// Monitor frame processing
opusFramer.on('frame_encoded', (stats) => {
  console.log('Frame stats:', stats);
});

// Track session events
voiceOrchestrator.on('session_event', (event) => {
  console.log('Session event:', event);
});
```

## Deployment

### Production Considerations

- Enable HTTPS for microphone access
- Configure proper JWT secrets
- Set up monitoring and alerting
- Configure rate limiting
- Enable audio compression
- Set up CDN for audio assets

### Docker Configuration

```dockerfile
# Enable audio processing in containers
RUN apt-get update && apt-get install -y \
    libopus0 \
    libopus-dev \
    ffmpeg
```

## Troubleshooting

### Common Issues

#### **1. Microphone Access Denied**

- Ensure HTTPS in production
- Check browser permissions
- Verify domain allowlist

#### **2. High Latency**

- Check network conditions
- Monitor audio buffer sizes
- Verify Opus frame configuration
- Check server CPU usage

#### **3. Audio Cutting Out**

- Adjust VAD thresholds
- Check packet loss rates
- Verify WebSocket stability
- Monitor memory usage

#### **4. Connection Drops**

- Check firewall settings
- Verify WebSocket support
- Monitor ping/pong health
- Check authentication tokens

### Performance Tuning

**Audio Settings**:

- Frame size: 20ms for low latency, 40ms for quality
- Sample rate: 48kHz recommended
- Bitrate: 16kbps for speech, 24kbps for quality

**Network Settings**:

- Enable compression for large payloads
- Use Raw WebSocket for audio streams
- Implement proper backpressure handling

**Server Settings**:

- Increase WebSocket connection limits
- Configure proper garbage collection
- Monitor memory usage patterns
- Set up connection pooling

## License

Part of SiteSpeak platform. See main LICENSE file for details.
