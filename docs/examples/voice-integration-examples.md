# Voice Integration Examples

## Overview

This document provides practical examples for integrating SiteSpeak's voice services into your applications. Examples cover common use cases, implementation patterns, and best practices.

## Quick Start

### 1. Basic Voice Assistant Setup

```typescript
// server.ts
import express from 'express';
import { initializeVoiceServices, VoicePresets } from '@sitespeak/voice-services';

const app = express();

// Initialize voice services with balanced preset
await initializeVoiceServices(VoicePresets.balanced);

// Health check endpoint
app.get('/api/voice/health', (req, res) => {
  const health = getVoiceServicesHealth();
  res.json(health);
});

const server = app.listen(3000);
console.log('Voice services ready on port 3000');
```

```tsx
// App.tsx
import React from 'react';
import { VoiceProvider } from '@sitespeak/react-voice';
import { VoiceAssistant } from '@sitespeak/voice-components';

function App() {
  return (
    <VoiceProvider 
      wsUrl="wss://your-api.com/voice-ws"
      token="your-jwt-token"
    >
      <main>
        <h1>My App</h1>
        {/* Your app content */}
      </main>
      
      {/* Floating voice assistant */}
      <VoiceAssistant 
        position="bottom-right"
        theme="auto"
        suggestions={[
          "How can you help me?",
          "Show me products",
          "Check my order status"
        ]}
      />
    </VoiceProvider>
  );
}

export default App;
```

## E-commerce Integration

### Voice-Enabled Product Search

```tsx
import React, { useState } from 'react';
import { useVoice } from '@sitespeak/react-voice';
import { ProductGrid } from './ProductGrid';

function VoiceProductSearch() {
  const [products, setProducts] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const { 
    isListening, 
    transcript, 
    startListening, 
    stopListening 
  } = useVoice({
    onFinalTranscript: async (text) => {
      if (text.toLowerCase().includes('search') || text.toLowerCase().includes('find')) {
        setIsSearching(true);
        try {
          const results = await searchProducts(text);
          setProducts(results);
        } catch (error) {
          console.error('Search failed:', error);
        } finally {
          setIsSearching(false);
        }
      }
    }
  });

  const handleVoiceSearch = async () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="voice-product-search">
      <div className="search-controls">
        <button 
          className={`voice-search-btn ${isListening ? 'listening' : ''}`}
          onClick={handleVoiceSearch}
        >
          🎤 {isListening ? 'Listening...' : 'Voice Search'}
        </button>
        
        {transcript && (
          <div className="transcript">
            Searching for: "{transcript}"
          </div>
        )}
      </div>
      
      {isSearching && <div className="loading">Searching products...</div>}
      
      <ProductGrid products={products} />
    </div>
  );
}

async function searchProducts(query: string) {
  const response = await fetch('/api/products/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  return response.json();
}
```

### Voice-Controlled Shopping Cart

```tsx
import React from 'react';
import { useVoice, useVoiceCommands } from '@sitespeak/react-voice';
import { useShoppingCart } from './hooks/useShoppingCart';

function VoiceShoppingCart() {
  const { cart, addItem, removeItem, updateQuantity } = useShoppingCart();
  
  const voiceCommands = useVoiceCommands([
    {
      phrases: ['add * to cart', 'add * to my cart'],
      handler: async (matches) => {
        const productName = matches[0];
        const product = await findProduct(productName);
        if (product) {
          addItem(product);
          return `Added ${product.name} to your cart`;
        }
        return `Sorry, I couldn't find "${productName}"`;
      }
    },
    {
      phrases: ['remove * from cart', 'delete *'],
      handler: async (matches) => {
        const productName = matches[0];
        const item = cart.items.find(item => 
          item.name.toLowerCase().includes(productName.toLowerCase())
        );
        if (item) {
          removeItem(item.id);
          return `Removed ${item.name} from your cart`;
        }
        return `"${productName}" is not in your cart`;
      }
    },
    {
      phrases: ['show cart', 'what\'s in my cart', 'check cart'],
      handler: () => {
        const itemCount = cart.items.length;
        const total = cart.total;
        return `You have ${itemCount} items in your cart, total $${total.toFixed(2)}`;
      }
    }
  ]);
  
  const { isListening, response } = useVoice({
    commands: voiceCommands,
    autoListen: true
  });

  return (
    <div className="voice-cart">
      <div className="cart-header">
        <h2>Shopping Cart</h2>
        <div className={`voice-indicator ${isListening ? 'active' : ''}`}>
          🎤 Voice commands enabled
        </div>
      </div>
      
      {response && (
        <div className="voice-response">
          🔊 {response}
        </div>
      )}
      
      <div className="cart-items">
        {cart.items.map(item => (
          <div key={item.id} className="cart-item">
            <span>{item.name}</span>
            <span>${item.price}</span>
            <span>Qty: {item.quantity}</span>
          </div>
        ))}
      </div>
      
      <div className="voice-help">
        <h4>Voice Commands:</h4>
        <ul>
          <li>"Add [product] to cart"</li>
          <li>"Remove [product] from cart"</li>
          <li>"Show cart" or "What's in my cart?"</li>
        </ul>
      </div>
    </div>
  );
}
```

## Customer Support Integration

### Voice-Enabled Help System

```tsx
import React, { useState } from 'react';
import { useVoice } from '@sitespeak/react-voice';
import { VoiceVisualizer } from '@sitespeak/voice-components';

function VoiceSupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState([]);
  
  const {
    isConnected,
    isListening,
    isProcessing,
    transcript,
    response,
    audioLevel,
    startListening,
    stopListening,
    sendText
  } = useVoice({
    onResponse: (response) => {
      setConversation(prev => [...prev, {
        type: 'assistant',
        text: response.text,
        timestamp: new Date()
      }]);
    },
    onFinalTranscript: (text) => {
      setConversation(prev => [...prev, {
        type: 'user', 
        text,
        timestamp: new Date()
      }]);
    }
  });

  const quickActions = [
    {
      label: "Check Order Status",
      query: "I'd like to check my order status"
    },
    {
      label: "Return Policy", 
      query: "What's your return policy?"
    },
    {
      label: "Technical Support",
      query: "I need technical support"
    }
  ];

  return (
    <>
      {/* Floating support button */}
      {!isOpen && (
        <button 
          className="support-fab"
          onClick={() => setIsOpen(true)}
        >
          🎧 Voice Support
        </button>
      )}

      {/* Support widget */}
      {isOpen && (
        <div className="voice-support-widget">
          <div className="widget-header">
            <h3>Voice Support</h3>
            <button 
              className="close-btn"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </div>

          {/* Connection status */}
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            {isConnected ? 'Connected' : 'Connecting...'}
          </div>

          {/* Voice visualizer */}
          <VoiceVisualizer 
            isListening={isListening}
            isProcessing={isProcessing}
            audioLevel={audioLevel}
          />

          {/* Quick actions */}
          {conversation.length === 0 && (
            <div className="quick-actions">
              <p>How can I help you today?</p>
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  className="quick-action-btn"
                  onClick={() => sendText(action.query)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Conversation */}
          <div className="conversation">
            {conversation.map((message, index) => (
              <div 
                key={index}
                className={`message ${message.type}`}
              >
                <div className="message-text">{message.text}</div>
                <div className="message-time">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
            
            {/* Current transcript */}
            {transcript && (
              <div className="message user partial">
                {transcript}
              </div>
            )}
            
            {/* Processing indicator */}
            {isProcessing && (
              <div className="message assistant processing">
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="widget-controls">
            <button
              className={`voice-btn ${isListening ? 'listening' : ''}`}
              onClick={isListening ? stopListening : startListening}
              disabled={!isConnected}
            >
              🎤 {isListening ? 'Stop' : 'Talk'}
            </button>
            
            <div className="controls-hint">
              {isListening ? 'Listening...' : 
               isProcessing ? 'Processing...' :
               isConnected ? 'Ready' : 'Connecting...'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

## Educational Platform Integration

### Voice-Interactive Learning Module

```tsx
import React, { useState, useEffect } from 'react';
import { useVoice } from '@sitespeak/react-voice';

function VoiceLearningModule({ lesson }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [userProgress, setUserProgress] = useState({});
  const [feedback, setFeedback] = useState('');

  const {
    isListening,
    transcript,
    response,
    startListening,
    stopListening,
    sendText
  } = useVoice({
    onFinalTranscript: async (text) => {
      // Process student's spoken answer
      const result = await evaluateAnswer(lesson.id, currentStep, text);
      setFeedback(result.feedback);
      
      if (result.correct) {
        // Move to next step after correct answer
        setTimeout(() => {
          nextStep();
        }, 2000);
      }
    }
  });

  const nextStep = () => {
    if (currentStep < lesson.steps.length - 1) {
      setCurrentStep(currentStep + 1);
      setFeedback('');
    }
  };

  const currentStepData = lesson.steps[currentStep];

  // Auto-read lesson content
  useEffect(() => {
    if (currentStepData.autoSpeak) {
      sendText(currentStepData.content);
    }
  }, [currentStep]);

  return (
    <div className="voice-learning-module">
      <div className="lesson-header">
        <h2>{lesson.title}</h2>
        <div className="progress-bar">
          <div 
            className="progress-fill"
            style={{ width: `${((currentStep + 1) / lesson.steps.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="lesson-content">
        <div className="step-content">
          <h3>Step {currentStep + 1}</h3>
          <p>{currentStepData.content}</p>
          
          {currentStepData.image && (
            <img src={currentStepData.image} alt="Lesson illustration" />
          )}
        </div>

        {currentStepData.type === 'question' && (
          <div className="question-section">
            <div className="question">{currentStepData.question}</div>
            
            <button
              className={`voice-answer-btn ${isListening ? 'listening' : ''}`}
              onClick={isListening ? stopListening : startListening}
            >
              🎤 {isListening ? 'Stop Recording' : 'Record Answer'}
            </button>

            {transcript && (
              <div className="transcript">
                Your answer: "{transcript}"
              </div>
            )}

            {feedback && (
              <div className={`feedback ${feedback.includes('Correct') ? 'correct' : 'incorrect'}`}>
                {feedback}
              </div>
            )}
          </div>
        )}

        {currentStepData.type === 'pronunciation' && (
          <PronunciationPractice 
            targetPhrase={currentStepData.targetPhrase}
            onComplete={nextStep}
          />
        )}
      </div>

      <div className="lesson-controls">
        <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}>
          Previous
        </button>
        <button onClick={nextStep}>
          Skip
        </button>
      </div>
    </div>
  );
}

function PronunciationPractice({ targetPhrase, onComplete }) {
  const [attempts, setAttempts] = useState([]);
  const [bestScore, setBestScore] = useState(0);

  const { isListening, transcript, startListening, stopListening } = useVoice({
    onFinalTranscript: async (text) => {
      const score = await evaluatePronunciation(targetPhrase, text);
      const newAttempt = { text, score, timestamp: new Date() };
      
      setAttempts(prev => [...prev, newAttempt]);
      
      if (score > bestScore) {
        setBestScore(score);
      }
      
      // Complete if good enough
      if (score > 0.8) {
        setTimeout(onComplete, 1500);
      }
    }
  });

  return (
    <div className="pronunciation-practice">
      <div className="target-phrase">
        <h4>Say this phrase:</h4>
        <div className="phrase">"{targetPhrase}"</div>
      </div>

      <button
        className={`pronunciation-btn ${isListening ? 'listening' : ''}`}
        onClick={isListening ? stopListening : startListening}
      >
        🎤 {isListening ? 'Recording...' : 'Try Pronunciation'}
      </button>

      {transcript && (
        <div className="attempt">
          You said: "{transcript}"
        </div>
      )}

      <div className="score-display">
        Best Score: {Math.round(bestScore * 100)}%
      </div>

      <div className="attempts-history">
        {attempts.map((attempt, index) => (
          <div key={index} className="attempt-item">
            <span>"{attempt.text}"</span>
            <span className="score">{Math.round(attempt.score * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper functions
async function evaluateAnswer(lessonId, stepIndex, answer) {
  const response = await fetch('/api/education/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lessonId, stepIndex, answer })
  });
  return response.json();
}

async function evaluatePronunciation(target, spoken) {
  const response = await fetch('/api/education/pronunciation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, spoken })
  });
  const result = await response.json();
  return result.score;
}
```

## Advanced Custom Implementation

### Custom Voice Component with Fine-Grained Control

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { TurnManager, VisualFeedbackService, VoicePresets } from '@sitespeak/voice-services';

function CustomVoiceInterface() {
  const [turnManager, setTurnManager] = useState(null);
  const [visualFeedback, setVisualFeedback] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [micState, setMicState] = useState('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Initialize voice services
  useEffect(() => {
    async function initVoice() {
      try {
        // Create WebSocket transport
        const ws = new WebSocket('wss://your-api.com/voice-ws?token=' + getJWTToken());
        
        const transport = {
          send: async (data) => {
            if (ws.readyState === WebSocket.OPEN) {
              if (data instanceof ArrayBuffer) {
                ws.send(data);
              } else {
                ws.send(JSON.stringify(data));
              }
            }
          },
          on: (event, callback) => {
            ws.addEventListener('message', (e) => {
              if (typeof e.data === 'string') {
                const message = JSON.parse(e.data);
                if (message.type === event) {
                  callback(message);
                }
              }
            });
          },
          disconnect: () => ws.close()
        };

        // Initialize TurnManager with custom config
        const tm = new TurnManager({
          ...VoicePresets.highPerformance.turnManager,
          transport,
          locale: 'en-US'
        });

        // Initialize Visual Feedback
        const vf = new VisualFeedbackService();

        // Setup event listeners
        tm.on('event', (event) => {
          switch (event.type) {
            case 'mic_opened':
              setMicState('listening');
              setIsListening(true);
              break;
            case 'mic_closed':
              setMicState('idle');
              setIsListening(false);
              break;
            case 'vad':
              setAudioLevel(event.level);
              vf.updateAudioLevel(event.level);
              break;
            case 'partial_asr':
              setTranscript(event.text);
              vf.showPartialTranscript(event.text, event.confidence);
              break;
            case 'final_asr':
              setTranscript(event.text);
              vf.showFinalTranscript(event.text, event.lang);
              break;
            case 'barge_in':
              console.log('Barge-in detected');
              break;
            case 'error':
              console.error('Voice error:', event);
              vf.showErrorToast({
                type: 'error',
                title: 'Voice Error',
                message: event.message
              });
              break;
          }
        });

        // Start services
        await tm.start();
        vf.start();

        setTurnManager(tm);
        setVisualFeedback(vf);
        setIsInitialized(true);

      } catch (error) {
        console.error('Failed to initialize voice services:', error);
      }
    }

    initVoice();

    // Cleanup on unmount
    return () => {
      if (turnManager) {
        turnManager.stop();
      }
      if (visualFeedback) {
        visualFeedback.stop();
      }
    };
  }, []);

  // Voice controls
  const startVoiceInput = async () => {
    if (turnManager && isInitialized) {
      try {
        // This would trigger microphone access through TurnManager
        setIsListening(true);
        visualFeedback?.updateMicState('listening');
      } catch (error) {
        console.error('Failed to start voice input:', error);
      }
    }
  };

  const stopVoiceInput = () => {
    if (turnManager) {
      setIsListening(false);
      visualFeedback?.updateMicState('idle');
    }
  };

  const sendTextMessage = async (text) => {
    if (turnManager) {
      await turnManager.pushText(text);
    }
  };

  return (
    <div className="custom-voice-interface">
      <div className="voice-status">
        <div className={`connection-indicator ${isInitialized ? 'connected' : 'disconnected'}`}>
          {isInitialized ? '● Connected' : '○ Connecting...'}
        </div>
        <div className="mic-state">
          Microphone: {micState}
        </div>
      </div>

      {/* Audio level visualizer */}
      <div className="audio-visualizer">
        <div 
          className="level-bar"
          style={{ 
            height: `${Math.max(4, audioLevel * 100)}px`,
            backgroundColor: isListening ? '#00ff00' : '#666'
          }}
        />
      </div>

      {/* Transcript display */}
      <div className="transcript-area">
        {transcript ? (
          <div className="transcript">{transcript}</div>
        ) : (
          <div className="placeholder">Speak or type your message...</div>
        )}
      </div>

      {/* Controls */}
      <div className="voice-controls">
        <button
          className={`voice-button ${isListening ? 'listening' : ''}`}
          onClick={isListening ? stopVoiceInput : startVoiceInput}
          disabled={!isInitialized}
        >
          🎤 {isListening ? 'Stop' : 'Start'} Voice
        </button>

        <button
          onClick={() => sendTextMessage('Hello, how can you help me?')}
          disabled={!isInitialized}
        >
          💬 Send Text
        </button>

        <button
          onClick={() => setTranscript('')}
        >
          🗑️ Clear
        </button>
      </div>

      {/* Performance metrics */}
      <div className="performance-metrics">
        {turnManager && (
          <div className="metrics">
            <div>Audio Level: {Math.round(audioLevel * 100)}%</div>
            <div>Status: {micState}</div>
            <div>Listening: {isListening ? 'Yes' : 'No'}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function getJWTToken() {
  // Your JWT token logic
  return localStorage.getItem('jwt') || 'your-jwt-token';
}
```

## Performance Optimization Examples

### Adaptive Quality Based on Network Conditions

```typescript
import { voiceOrchestrator, VoicePresets } from '@sitespeak/voice-services';

class AdaptiveVoiceManager {
  private currentPreset = 'balanced';
  private networkMonitor = new NetworkQualityMonitor();
  private performanceMetrics = {
    latency: [],
    packetLoss: 0,
    bandwidth: 0
  };

  constructor() {
    this.setupNetworkMonitoring();
    this.setupPerformanceMonitoring();
  }

  private setupNetworkMonitoring() {
    this.networkMonitor.on('quality-change', (quality) => {
      this.adaptToNetworkQuality(quality);
    });

    // Monitor WebRTC connection stats
    setInterval(() => {
      this.checkConnectionStats();
    }, 5000);
  }

  private setupPerformanceMonitoring() {
    voiceOrchestrator.on('session_metrics', (metrics) => {
      this.performanceMetrics.latency.push(metrics.avgLatency);
      
      // Keep only recent metrics
      if (this.performanceMetrics.latency.length > 10) {
        this.performanceMetrics.latency.shift();
      }

      this.evaluatePerformance();
    });
  }

  private adaptToNetworkQuality(quality: 'excellent' | 'good' | 'poor') {
    let newPreset: string;

    switch (quality) {
      case 'excellent':
        newPreset = 'highPerformance';
        break;
      case 'good':
        newPreset = 'balanced';
        break;
      case 'poor':
        newPreset = 'conservative';
        break;
    }

    if (newPreset !== this.currentPreset) {
      this.updateVoiceConfiguration(newPreset);
      this.currentPreset = newPreset;
    }
  }

  private async updateVoiceConfiguration(preset: string) {
    const config = VoicePresets[preset];
    
    // Update Opus framer settings
    voiceOrchestrator.opusFramer.updateConfig({
      frameMs: config.turnManager.opus.frameMs,
      bitrate: config.turnManager.opus.bitrate
    });

    // Update VAD sensitivity
    voiceOrchestrator.turnManager?.updateConfig({
      vad: config.turnManager.vad
    });

    console.log(`Voice quality adapted to ${preset} preset`);
  }

  private evaluatePerformance() {
    const avgLatency = this.performanceMetrics.latency.reduce((a, b) => a + b, 0) / 
                      this.performanceMetrics.latency.length;

    // If performance is degrading, switch to more conservative settings
    if (avgLatency > 500) { // 500ms threshold
      this.adaptToNetworkQuality('poor');
    } else if (avgLatency > 300) {
      this.adaptToNetworkQuality('good');
    } else {
      this.adaptToNetworkQuality('excellent');
    }
  }

  private checkConnectionStats() {
    // Implementation would check actual WebRTC stats
    // This is a simplified example
    const stats = voiceOrchestrator.getStatus();
    
    this.performanceMetrics.packetLoss = stats.components.wsServer.errors / 
                                        stats.components.wsServer.totalMessages;
  }
}

class NetworkQualityMonitor extends EventTarget {
  private connection = (navigator as any).connection;
  
  constructor() {
    super();
    this.startMonitoring();
  }

  private startMonitoring() {
    if (this.connection) {
      this.connection.addEventListener('change', () => {
        this.evaluateQuality();
      });
    }

    // Fallback: ping-based monitoring
    setInterval(() => {
      this.pingBasedQualityCheck();
    }, 10000);

    this.evaluateQuality();
  }

  private evaluateQuality() {
    let quality: 'excellent' | 'good' | 'poor';

    if (this.connection) {
      const effectiveType = this.connection.effectiveType;
      
      switch (effectiveType) {
        case '4g':
          quality = 'excellent';
          break;
        case '3g':
          quality = 'good';
          break;
        default:
          quality = 'poor';
      }
    } else {
      quality = 'good'; // Default assumption
    }

    this.dispatchEvent(new CustomEvent('quality-change', { detail: quality }));
  }

  private async pingBasedQualityCheck() {
    try {
      const start = Date.now();
      await fetch('/api/ping', { cache: 'no-cache' });
      const latency = Date.now() - start;

      let quality: 'excellent' | 'good' | 'poor';
      if (latency < 100) {
        quality = 'excellent';
      } else if (latency < 300) {
        quality = 'good';
      } else {
        quality = 'poor';
      }

      this.dispatchEvent(new CustomEvent('quality-change', { detail: quality }));
    } catch (error) {
      this.dispatchEvent(new CustomEvent('quality-change', { detail: 'poor' }));
    }
  }
}

// Usage
const adaptiveManager = new AdaptiveVoiceManager();
```

These examples demonstrate practical implementations of voice services across different use cases, from simple voice assistants to complex educational platforms. Each example includes error handling, performance considerations, and user experience optimizations.
