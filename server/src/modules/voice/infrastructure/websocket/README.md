# Voice WebSocket Infrastructure

## Overview

High-performance WebSocket infrastructure for real-time voice streaming, implementing RFC 6455 compliant Raw WebSocket for audio data and Socket.IO for JSON messaging and fallback support.

## Architecture

```plaintext
┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Client App    │    │  WebSocket Layer    │    │  Voice Services     │
│                 │    │                     │    │                     │
│ AudioWorklet ───┼────┤ Raw WebSocket       │    │ VoiceOrchestrator   │
│ MediaRecorder   │    │ /voice-ws           ├────┤ TurnManager         │
│ Web Audio API   │    │ (Binary Audio)      │    │ OpusFramer          │
│                 │    │                     │    │ OpenAI Realtime     │
│ React Context ──┼────┤ Socket.IO           │    │                     │
│ UI Components   │    │ /socket.io          │    │ AI Integration      │
│ Event Handlers  │    │ (JSON Messages)     │    │ Knowledge Base      │
└─────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## Components

### 1. RawWebSocketServer

**File**: `RawWebSocketServer.ts`
**Protocol**: RFC 6455 WebSocket
**Endpoint**: `/voice-ws`

#### Purpose

- High-performance binary audio streaming
- Direct Opus frame transmission (20ms frames)
- JWT authentication on WebSocket upgrade
- Integration with OpenAI Realtime API
- Tool calling support (search, navigation, site info)

#### Features

- **Low Latency**: Optimized for ≤300ms first token response
- **Audio Streaming**: 20ms Opus frames at 48kHz sample rate
- **VAD Integration**: Real-time Voice Activity Detection
- **Barge-in Support**: ≤50ms interruption response
- **Health Monitoring**: Ping/pong heartbeat with payload echo
- **Error Recovery**: Automatic reconnection with exponential backoff

#### Message Types

```typescript
export interface VoiceStreamMessage {
  type: 'voice_start' | 'voice_data' | 'voice_end' | 'transcription' | 
        'audio_response' | 'barge_in' | 'vad' | 'user_transcript' | 
        'error' | 'ready' | 'navigation';
  data?: ArrayBuffer | string | null;
  metadata?: {
    sessionId?: string;
    sampleRate?: number;
    channels?: number;
    vadActive?: boolean;
    sequence?: number;
    timestamp?: number;
    partial?: boolean;
    streaming?: boolean;
    final?: boolean;
    active?: boolean;
    audioStartMs?: number;
    audioEndMs?: number;
    latency?: number;
    error?: string;
    page?: string;
  };
}
```

#### Connection Flow

```typescript
// 1. Authentication on HTTP upgrade
const token = extractJWTFromRequest(request);
const payload = await jwtService.verifyToken(token);

// 2. Session creation
const session: RawVoiceSession = {
  id: generateSessionId(),
  ws: webSocket,
  auth: payload,
  isActive: true,
  isStreaming: false,
  realtimeClient: new OpenAIRealtimeClient(config)
};

// 3. OpenAI Realtime API connection
await session.realtimeClient.connect();

// 4. Audio processing pipeline
opusFramer.on('opus_frame', (frame) => {
  session.realtimeClient.sendAudio(frame.data);
});
```

#### Tool Integration

Supports integrated tool calling for:

- **Site Search**: `search_site(query)` - Search website content
- **Navigation**: `navigate_to_page(page, path?)` - Navigate to pages  
- **Site Info**: `get_site_info(topic?)` - Get website information

### 2. VoiceWebSocketHandler

**File**: `VoiceWebSocketHandler.ts`
**Protocol**: Socket.IO
**Namespace**: `/voice`

#### Purpose of VoiceWebSocketHandler

- JSON message handling
- Fallback for environments without Raw WebSocket support
- Integration with existing Socket.IO infrastructure
- Session management and coordination

#### Features of VoiceWebSocketHandler

- **Message Types**: JSON-based communication
- **Namespace Support**: Isolated `/voice` namespace
- **Fallback Transport**: Long-polling, XHR fallbacks
- **Session Sync**: Coordinates with VoiceOrchestrator
- **Event System**: Full EventEmitter integration

#### Event Handling

```typescript
socket.on('voice:start', async (data) => {
  const session = await createVoiceSession(data);
  socket.emit('voice:session_ready', { sessionId: session.id });
});

