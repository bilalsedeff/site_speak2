# Voice Components - Client-Side Voice UI

## Overview

Modern React components for real-time voice interactions, providing a complete voice interface with visual feedback, audio controls, and seamless AI conversation capabilities.

## Architecture

```plaintext
┌─────────────────────────────────────────────────────────────────┐
│                    Voice Components                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │   UI Components │    │  Audio Capture  │    │ Visual Feed │ │
│  │                 │    │                 │    │             │ │
│  │ • TalkButton    │    │ • MediaRecorder │    │ • Waveform  │ │
│  │ • VoiceConsent  │    │ • AudioWorklet  │    │ • Subtitles │ │
│  │ • Suggestions   │    │ • Stream Proc   │    │ • Status    │ │
│  │ • Controls      │    │ • VAD Detection │    │ • Animation │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                     Integration Layer                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ Voice Provider  │    │   WebSocket     │    │   AI Hook   │ │
│  │                 │    │                 │    │             │ │
│  │ • State Mgmt    │────│ • Connection    │────│ • useAI     │ │
│  │ • Context       │    │ • Binary Audio  │    │ • Streaming │ │
│  │ • Event System  │    │ • JSON Messages │    │ • Tool Call │ │
│  │ • Session       │    │ • Reconnection  │    │ • Response  │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. SimpleTalkButton

**File**: `SimpleTalkButton.tsx`
**Purpose**: Primary voice interaction trigger

#### Features

- **One-Touch Activation**: Single tap to start/stop voice recording
- **Visual States**: Clear visual feedback for recording/processing states
- **Accessibility**: Full keyboard and screen reader support
- **Responsive Design**: Adapts to different screen sizes

#### Usage

```tsx
import { SimpleTalkButton } from './components/voice/SimpleTalkButton';

function VoiceInterface() {
  const { startListening, stopListening, isListening } = useVoice();

  return (
    <SimpleTalkButton 
      isListening={isListening}
      onStartListening={startListening}
      onStopListening={stopListening}
      disabled={!isConnected}
    />
  );
}
```

#### States

- **Idle**: Ready to start recording
- **Listening**: Actively recording audio
- **Processing**: Sending audio to AI for processing  
- **Speaking**: AI is responding with audio
- **Error**: Connection or processing error

### 2. VoiceConsentModal

**File**: `VoiceConsentModal.tsx`
**Purpose**: Microphone permission and privacy consent

#### Features of VoiceConsentModal

- **Permission Request**: Handles browser microphone permission flow
- **Privacy Information**: Clear explanation of voice data usage
- **Consent Management**: Tracks and stores user consent preferences
- **Error Handling**: Graceful handling of permission denials

#### Usage of VoiceConsentModal

```tsx
import { VoiceConsentModal } from './components/voice/VoiceConsentModal';

function App() {
  const [showConsent, setShowConsent] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);

  return (
    <>
      {showConsent && (
        <VoiceConsentModal
          onConsent={() => {
            setHasPermission(true);
            setShowConsent(false);
          }}
          onDecline={() => setShowConsent(false)}
        />
      )}
      {hasPermission && <VoiceInterface />}
    </>
  );
}
```

### 3. VoiceWaveform

**File**: `VoiceWaveform.tsx`
**Purpose**: Real-time audio visualization

#### Features of VoiceWaveform

- **Live Waveform**: Real-time audio level visualization
- **VAD Integration**: Visual indication of voice activity detection
- **Smooth Animation**: 60fps smooth visual feedback
- **Customizable**: Themeable colors and styles

#### Usage of VoiceWaveform

```tsx
import { VoiceWaveform } from './components/voice/VoiceWaveform';

function VoiceVisualizer() {
  const { audioLevel, isVADActive } = useVoice();

  return (
    <VoiceWaveform
      audioLevel={audioLevel}
      isActive={isVADActive}
      width={300}
      height={60}
      color="#00ff88"
    />
  );
}
```

#### Animation

```typescript
// Waveform animation using Canvas API
const drawWaveform = (
  ctx: CanvasRenderingContext2D,
  audioLevel: number,
  isActive: boolean
) => {
  const bars = 40;
  const barWidth = canvas.width / bars;
  
  for (let i = 0; i < bars; i++) {
    const height = Math.random() * audioLevel * canvas.height;
    const opacity = isActive ? 1.0 : 0.3;
    
    ctx.globalAlpha = opacity;
    ctx.fillRect(i * barWidth, (canvas.height - height) / 2, barWidth - 2, height);
  }
};
```

### 4. VoiceSubtitles

**File**: `VoiceSubtitles.tsx`
**Purpose**: Live transcription and AI response display

#### Features of VoiceSubtitles

- **Live Transcription**: Real-time speech-to-text display
- **Partial Updates**: Shows partial transcription as user speaks
- **AI Responses**: Displays AI responses with typing animation
- **Multi-language**: Supports multiple languages with proper RTL

#### Usage of VoiceSubtitles

```tsx
import { VoiceSubtitles } from './components/voice/VoiceSubtitles';

