# Voice Infrastructure

## Overview

Complete voice infrastructure implementation providing the foundation for real-time voice interactions in SiteSpeak. This infrastructure supports WebSocket-based communication, authentication, session management, and integration with AI services.

## Directory Structure

```plaintext
infrastructure/
├── websocket/              # WebSocket implementations
│   ├── RawWebSocketServer.ts     # RFC 6455 compliant WebSocket server
│   ├── VoiceWebSocketHandler.ts  # Socket.IO-based voice handler
│   └── README.md                 # WebSocket infrastructure docs
└── README.md                     # This file
```

## Components

### WebSocket Layer (`websocket/`)

The WebSocket layer provides dual-transport real-time communication:

#### 1. Raw WebSocket Server

- **Purpose**: High-performance binary audio streaming
- **Protocol**: RFC 6455 WebSocket
- **Endpoint**: `/voice-ws`
- **Features**:
  - 20ms Opus frame streaming
  - JWT authentication on upgrade
  - OpenAI Realtime API integration
  - Tool calling support

#### 2. Socket.IO Voice Handler  

- **Purpose**: JSON messaging and fallback support
- **Protocol**: Socket.IO
- **Namespace**: `/voice`
- **Features**:
  - Cross-browser compatibility
  - Transport fallbacks (polling, XHR)
  - Event-based communication
  - Session coordination

## Architecture Integration

```plaintext
┌─────────────────────────────────────────────────────────────────┐
│                     Voice Infrastructure                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │  Raw WebSocket  │    │   Socket.IO     │    │   Session   │ │
│  │     Server      │    │     Handler     │    │  Management │ │
│  │                 │    │                 │    │             │ │ 
│  │ • Binary Audio  │    │ • JSON Messages │    │ • JWT Auth  │ │
│  │ • Opus Frames   │    │ • Event System  │    │ • Lifecycle │ │
│  │ • Low Latency   │    │ • Fallback      │    │ • Cleanup   │ │
│  │ • Direct Stream │    │ • Compatibility │    │ • Metrics   │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    Integration Points                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ Voice Services  │    │  AI Integration │    │  Transport  │ │
│  │                 │    │                 │    │             │ │
│  │ • Orchestrator  │────│ • OpenAI API    │────│ • WebSocket │ │
│  │ • TurnManager   │    │ • Knowledge Base│    │ • HTTP      │ │
│  │ • OpusFramer    │    │ • Tool Calling  │    │ • Events    │ │
│  │ • Audio Process │    │ • Retrieval     │    │ • Streaming │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. Dual Transport Architecture

- **Raw WebSocket**: Optimized for binary audio streaming with minimal overhead
- **Socket.IO**: Robust messaging with automatic fallback and cross-browser support
- **Unified Sessions**: Single session management across both transports

### 2. Authentication & Security

- **JWT on Upgrade**: Authentication happens before WebSocket handshake
- **Token Validation**: Secure token verification with proper error handling
- **Rate Limiting**: Per-IP connection limits and abuse protection
- **Data Validation**: Audio frame validation and format checking

### 3. Performance Optimization

- **Low Latency**: ≤300ms first token, ≤50ms barge-in response
- **Efficient Framing**: 20ms Opus frames for optimal network utilization
- **Connection Pooling**: Efficient resource management
- **Compression**: Smart compression for non-audio data

### 4. Reliability & Recovery

- **Health Monitoring**: Ping/pong heartbeat with failure detection
- **Automatic Reconnection**: Exponential backoff reconnection strategy
- **Graceful Degradation**: Fallback mechanisms for network issues
- **Session Cleanup**: Proper resource cleanup on disconnection

## Implementation Details

### Session Lifecycle

```typescript
// 1. Authentication
const token = extractJWTFromRequest(request);
const payload = await jwtService.verifyToken(token);

// 2. Session Creation
const session = await createVoiceSession({
  tenantId: payload.tenantId,
  siteId: payload.siteId,
  userId: payload.userId
});

// 3. Transport Setup
if (isRawWebSocket(request)) {
  await setupRawWebSocket(session, webSocket);
} else {
  await setupSocketIOConnection(session, socket);
}

// 4. Audio Pipeline
await initializeAudioPipeline(session);

// 5. AI Integration  
await connectToAIServices(session);

// 6. Cleanup on Disconnect
session.on('disconnect', async () => {
  await cleanupSession(session);
});
```

### Message Flow

```typescript
// Raw WebSocket Binary Flow
webSocket.on('message', async (data: Buffer, isBinary: boolean) => {
  if (isBinary) {
    // Direct audio processing
    await processAudioFrame(session, data.buffer);
  } else {
    // Control messages  
    const message = JSON.parse(data.toString());
    await handleControlMessage(session, message);
  }
});