socket.on('voice:audio_data', async (audioBuffer) => {
  await voiceOrchestrator.processVoiceInput(sessionId, audioBuffer);
});

socket.on('voice:end', () => {
  await cleanupSession(sessionId);
});
```

### 3. WebSocketCoordinator

**File**: `WebSocketCoordinator.ts`
**Purpose**: Unified WebSocket management

#### Architecture of VoiceWebSocketHandler

- **Dual Transport**: Manages both Raw WebSocket and Socket.IO
- **Session Unification**: Single session across both transports
- **Authentication**: Consistent JWT auth across protocols
- **Health Monitoring**: Unified heartbeat system
- **Performance Metrics**: Cross-transport monitoring

#### Configuration

```typescript
const coordinator = new WebSocketCoordinator({
  httpServer: server,
  aiService: universalAIAssistant,
  enableRawWebSocket: true,
  enableSocketIO: true,
  heartbeatInterval: 30000,
  maxConnections: 1000,
  paths: {
    rawWebSocket: '/voice-ws',
    socketIO: '/socket.io'
  }
});
```

#### Session Management

```typescript
interface UnifiedSession {
  id: string;
  tenantId: string;
  siteId?: string;
  userId?: string;
  rawWebSocket?: WebSocket;
  socketIOConnection?: Socket;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
  pingInterval?: NodeJS.Timeout;
  isAlive: boolean;
}
```

## Performance Optimization

### Raw WebSocket Optimizations

```typescript
// Compression settings for audio
const wsServer = new WebSocketServer({
  perMessageDeflate: {
    threshold: 1024,
    concurrencyLimit: 10,
    zlibDeflateOptions: {
      level: 1, // Fast compression for real-time audio
      memLevel: 8,
    },
  },
});

// Binary frame handling
ws.on('message', (data: Buffer, isBinary: boolean) => {
  if (isBinary && data.length > 0) {
    // Direct binary processing - no JSON parsing overhead
    await processAudioFrame(data.buffer);
  }
});
```

### Socket.IO Optimizations

```typescript
const io = new SocketIOServer(server, {
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  compression: true,
  parser: require('socket.io-msgpack-parser') // Binary efficient parser
});
```

## Security

### Authentication

```typescript
// JWT verification on WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const token = extractTokenFromQuery(request.url);
  
  jwtService.verifyToken(token)
    .then(payload => {
      // Proceed with WebSocket handshake
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, payload);
      });
    })
    .catch(error => {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    });
});
```

### Rate Limiting

```typescript
const connectionLimit = new Map<string, number>();

