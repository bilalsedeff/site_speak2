/**
 * Voice Widget App - React-based voice interface
 * 
 * Implements a voice-first UI with real-time feedback,
 * microphone controls, and action visualization.
 */

import { ActionsBridge } from '../bridge/ActionsBridge';

export interface VoiceWidgetConfig {
  siteId: string;
  tenantId: string;
  userId?: string;
  apiEndpoint: string;
  wsEndpoint: string;
  locale?: string;
  theme?: 'light' | 'dark' | 'auto';
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  size?: 'small' | 'medium' | 'large';
  autoStart?: boolean;
  debugMode?: boolean;
}

interface VoiceWidgetAppConfig {
  config: VoiceWidgetConfig;
  shadowRoot: ShadowRoot;
  actionsBridge: ActionsBridge;
}

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface VoiceSession {
  id: string;
  state: VoiceState;
  isRecording: boolean;
  audioLevel: number;
  partialTranscript: string;
  finalTranscript: string;
  response: string;
  error: string | null;
  actions: Array<{
    id: string;
    name: string;
    status: 'pending' | 'executing' | 'completed' | 'failed';
    description: string;
  }>;
}

export class VoiceWidgetApp {
  private config: VoiceWidgetAppConfig;
  private mounted = false;
  private widgetContainer: HTMLElement | null = null;
  private session: VoiceSession;
  private eventListeners: Map<string, EventListener> = new Map();
  private animationFrame: number | null = null;

  constructor(config: VoiceWidgetAppConfig) {
    this.config = config;
    this.session = this.createInitialSession();
  }

  private createInitialSession(): VoiceSession {
    return {
      id: crypto.randomUUID(),
      state: 'idle',
      isRecording: false,
      audioLevel: 0,
      partialTranscript: '',
      finalTranscript: '',
      response: '',
      error: null,
      actions: [],
    };
  }

  /**
   * Mount the voice widget into the shadow root
   */
  async mount(): Promise<void> {
    if (this.mounted) {
      return;
    }

    this.createWidgetUI();
    this.setupEventListeners();
    this.startUpdateLoop();
    
    // Initialize actions bridge
    await this.config.actionsBridge.init();
    
    this.mounted = true;
    
    // Auto-start if configured
    if (this.config.config.autoStart) {
      setTimeout(() => this.startListening(), 1000);
    }
    
    this.log('Voice widget mounted successfully');
  }

  private createWidgetUI(): void {
    const container = document.createElement('div');
    container.className = 'voice-widget-container';
    
    container.innerHTML = `
      <style>
        :host {
          --primary-color: #2563eb;
          --primary-hover: #1d4ed8;
          --success-color: #10b981;
          --error-color: #ef4444;
          --text-color: #374151;
          --bg-color: #ffffff;
          --shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1);
        }
        
        .voice-widget-container {
          position: fixed;
          ${this.getPositionStyles()}
          z-index: 10000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .widget-button {
          width: ${this.getButtonSize()}px;
          height: ${this.getButtonSize()}px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          box-shadow: var(--shadow);
          position: relative;
          overflow: hidden;
        }
        
        .widget-button.idle {
          background: var(--primary-color);
          color: white;
        }
        
        .widget-button.listening {
          background: var(--success-color);
          color: white;
          animation: pulse 2s infinite;
        }
        
        .widget-button.processing {
          background: var(--primary-color);
          color: white;
          animation: spin 1s linear infinite;
        }
        
        .widget-button.speaking {
          background: var(--primary-hover);
          color: white;
        }
        
        .widget-button.error {
          background: var(--error-color);
          color: white;
        }
        
        .widget-button:hover {
          transform: scale(1.05);
        }
        
        .audio-level {
          position: absolute;
          top: -2px;
          left: -2px;
          right: -2px;
          bottom: -2px;
          border-radius: 50%;
          border: 3px solid transparent;
          transition: border-color 0.1s ease;
        }
        
        .transcript-bubble {
          position: absolute;
          bottom: ${this.getButtonSize() + 20}px;
          right: 0;
          max-width: 300px;
          padding: 12px 16px;
          background: var(--bg-color);
          border-radius: 16px;
          box-shadow: var(--shadow);
          border: 1px solid #e5e7eb;
          font-size: 14px;
          line-height: 1.4;
          display: none;
        }
        
        .transcript-bubble.visible {
          display: block;
          animation: slideUp 0.3s ease;
        }
        
        .partial-text {
          color: #9ca3af;
          font-style: italic;
        }
        
        .final-text {
          color: var(--text-color);
        }
        
        .actions-list {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #e5e7eb;
        }
        
        .action-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #6b7280;
          margin: 4px 0;
        }
        
        .action-status {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        
        .action-status.pending {
          background: #d1d5db;
        }
        
        .action-status.executing {
          background: var(--primary-color);
          animation: pulse 1s infinite;
        }
        
        .action-status.completed {
          background: var(--success-color);
        }
        
        .action-status.failed {
          background: var(--error-color);
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      </style>
      
      <div class="widget-button idle" id="voiceButton">
        <div class="audio-level" id="audioLevel"></div>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" id="micIcon">
          <path d="M12 1c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2s2-.9 2-2V3c0-1.1-.9-2-2-2zm4 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H4c0 3.53 2.61 6.43 6 6.92V21h4v-7.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" id="processingIcon" style="display: none;">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v6m6 6h6m-6 6v6m-6-6H1"/>
        </svg>
      </div>
      
      <div class="transcript-bubble" id="transcriptBubble">
        <div id="transcriptContent"></div>
        <div class="actions-list" id="actionsList" style="display: none;"></div>
      </div>
    `;
    
    this.widgetContainer = container;
    this.config.shadowRoot.appendChild(container);
  }