function ConversationDisplay() {
  const { 
    currentTranscription, 
    partialTranscription,
    aiResponse,
    isAISpeaking 
  } = useVoice();

  return (
    <VoiceSubtitles
      transcription={currentTranscription}
      partialText={partialTranscription}
      aiResponse={aiResponse}
      isAISpeaking={isAISpeaking}
      language="en-US"
    />
  );
}
```

#### Text Animation

```typescript
// Typing effect for AI responses
const useTypingEffect = (text: string, speed: number = 50) => {
  const [displayText, setDisplayText] = useState('');
  
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);
    
    return () => clearInterval(timer);
  }, [text, speed]);
  
  return displayText;
};
```

### 5. SuggestionChips

**File**: `SuggestionChips.tsx`
**Purpose**: Contextual voice command suggestions

#### Features of SuggestionChips

- **Smart Suggestions**: Context-aware command suggestions
- **Quick Actions**: One-tap voice command triggers
- **Dynamic Content**: Updates based on current site context
- **Accessibility**: Full keyboard navigation support

#### Usage of SuggestionChips

```tsx
import { SuggestionChips } from './components/voice/SuggestionChips';

function VoiceSuggestions() {
  const { sendVoiceCommand } = useVoice();
  const suggestions = [
    "Search for products",
    "Go to contact page", 
    "Tell me about services",
    "Add to cart"
  ];

  return (
    <SuggestionChips
      suggestions={suggestions}
      onSuggestionClick={sendVoiceCommand}
      maxVisible={4}
    />
  );
}
```

## Voice Provider Integration

### VoiceProvider Context

**File**: `../providers/VoiceProvider.tsx`
**Purpose**: Global voice state management

#### Features of VoiceProvider Context

- **Global State**: Centralized voice interaction state
- **WebSocket Management**: Handles connection lifecycle
- **Audio Pipeline**: Manages audio capture and processing
- **Event Coordination**: Coordinates between components

#### State Structure

```typescript
interface VoiceContextState {
  // Connection State
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  
  // Audio State  
  isListening: boolean;
  isProcessing: boolean;
  audioLevel: number;
  isVADActive: boolean;
  
  // Transcription State
  currentTranscription: string;
  partialTranscription: string;
  transcriptionHistory: TranscriptionEntry[];
  
  // AI Response State
  aiResponse: string;
  isAISpeaking: boolean;
  aiResponseHistory: AIResponseEntry[];
  
  // Session State
  sessionId: string | null;
  sessionMetrics: VoiceMetrics;
  
  // Settings
  settings: VoiceSettings;
}
```

#### Actions

```typescript
interface VoiceContextActions {
  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  
  // Audio Control
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  setMuted(muted: boolean): void;
  
  // Commands
  sendVoiceCommand(command: string): Promise<void>;
  sendTextMessage(message: string): Promise<void>;
  
  // Settings
  updateSettings(settings: Partial<VoiceSettings>): void;
  
  // Utility
  clearHistory(): void;
  exportSession(): SessionExport;
}
```

### Usage Pattern

```tsx
import { VoiceProvider, useVoice } from '../providers/VoiceProvider';

function App() {
  return (
    <VoiceProvider>
      <VoiceEnabledApp />
    </VoiceProvider>
  );
}

function VoiceEnabledApp() {
  const voice = useVoice();
  
  useEffect(() => {
    // Auto-connect when component mounts
    voice.connect().catch(console.error);
    
    return () => {
      voice.disconnect();
    };
  }, []);

  return (
    <div>
      <SimpleTalkButton />
      <VoiceWaveform />
      <VoiceSubtitles />
      <SuggestionChips />
    </div>
  );
}
```

## Audio Capture & Processing

### MediaRecorder Integration

```typescript
class VoiceAudioCapture {
  private mediaRecorder?: MediaRecorder;
  private audioContext?: AudioContext;
  private workletNode?: AudioWorkletNode;

  async startCapture(): Promise<void> {
    // Get user media
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    // Setup AudioContext for real-time processing
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    await this.audioContext.audioWorklet.addModule('/worklets/voice-processor.js');
    
    this.workletNode = new AudioWorkletNode(this.audioContext, 'voice-processor');
    this.workletNode.port.onmessage = this.handleAudioData.bind(this);

    // Connect audio pipeline
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.workletNode);
    
    // Setup MediaRecorder for fallback
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    this.mediaRecorder.ondataavailable = this.handleRecordedData.bind(this);
    this.mediaRecorder.start(100); // 100ms chunks
  }

  private handleAudioData(event: MessageEvent) {
    const { audioData, vadActive, audioLevel } = event.data;
    
    // Send to voice provider
    this.onAudioData?.(audioData, vadActive, audioLevel);
  }
}
```

### Voice Activity Detection

```typescript
// AudioWorklet processor for VAD
class VoiceProcessor extends AudioWorkletProcessor {
  private vadThreshold = 0.01;
  private hangTime = 500; // ms
  private lastVoiceTime = 0;
  private isVADActive = false;

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    // Calculate audio energy
    const energy = this.calculateEnergy(input);
    const currentTime = Date.now();
    
