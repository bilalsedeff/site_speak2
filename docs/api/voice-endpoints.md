# Voice API Endpoints

## Overview

SiteSpeak provides both REST API endpoints and WebSocket connections for voice interactions. This document covers all available endpoints, request/response formats, and integration patterns.

## Authentication

All voice endpoints require JWT authentication with the following claims:

```json
{
  "tenantId": "uuid",
  "siteId": "uuid", 
  "userId": "uuid",
  "locale": "en-US"
}
```

Include the token in requests:

- **REST**: `Authorization: Bearer <jwt-token>`
- **WebSocket**: Query parameter `?token=<jwt-token>`

## REST API Endpoints

### Health & Status

#### `GET /api/voice/health`

**Description**: Check voice services health status

**Response**:

```json
{
  "status": {
    "isRunning": true,
    "activeSessions": 3,
    "performance": {
      "avgFirstTokenLatency": 245,
      "avgPartialLatency": 120,
      "avgBargeInLatency": 35,
      "errorRate": 0.02
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "components": {
    "orchestrator": "healthy",
    "transport": "healthy", 
    "realtime": "healthy",
    "audioProcessing": "healthy",
    "visualFeedback": "healthy"
  }
}
```

#### `GET /api/voice/status`

**Description**: Get detailed voice services status and metrics

**Response**:

```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "activeSessions": 3,
    "performance": {
      "totalSessions": 157,
      "avgFirstTokenLatency": 245,
      "avgPartialLatency": 120,
      "avgBargeInLatency": 35,
      "errorRate": 0.02
    },
    "sessions": [
      {
        "id": "session-123",
        "tenantId": "tenant-456",
        "status": "listening",
        "turns": 5,
        "errors": 0
      }
    ],
    "components": {
      "wsServer": {
        "totalConnections": 157,
        "activeConnections": 3,
        "totalMessages": 45231,
        "errors": 2
      },
      "visualFeedback": {
        "isActive": true,
        "micState": "listening",
        "activeHighlights": ["highlight-1"],
        "activeToasts": [],
        "activeStreams": []
      },
      "opusFramer": {
        "totalFrames": 12847,
        "encodedFrames": 12840,
        "droppedFrames": 7,
        "avgEncodingTime": 2.3,
        "avgFrameSize": 320
      }
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Session Management

#### `GET /api/voice/session/:sessionId`

**Description**: Get information about a specific voice session

**Parameters**:

- `sessionId` (path): Voice session ID

**Response**:

```json
{
  "success": true,
  "data": {
    "id": "session-123",
    "tenantId": "tenant-456", 
    "siteId": "site-789",
    "userId": "user-101",
    "status": "listening",
    "metrics": {
      "sessionsStarted": "2024-01-15T10:25:00.000Z",
      "totalTurns": 5,
      "avgResponseTime": 340,
      "errors": [],
      "performance": {
        "firstTokenLatencies": [245, 267, 223],
        "partialLatencies": [120, 135, 98],
        "bargeInLatencies": [35, 42, 28]
      }
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Error Response**:

```json
{
  "success": false,
  "error": "Session not found",
  "sessionId": "session-123"
}
```

### Voice Processing (Batch/Legacy)

#### `POST /api/voice/process-audio`

**Description**: Process uploaded audio file (batch mode for fallback)

**Headers**:

- `Content-Type: multipart/form-data`

**Body**:

- `file`: Audio file (WAV, MP3, WebM, etc.)
- `language` (optional): Language code (e.g., "en-US")
- `prompt` (optional): Context prompt for better transcription

**Response**:

```json
{
  "success": true,
  "data": {
    "transcript": "Hello, how can I help you today?",
    "language": "en-US",
    "duration": 3.2,
    "confidence": 0.95,
    "analysis": {
      "sentiment": "neutral",
      "emotion": "calm",
      "confidence": 0.8,
      "intent": "greeting"
    },
    "segments": [
      {
        "start": 0.0,
        "end": 1.2,
        "text": "Hello,"
      },
      {
        "start": 1.2,
        "end": 3.2,
        "text": "how can I help you today?"
      }
    ]
  }
}
```

#### `POST /api/voice/generate-speech`

**Description**: Generate speech from text (batch mode for fallback)

**Body**:

```json
{
  "text": "Hello, how can I help you today?",
  "voice": "alloy",
  "model": "tts-1",
  "speed": 1.0,
  "format": "mp3"
}
```

**Response**: Binary audio data with headers:

```plaintext
Content-Type: audio/mp3
Content-Length: 12847
Content-Disposition: attachment; filename="speech.mp3"
```

#### `GET /api/voice/voices`

**Description**: Get available TTS voices and configuration options

**Response**:

```json
{
  "success": true,
  "data": {
    "voices": [
      {
        "id": "alloy",
        "name": "Alloy", 
        "description": "Neutral and balanced voice"
      },
      {
        "id": "echo",
        "name": "Echo",
        "description": "Warm and friendly voice"
      }
    ],
    "supportedFormats": [".wav", ".mp3", ".webm"],
    "models": ["tts-1", "tts-1-hd"],
    "speedRange": { "min": 0.25, "max": 4.0, "default": 1.0 },
    "textLimits": { "min": 1, "max": 4096 },
    "fileLimits": { "min": 1024, "max": 26214400 }
  }
}
```

## WebSocket API

### Connection Endpoint

```plaintext
wss://your-domain.com/voice-ws?token=<jwt-token>
```

### Connection Flow

1. **Client** connects with JWT token
2. **Server** validates token and creates voice session
3. **Server** sends `ready` event with session configuration
4. **Client** can now send audio frames and receive real-time responses

### Message Types (Client → Server)

#### Binary Audio Frame

**Format**: Raw ArrayBuffer containing Opus-encoded audio (20ms frames)

```javascript
// Send audio frame
const opusFrame = new ArrayBuffer(320); // 20ms at 48kHz
ws.send(opusFrame);
```

#### Text Input

```json
{
  "type": "text_input",
  "text": "Hello, how can you help me?", 
  "timestamp": 1642248600000
}
```

#### Control Messages

```json
{
  "type": "control",
  "action": "start_recording",
  "timestamp": 1642248600000
}

{
  "type": "control", 
  "action": "stop_recording",
  "timestamp": 1642248600000
}

{
  "type": "control",
  "action": "clear_session",
  "timestamp": 1642248600000
}
```

### Message Types (Server → Client)

#### Session Ready

```json
{
  "type": "ready",
  "data": {
    "sessionId": "session-123",
    "supportedFormats": ["opus", "pcm"],
    "maxFrameSize": 4096,
    "sampleRates": [48000, 44100, 16000],
    "pingInterval": 15000
  },
  "timestamp": 1642248600000
}
```

#### Voice Activity Detection

```json
{
  "type": "vad",
  "active": true,
  "level": 0.75,
  "timestamp": 1642248600000
}
```

#### Partial Transcription

```json
{
  "type": "partial_asr", 
  "text": "Hello how",
  "confidence": 0.8,
  "timestamp": 1642248600000
}
```

#### Final Transcription

```json
{
  "type": "final_asr",
  "text": "Hello, how can you help me?",
  "lang": "en-US", 
  "timestamp": 1642248600000
}
```

#### Agent Response (Streaming)

```json
{
  "type": "agent_delta",
  "data": {
    "status": "processing",
    "message": "I can help you with...",
    "partial": true
  },
  "timestamp": 1642248600000
}

{
  "type": "agent_final",
  "data": {
    "text": "I can help you with product information, orders, and support questions.",
    "citations": [],
    "uiHints": {},
    "metadata": {
      "processingTime": 240,
      "tokensUsed": 45,
      "actionsExecuted": 0
    }
  },
  "timestamp": 1642248600000
}
```

#### TTS Audio Response

**Format**: Binary ArrayBuffer containing PCM audio data for immediate playback

```javascript
ws.addEventListener('message', (event) => {
  if (event.data instanceof ArrayBuffer) {
    // This is TTS audio data
    playAudioChunk(event.data);
  }
});
```

#### Barge-in Detection

```json
{
  "type": "barge_in",
  "timestamp": 1642248600000
}
```

#### Errors

```json
{
  "type": "error",
  "code": "AUDIO_PROCESSING_FAILED",
  "message": "Failed to process audio frame",
  "timestamp": 1642248600000
}
```

## Error Codes

### WebSocket Errors

| Code | Description | Retryable |
|------|-------------|-----------|
| `AUTH_FAILED` | JWT token invalid or expired | No |
| `SESSION_LIMIT_EXCEEDED` | Too many concurrent sessions | Yes |
| `AUDIO_PROCESSING_FAILED` | Error processing audio frame | Yes |
| `REALTIME_API_ERROR` | OpenAI Realtime API error | Yes |
| `NETWORK_ERROR` | Network connectivity issue | Yes |
| `INVALID_MESSAGE_FORMAT` | Malformed message received | No |
| `RESOURCE_EXHAUSTED` | Server overloaded | Yes |

### HTTP Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_REQUEST` | Malformed request body |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT token |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `SESSION_NOT_FOUND` | Voice session does not exist |
| 413 | `PAYLOAD_TOO_LARGE` | Audio file exceeds size limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Invalid audio format |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_SERVER_ERROR` | Server-side error |
| 503 | `SERVICE_UNAVAILABLE` | Voice services temporarily down |

## Rate Limits

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| REST API | 100 requests | 1 minute | Per tenant |
| WebSocket Connect | 10 connections | 1 minute | Per tenant |
| WebSocket Messages | 1000 messages | 1 minute | Per session |
| Audio Upload | 50 MB | 1 hour | Per tenant |

## SDK Integration Examples

### JavaScript/TypeScript

```typescript
import { VoiceClient } from '@sitespeak/voice-sdk';

const client = new VoiceClient({
  apiKey: 'your-jwt-token',
  wsUrl: 'wss://api.yoursite.com/voice-ws',
  options: {
    autoStart: true,
    enableVisualFeedback: true
  }
});

// Start voice session
await client.connect();

// Listen for events
client.on('transcription', (data) => {
  console.log('User said:', data.text);
});

client.on('response', (data) => {
  console.log('Assistant replied:', data.text);
});

// Send text message
await client.sendText('Hello, what can you help me with?');

// Start voice recording
await client.startRecording();

// Stop recording
await client.stopRecording();
```

### React Hook

```tsx
import { useVoiceSession } from '@sitespeak/react-voice';

function VoiceComponent() {
  const {
    isConnected,
    isListening,
    transcript,
    response,
    startListening,
    stopListening,
    sendText
  } = useVoiceSession({
    token: 'your-jwt-token'
  });

  return (
    <div>
      <div>Status: {isConnected ? 'Connected' : 'Disconnected'}</div>
      <div>Transcript: {transcript}</div>
      <div>Response: {response}</div>
      
      <button 
        onClick={isListening ? stopListening : startListening}
        disabled={!isConnected}
      >
        {isListening ? 'Stop' : 'Start'} Listening
      </button>
      
      <button onClick={() => sendText('Help me')}>
        Send Text
      </button>
    </div>
  );
}
```

### cURL Examples

```bash
# Health check
curl -X GET \
  https://api.yoursite.com/api/voice/health

# Get session info
curl -X GET \
  -H "Authorization: Bearer <jwt-token>" \
  https://api.yoursite.com/api/voice/session/session-123

# Upload audio for processing  
curl -X POST \
  -H "Authorization: Bearer <jwt-token>" \
  -F "file=@audio.wav" \
  -F "language=en-US" \
  https://api.yoursite.com/api/voice/process-audio

# Generate speech
curl -X POST \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","voice":"alloy"}' \
  https://api.yoursite.com/api/voice/generate-speech \
  --output speech.mp3
```

## Webhooks (Optional)

If configured, voice events can be sent to webhook URLs:

### Voice Session Events

```json
{
  "event": "voice.session.started",
  "sessionId": "session-123", 
  "tenantId": "tenant-456",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "siteId": "site-789",
    "userId": "user-101"
  }
}

{
  "event": "voice.session.ended",
  "sessionId": "session-123",
  "tenantId": "tenant-456", 
  "timestamp": "2024-01-15T10:35:00.000Z",
  "data": {
    "duration": 300,
    "totalTurns": 5,
    "errors": 0
  }
}
```

### Transcription Events

```json
{
  "event": "voice.transcription.completed",
  "sessionId": "session-123",
  "tenantId": "tenant-456",
  "timestamp": "2024-01-15T10:30:15.000Z", 
  "data": {
    "transcript": "Hello, how can you help me?",
    "language": "en-US",
    "confidence": 0.95,
    "duration": 3.2
  }
}
```