  private getPositionStyles(): string {
    const position = this.config.config.position || 'bottom-right';
    const [vertical, horizontal] = position.split('-');
    
    return `
      ${vertical}: 20px;
      ${horizontal}: 20px;
    `;
  }

  private getButtonSize(): number {
    const size = this.config.config.size || 'medium';
    const sizes = { small: 50, medium: 60, large: 70 };
    return sizes[size];
  }

  private setupEventListeners(): void {
    const button = this.config.shadowRoot.getElementById('voiceButton');
    if (!button) {return;}

    const clickHandler = this.handleButtonClick.bind(this);
    button.addEventListener('click', clickHandler);
    this.eventListeners.set('buttonClick', clickHandler);

    // Keyboard accessibility
    const keyHandler = (e: Event) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
        keyEvent.preventDefault();
        this.handleButtonClick();
      }
    };
    button.addEventListener('keydown', keyHandler);
    this.eventListeners.set('buttonKeydown', keyHandler);

    // Make button focusable
    button.setAttribute('tabindex', '0');
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', 'Voice assistant');
  }

  private async handleButtonClick(): Promise<void> {
    switch (this.session.state) {
      case 'idle':
        await this.startListening();
        break;
      case 'listening':
        this.stopListening();
        break;
      case 'processing':
        // Cannot interrupt processing
        break;
      case 'speaking':
        this.stopSpeaking();
        break;
      case 'error':
        this.resetSession();
        break;
    }
  }

  private async startListening(): Promise<void> {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // TODO: Use stream for actual audio processing
      // For now, clean up the stream
      stream.getTracks().forEach(track => track.stop());
      
      this.updateSession({ 
        state: 'listening',
        isRecording: true,
        error: null,
        partialTranscript: '',
        finalTranscript: ''
      });
      
      this.log('Started listening');
      
      // TODO: Start actual voice recognition
      // For now, simulate with setTimeout
      setTimeout(() => {
        this.updateSession({
          partialTranscript: 'Hello, how can I help you...'
        });
      }, 1000);
      
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Microphone access denied');
    }
  }

  private stopListening(): void {
    this.updateSession({
      state: 'processing',
      isRecording: false,
      finalTranscript: this.session.partialTranscript
    });
    
    this.log('Stopped listening, processing...');
    
    // TODO: Send to voice API
    // For now, simulate processing
    setTimeout(() => {
      this.updateSession({
        state: 'speaking',
        response: 'I understand you said: ' + this.session.finalTranscript
      });
      
      // Auto-return to idle after speaking
      setTimeout(() => {
        this.resetSession();
      }, 3000);
    }, 2000);
  }

  private stopSpeaking(): void {
    this.updateSession({ state: 'idle' });
    this.log('Stopped speaking');
  }

  private handleError(error: string): void {
    this.updateSession({
      state: 'error',
      error,
      isRecording: false
    });
    
    this.log('Error: ' + error);
    
    // Auto-reset after showing error
    setTimeout(() => {
      this.resetSession();
    }, 3000);
  }

  private resetSession(): void {
    this.session = this.createInitialSession();
    this.updateUI();
    this.log('Session reset');
  }

  private updateSession(updates: Partial<VoiceSession>): void {
    this.session = { ...this.session, ...updates };
    this.updateUI();
  }

  private updateUI(): void {
    const button = this.config.shadowRoot.getElementById('voiceButton');
    const audioLevel = this.config.shadowRoot.getElementById('audioLevel');
    const transcriptBubble = this.config.shadowRoot.getElementById('transcriptBubble');
    const transcriptContent = this.config.shadowRoot.getElementById('transcriptContent');
    const actionsList = this.config.shadowRoot.getElementById('actionsList');
    const micIcon = this.config.shadowRoot.getElementById('micIcon');
    const processingIcon = this.config.shadowRoot.getElementById('processingIcon');
    
    if (!button || !audioLevel || !transcriptBubble || !transcriptContent || !actionsList || !micIcon || !processingIcon) {
      return;
    }

    // Update button state
    button.className = `widget-button ${this.session.state}`;
    
    // Update icons
    if (this.session.state === 'processing') {
      micIcon.style.display = 'none';
      processingIcon.style.display = 'block';
    } else {
      micIcon.style.display = 'block';
      processingIcon.style.display = 'none';
    }
    
    // Update audio level visualization
    if (this.session.isRecording && this.session.audioLevel > 0) {
      const intensity = Math.min(this.session.audioLevel * 100, 100);
      audioLevel.style.borderColor = `rgba(34, 197, 94, ${intensity / 100})`;
    } else {
      audioLevel.style.borderColor = 'transparent';
    }
    
    // Update transcript bubble
    const hasContent = this.session.partialTranscript || this.session.finalTranscript || this.session.response || this.session.error;
    
    if (hasContent) {
      transcriptBubble.classList.add('visible');
      
      let content = '';
      
      if (this.session.error) {
        content = `<div style="color: var(--error-color);">❌ ${this.session.error}</div>`;
      } else if (this.session.response) {
        content = `<div class="final-text">🤖 ${this.session.response}</div>`;
      } else if (this.session.finalTranscript) {
        content = `<div class="final-text">${this.session.finalTranscript}</div>`;
      } else if (this.session.partialTranscript) {
        content = `<div class="partial-text">${this.session.partialTranscript}</div>`;
      }
      
      transcriptContent.innerHTML = content;
      
      // Update actions
      if (this.session.actions.length > 0) {
        actionsList.style.display = 'block';
        actionsList.innerHTML = this.session.actions.map(action => `
          <div class="action-item">
            <div class="action-status ${action.status}"></div>
            <span>${action.description}</span>
          </div>
        `).join('');
      } else {
        actionsList.style.display = 'none';
      }
    } else {
      transcriptBubble.classList.remove('visible');
    }
  }

  private startUpdateLoop(): void {
    const update = () => {
      if (this.mounted && this.session.isRecording) {
        // Simulate audio level (in real implementation, this would come from audio analysis)
        this.session.audioLevel = 0.3 + Math.random() * 0.4;
        this.updateUI();
      }
      
      if (this.mounted) {
        this.animationFrame = requestAnimationFrame(update);
      }
    };
    
    this.animationFrame = requestAnimationFrame(update);
  }

  private log(message: string): void {
    if (this.config.config.debugMode) {
      console.log(`[VoiceWidget] ${message}`);
    }
  }

  /**
   * Update widget configuration
   */
  updateConfig(newConfig: Partial<VoiceWidgetConfig>): void {
    this.config.config = { ...this.config.config, ...newConfig };
    this.log('Configuration updated');
    
    if (this.mounted) {
      // Re-render widget with new config
      this.config.shadowRoot.innerHTML = '';
      this.createWidgetUI();
      this.setupEventListeners();
    }
  }

  /**
   * Add an action to the current session
   */
  addAction(action: {
    id: string;
    name: string;
    description: string;
    status?: 'pending' | 'executing' | 'completed' | 'failed';
  }): void {
    this.session.actions.push({
      ...action,
      status: action.status || 'pending'
    });
    this.updateUI();
  }

  /**
   * Update an action status
   */
  updateActionStatus(actionId: string, status: 'pending' | 'executing' | 'completed' | 'failed'): void {
    const action = this.session.actions.find(a => a.id === actionId);
    if (action) {
      action.status = status;
      this.updateUI();
    }
  }

  /**
   * Handle page navigation changes
   */
  handleNavigationChange(): void {
    this.log('Page navigation detected');
  }

  /**
   * Handle page visibility changes
   */
  handleVisibilityChange(visible: boolean): void {
    if (!visible && this.session.isRecording) {
      this.stopListening();
      this.log('Stopped recording due to page hidden');
    }
  }

  /**
   * Get current widget state
   */
  getState(): VoiceSession {
    return { ...this.session };
  }

  /**
   * Start a voice conversation programmatically
   */
  async startVoiceSession(): Promise<void> {
    await this.startListening();
  }

  /**
   * Stop current voice conversation
   */
  stopVoiceSession(): void {
    if (this.session.isRecording) {
      this.stopListening();
    } else if (this.session.state === 'speaking') {
      this.stopSpeaking();
    }
  }

  /**
   * Unmount and cleanup the application
   */
  unmount(): void {
    if (!this.mounted) {
      return;
    }

    // Stop any ongoing sessions
    this.stopVoiceSession();
    
    // Cancel animation frame
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    // Remove event listeners
    this.eventListeners.forEach((listener, key) => {
      const element = this.config.shadowRoot.querySelector(`#${key.replace('Event', '')}`);
      if (element) {
        element.removeEventListener(key.replace('Event', ''), listener);
      }
    });
    this.eventListeners.clear();
    
    // Clean up DOM
    if (this.widgetContainer) {
      this.config.shadowRoot.removeChild(this.widgetContainer);
    }
    this.config.shadowRoot.innerHTML = '';
    this.widgetContainer = null;
    
    // Cleanup actions bridge
    this.config.actionsBridge.destroy();
    
    this.mounted = false;
    this.log('Voice widget unmounted');
  }
}