    // VAD logic
    if (energy > this.vadThreshold) {
      this.lastVoiceTime = currentTime;
      if (!this.isVADActive) {
        this.isVADActive = true;
        this.port.postMessage({ 
          type: 'vad_start', 
          audioLevel: energy 
        });
      }
    } else if (this.isVADActive && (currentTime - this.lastVoiceTime) > this.hangTime) {
      this.isVADActive = false;
      this.port.postMessage({ 
        type: 'vad_end', 
        audioLevel: energy 
      });
    }

    // Send audio data for processing
    this.port.postMessage({
      type: 'audio_data',
      audioData: input,
      vadActive: this.isVADActive,
      audioLevel: energy
    });

    return true;
  }

  private calculateEnergy(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i]! * samples[i]!;
    }
    return Math.sqrt(sum / samples.length);
  }
}
```

## Performance Optimization

### Component Optimization

```typescript
// Memoized components to prevent unnecessary re-renders
const VoiceWaveform = memo(({ audioLevel, isActive, ...props }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Use requestAnimationFrame for smooth animations
  const animationRef = useRef<number>();
  
  const animate = useCallback(() => {
    if (canvasRef.current) {
      drawWaveform(canvasRef.current, audioLevel, isActive);
    }
    animationRef.current = requestAnimationFrame(animate);
  }, [audioLevel, isActive]);
  
  useEffect(() => {
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate]);
  
  return <canvas ref={canvasRef} {...props} />;
});
```

### State Optimization

```typescript
// Debounced state updates for high-frequency audio data
const useDebouncedAudioLevel = (audioLevel: number, delay: number = 16) => {
  const [debouncedLevel, setDebouncedLevel] = useState(audioLevel);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedLevel(audioLevel);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [audioLevel, delay]);
  
  return debouncedLevel;
};
```

## Error Handling

### Connection Errors

```typescript
const useVoiceErrorHandler = () => {
  const [errors, setErrors] = useState<VoiceError[]>([]);
  
  const handleError = useCallback((error: VoiceError) => {
    setErrors(prev => [...prev, error]);
    
    // Auto-retry logic for recoverable errors
    if (error.recoverable) {
      setTimeout(() => {
        // Attempt recovery
        retryConnection();
      }, error.retryDelay || 5000);
    }
    
    // Show user notification
    if (error.userMessage) {
      showNotification(error.userMessage, 'error');
    }
  }, []);
  
  return { errors, handleError };
};
```

### Microphone Permission Errors

```typescript
const handleMicrophoneError = (error: DOMException) => {
  switch (error.name) {
    case 'NotAllowedError':
      showError('Microphone access denied. Please allow microphone permissions.');
      break;
    case 'NotFoundError':
      showError('No microphone found. Please connect a microphone.');
      break;
    case 'NotReadableError':
      showError('Microphone is being used by another application.');
      break;
    default:
      showError('Unable to access microphone. Please check your settings.');
  }
};
```

## Accessibility

### Keyboard Support

```typescript
const VoiceKeyboardHandler = () => {
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Space bar for push-to-talk
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        startListening();
      }
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        stopListening();
      }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('keyup', handleKeyUp);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
};
```

### Screen Reader Support

```tsx
const VoiceAccessibleButton = ({ isListening, onToggle }) => (
  <button
    onClick={onToggle}
    aria-label={isListening ? 'Stop voice recording' : 'Start voice recording'}
    aria-pressed={isListening}
    role="switch"
    className="voice-button"
  >
    <span aria-hidden="true">{isListening ? '🛑' : '🎤'}</span>
    <span className="sr-only">
      {isListening ? 'Recording... Click to stop' : 'Click to start recording'}
    </span>
  </button>
);
```

## Testing

### Component Testing

```typescript
// Test voice components with Jest and React Testing Library
describe('SimpleTalkButton', () => {
  it('starts listening when clicked', async () => {
    const mockStart = jest.fn();
    render(<SimpleTalkButton onStartListening={mockStart} />);
    
    const button = screen.getByRole('button');
    await user.click(button);
    
    expect(mockStart).toHaveBeenCalled();
  });
  
  it('shows correct accessibility states', () => {
    render(<SimpleTalkButton isListening={true} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });
});
```

### Integration Testing

```typescript
// Test voice provider integration
describe('VoiceProvider', () => {
  it('manages connection state correctly', async () => {
    const { result } = renderHook(() => useVoice(), {
      wrapper: VoiceProvider
    });
    
    expect(result.current.isConnected).toBe(false);
    
    await act(async () => {
      await result.current.connect();
    });
    
    expect(result.current.isConnected).toBe(true);
  });
});
```

## Future Enhancements

### Planned Features

1. **Voice Commands**: Predefined voice commands for common actions
2. **Multi-language**: Full i18n support for voice interactions  
3. **Offline Mode**: Basic voice functionality without internet
4. **Voice Cloning**: Custom voice synthesis options
5. **Advanced Visualization**: Spectogram and frequency analysis

### Performance Improvements

1. **Web Workers**: Move audio processing to web workers
2. **Streaming**: Implement streaming audio for lower latency
3. **Compression**: Client-side audio compression before transmission
4. **Caching**: Cache frequently used audio responses