// Socket.IO Event Flow
socket.on('voice:audio_data', async (audioBuffer: ArrayBuffer) => {
  await processAudioFrame(session, audioBuffer);
});

socket.on('voice:control', async (controlData: any) => {
  await handleControlMessage(session, controlData);
});
```

### Error Handling Strategy

```typescript
class VoiceInfrastructureError extends Error {
  constructor(
    public code: string,
    public message: string, 
    public sessionId?: string,
    public recoverable: boolean = true
  ) {
    super(message);
  }
}

// Error Recovery
async function handleInfrastructureError(error: VoiceInfrastructureError) {
  if (error.recoverable) {
    // Attempt recovery
    await attemptSessionRecovery(error.sessionId);
  } else {
    // Clean shutdown
    await forceSessionCleanup(error.sessionId);
  }
  
  // Log and monitor
  logger.error('Voice infrastructure error', { 
    code: error.code,
    sessionId: error.sessionId,
    recoverable: error.recoverable 
  });
}
```

## Monitoring & Observability

### Metrics Collection

```typescript
interface InfrastructureMetrics {
  connections: {
    total: number;
    active: number;
    rawWebSocket: number;
    socketIO: number;
  };
  performance: {
    averageLatency: number;
    connectionTime: number;
    messageRate: number;
    errorRate: number;
  };
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    networkBandwidth: number;
  };
}
```

### Health Checks

- **Connection Health**: Monitor active connections and response times
- **Resource Usage**: Track memory, CPU, and network utilization  
- **Error Rates**: Monitor and alert on error rate thresholds
- **Performance**: Track latency and throughput metrics

## Configuration

### Environment Variables

```bash
# WebSocket Configuration
VOICE_WS_PORT=5000
VOICE_WS_PATH=/voice-ws
VOICE_SOCKETIO_PATH=/socket.io

# Performance Tuning
VOICE_MAX_CONNECTIONS=1000
VOICE_HEARTBEAT_INTERVAL=30000
VOICE_FRAME_SIZE=1920  # 20ms at 48kHz

# Security
VOICE_JWT_SECRET=your-jwt-secret
VOICE_RATE_LIMIT_PER_IP=100
VOICE_SESSION_TIMEOUT=300000

# Debugging
VOICE_DEBUG=false
VOICE_LOG_LEVEL=info
```

### Production Configuration

```typescript
const productionConfig = {
  websocket: {
    compression: {
      threshold: 1024,
      level: 1, // Fast compression for real-time
    },
    limits: {
      maxConnections: 10000,
      maxPayloadLength: 1024 * 1024, // 1MB
      backpressureLimit: 64 * 1024,  // 64KB
    },
    timeouts: {
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 10000,
    }
  }
};
```

## Testing

### Unit Tests

```bash
# Test individual components
npm run test:voice-infrastructure

# Test WebSocket connections
npm run test:websocket

# Test Socket.IO integration  
npm run test:socketio
```

### Integration Tests

```bash
# Test full voice pipeline
npm run test:voice-e2e

# Test under load
npm run test:voice-load

# Test failover scenarios
npm run test:voice-failover
```

### Manual Testing

```bash
# Start development server
npm run dev:server

# Test Raw WebSocket connection
wscat -c ws://localhost:5000/voice-ws -H "Authorization: Bearer $JWT_TOKEN"

# Test Socket.IO connection
node tools/test-socketio-voice.js
```

## Deployment Considerations

### Load Balancing

- Use sticky sessions for WebSocket connections
- Configure health checks for load balancer
- Consider Redis adapter for Socket.IO clustering

### Monitoring

- Set up metrics collection (Prometheus/Grafana)
- Configure alerting for error rates and latency
- Monitor resource usage and scaling triggers

### Security

- Enable TLS/SSL for all connections
- Configure proper CORS settings
- Implement DDoS protection
- Regular security audits

### Scaling

- Horizontal scaling with session affinity
- Database connection pooling
- Caching strategy for session data
- CDN for static assets

## Future Enhancements

### Planned Features

1. **Multi-region Support**: Geographic distribution of voice infrastructure  
2. **Advanced Compression**: Context-aware audio compression
3. **Quality Adaptation**: Dynamic quality adjustment based on network conditions
4. **Enhanced Security**: Additional authentication methods and encryption
5. **Analytics Integration**: Real-time voice interaction analytics

### Performance Improvements

1. **Protocol Optimization**: Custom binary protocols for specialized use cases
2. **Caching Layer**: Intelligent caching for frequently accessed voice data
3. **Resource Pooling**: Advanced resource pooling and management
4. **Network Optimization**: TCP optimization and connection management