function checkRateLimit(clientIP: string): boolean {
  const connections = connectionLimit.get(clientIP) || 0;
  if (connections > MAX_CONNECTIONS_PER_IP) {
    return false;
  }
  connectionLimit.set(clientIP, connections + 1);
  return true;
}
```

### Data Validation

```typescript
function validateAudioFrame(data: Buffer): boolean {
  // Validate frame size (20ms at 48kHz = 1920 bytes)
  if (data.length !== EXPECTED_FRAME_SIZE) {
    return false;
  }
  
  // Validate audio format (Opus header check)
  if (!isValidOpusFrame(data)) {
    return false;
  }
  
  return true;
}
```

## Monitoring & Debugging

### Performance Metrics

```typescript
interface WebSocketMetrics {
  totalConnections: number;
  activeConnections: number;
  totalFramesProcessed: number;
  averageLatency: number;
  peakConcurrentSessions: number;
  audioFramesProcessed: number;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
}
```

### Health Checks

```typescript
function performHealthCheck() {
  const activeSessions = sessions.size;
  const avgLatency = calculateAverageLatency();
  const errorRate = calculateErrorRate();
  
  return {
    status: errorRate < 0.05 ? 'healthy' : 'degraded',
    activeSessions,
    avgLatency,
    errorRate,
    timestamp: new Date().toISOString()
  };
}
```

### Debug Logging

```typescript
// Enable detailed WebSocket logging
if (process.env.VOICE_DEBUG === 'true') {
  ws.on('message', (data, isBinary) => {
    logger.debug('WebSocket message received', {
      sessionId: session.id,
      size: data.length,
      isBinary,
      timestamp: Date.now()
    });
  });
}
```

## Error Handling

### Connection Recovery

```typescript
class ConnectionRecovery {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  async attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new Error('Max reconnection attempts reached');
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    this.reconnectAttempts++;
    return this.connect();
  }
}
```

### Graceful Degradation

```typescript
// Fallback to Socket.IO if Raw WebSocket fails
if (rawWebSocketConnection.readyState === WebSocket.CLOSED) {
  logger.warn('Raw WebSocket unavailable, falling back to Socket.IO');
  return this.setupSocketIOFallback(session);
}
```

### Session Cleanup

```typescript
private async cleanupSession(session: RawVoiceSession) {
  try {
    // Stop audio processing
    if (session.realtimeClient) {
      await session.realtimeClient.disconnect();
    }
    
    // Close WebSocket
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.close(1000, 'Session cleanup');
    }
    
    // Remove from active sessions
    this.sessions.delete(session.id);
    
    logger.info('Session cleaned up successfully', { sessionId: session.id });
  } catch (error) {
    logger.error('Error during session cleanup', { sessionId: session.id, error });
  }
}
```

## Testing

### WebSocket Connection Test

```typescript
import WebSocket from 'ws';

async function testVoiceWebSocket() {
  const ws = new WebSocket('ws://localhost:5000/voice-ws', {
    headers: { 'Authorization': 'Bearer ' + JWT_TOKEN }
  });
  
  ws.on('open', () => {
    console.log('Voice WebSocket connected');
    
    // Send test audio frame
    const testFrame = new ArrayBuffer(1920); // 20ms at 48kHz
    ws.send(testFrame);
  });
  
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      console.log('Received audio response:', data.length, 'bytes');
    } else {
      console.log('Received message:', JSON.parse(data.toString()));
    }
  });
}
```

### Socket.IO Test

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000/voice', {
  auth: { token: JWT_TOKEN }
});

socket.on('connect', () => {
  console.log('Socket.IO voice connected');
  
  socket.emit('voice:start', {
    siteId: 'test-site',
    locale: 'en-US'
  });
});

socket.on('voice:session_ready', (data) => {
  console.log('Voice session ready:', data.sessionId);
});
```

## Best Practices

### Client Implementation

1. **Connection Priority**: Try Raw WebSocket first, fallback to Socket.IO
2. **Buffer Management**: Implement proper audio buffering to prevent dropouts
3. **Error Recovery**: Handle connection drops gracefully with automatic reconnection
4. **Performance Monitoring**: Track latency and adjust quality accordingly

### Server Configuration

1. **Resource Limits**: Set appropriate connection and memory limits
2. **Monitoring**: Implement comprehensive health checks and alerting
3. **Load Balancing**: Use sticky sessions for WebSocket load balancing
4. **Scaling**: Consider Redis adapter for Socket.IO clustering

### Production Deployment

1. **Reverse Proxy**: Configure nginx/Apache for WebSocket support
2. **SSL/TLS**: Ensure encrypted connections in production
3. **Firewall**: Allow WebSocket traffic on required ports
4. **Monitoring**: Set up metrics collection and dashboards

## Troubleshooting

### Common Issues

**Connection Refused**:

- Check if server is running on correct port
- Verify WebSocket support in reverse proxy
- Check firewall rules

**High Latency**:

- Monitor network conditions
- Check audio buffer sizes
- Verify server CPU/memory usage
- Adjust frame size and bitrate

**Authentication Errors**:

- Verify JWT token validity
- Check token expiration
- Ensure proper token passing in headers/query

**Audio Cutting Out**:

- Check packet loss rates  
- Monitor connection stability
- Adjust VAD sensitivity
- Verify audio format compatibility
