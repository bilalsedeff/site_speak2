/**
 * Voice Widget Embed Script - One-line embeddable voice assistant
 * Following Frontend Source-of-Truth: Shadow DOM isolation, postMessage bridge
 */

import { VoiceWidgetApp, VoiceWidgetConfig } from './app/VoiceWidgetApp'
import { ActionsBridge } from './bridge/ActionsBridge'

interface EmbedConfig {
  siteId: string
  tenantId: string
  userId?: string
  apiEndpoint?: string
  wsEndpoint?: string
  theme?: 'light' | 'dark' | 'auto'
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  color?: string
  size?: 'small' | 'medium' | 'large'
  locale?: string
  autoStart?: boolean
  debugMode?: boolean
  features?: {
    voiceEnabled?: boolean
    suggestionsEnabled?: boolean
    actionsEnabled?: boolean
  }
}

interface WindowWithSiteSpeak extends Window {
  SiteSpeak?: {
    voice: VoiceWidgetManager
    config: EmbedConfig
    version: string
  }
}

declare let window: WindowWithSiteSpeak

/**
 * Map legacy size values to new size values
 */
function mapSizeFromDataset(size?: string): 'small' | 'medium' | 'large' | undefined {
  switch (size) {
    case 'sm': return 'small';
    case 'md': return 'medium';  
    case 'lg': return 'large';
    default: return undefined;
  }
}

/**
 * Voice Widget Manager - Core embed functionality
 */
class VoiceWidgetManager {
  private shadowRoot: ShadowRoot | null = null
  private container: HTMLElement | null = null
  private app: VoiceWidgetApp | null = null
  private config: EmbedConfig
  private actionsBridge: ActionsBridge | null = null

  constructor(config: EmbedConfig) {
    this.config = {
      apiEndpoint: config.apiEndpoint || 'https://api.sitespeak.ai',
      wsEndpoint: config.wsEndpoint || 'wss://api.sitespeak.ai/voice',
      theme: 'auto',
      position: 'bottom-right',
      size: 'medium',
      locale: 'en-US',
      autoStart: false,
      debugMode: false,
      features: {
        voiceEnabled: true,
        suggestionsEnabled: true,
        actionsEnabled: true,
      },
      ...config,
    }
  }

  /**
   * Initialize and mount the voice widget
   */
  async init(): Promise<void> {
    if (this.shadowRoot) {
      console.warn('SiteSpeak Voice Widget already initialized')
      return
    }

    // Create container
    this.container = document.createElement('div')
    this.container.id = 'sitespeak-voice-widget'
    this.container.setAttribute('data-sitespeak-widget', 'true')
    
    // Position styling
    this.container.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      ${this.getPositionStyles()}
    `

    // Create Shadow DOM for style isolation
    this.shadowRoot = this.container.attachShadow({ mode: 'closed' })

    // Inject styles
    await this.injectStyles()

    // Initialize Actions Bridge if enabled
    if (this.config.features?.actionsEnabled) {
      this.actionsBridge = new ActionsBridge()
      await this.actionsBridge.init()
    }

    // Convert EmbedConfig to VoiceWidgetConfig
    const voiceWidgetConfig: VoiceWidgetConfig = {
      siteId: this.config.siteId,
      tenantId: this.config.tenantId,
      apiEndpoint: this.config.apiEndpoint || 'https://api.sitespeak.ai',
      wsEndpoint: this.config.wsEndpoint || 'wss://api.sitespeak.ai/voice',
      ...(this.config.userId && { userId: this.config.userId }),
      ...(this.config.locale && { locale: this.config.locale }),
      ...(this.config.theme && { theme: this.config.theme }),
      ...(this.config.position && { position: this.config.position }),
      ...(this.config.size && { size: this.config.size }),
      ...(this.config.autoStart !== undefined && { autoStart: this.config.autoStart }),
      ...(this.config.debugMode !== undefined && { debugMode: this.config.debugMode }),
    };

    // Create and mount React app
    this.app = new VoiceWidgetApp({
      config: voiceWidgetConfig,
      shadowRoot: this.shadowRoot,
      actionsBridge: this.actionsBridge!,
    })

    await this.app.mount()

    // Append to body
    document.body.appendChild(this.container)

    // Setup event listeners
    this.setupEventListeners()

    if (process.env['NODE_ENV'] === 'development' || this.config.debugMode) {
      console.log('SiteSpeak Voice Widget initialized', {
        version: window.SiteSpeak?.version,
        config: this.config,
      })
    }
  }

  /**
   * Get position styles based on config
   */
  private getPositionStyles(): string {
    const spacing = '24px'
    
    switch (this.config.position) {
      case 'bottom-right':
        return `bottom: ${spacing}; right: ${spacing};`
      case 'bottom-left':
        return `bottom: ${spacing}; left: ${spacing};`
      case 'top-right':
        return `top: ${spacing}; right: ${spacing};`
      case 'top-left':
        return `top: ${spacing}; left: ${spacing};`
      default:
        return `bottom: ${spacing}; right: ${spacing};`
    }
  }

  /**
   * Inject widget styles into Shadow DOM
   */
  private async injectStyles(): Promise<void> {
    if (!this.shadowRoot) {return}

    const style = document.createElement('style')
    style.textContent = `
      /* Reset and base styles */
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      :host {
        --primary: ${this.config.color || '221.2 83.2% 53.3%'};
        --primary-foreground: 210 40% 98%;
        --background: 0 0% 100%;
        --foreground: 222.2 84% 4.9%;
        --muted: 210 40% 96%;
        --muted-foreground: 215.4 16.3% 46.9%;
        --border: 214.3 31.8% 91.4%;
        --ring: var(--primary);
        
        /* Motion tokens */
        --motion-fast: 150ms;
        --motion-default: 250ms;
        --motion-ease: cubic-bezier(0.4, 0.0, 0.2, 1);
      }

      /* Dark mode */
      @media (prefers-color-scheme: dark) {
        :host {
          --background: 222.2 84% 4.9%;
          --foreground: 210 40% 98%;
          --muted: 217.2 32.6% 17.5%;
          --muted-foreground: 215 20.2% 65.1%;
          --border: 217.2 32.6% 17.5%;
        }
      }

      /* Widget container */
      .voice-widget {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: hsl(var(--foreground));
        pointer-events: auto;
      }

      /* Voice button */
      .voice-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: none;
        background: hsl(var(--primary));
        color: hsl(var(--primary-foreground));
        cursor: pointer;
        transition: all var(--motion-fast) var(--motion-ease);
        box-shadow: 0 4px 12px hsl(var(--primary) / 0.4);
        
        /* Touch target compliance: 44pt minimum */
        min-width: 56px;
        min-height: 56px;
      }

      .voice-button:hover {
        background: hsl(var(--primary) / 0.9);
        transform: translateY(-2px);
        box-shadow: 0 8px 20px hsl(var(--primary) / 0.4);
      }

      .voice-button:active {
        transform: translateY(-1px) scale(0.98);
      }

      .voice-button.listening {
        background: #ef4444;
        animation: pulse 1.5s ease-in-out infinite;
      }

      .voice-button.processing {
        background: #f59e0b;
      }

      /* Voice panel */
      .voice-panel {
        position: absolute;
        bottom: 72px;
        right: 0;
        min-width: 320px;
        max-width: 380px;
        background: hsl(var(--background) / 0.95);
        backdrop-filter: blur(12px);
        border: 1px solid hsl(var(--border));
        border-radius: 16px;
        box-shadow: 0 20px 40px hsl(var(--foreground) / 0.1);
        pointer-events: auto;
        transform-origin: bottom right;
      }

      /* Animations */
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .voice-button {
          transition-duration: 0.01ms !important;
        }
        .voice-button.listening {
          animation: none;
        }
      }

      /* High contrast support */
      @media (prefers-contrast: high) {
        .voice-button {
          border: 2px solid currentColor;
        }
      }

      /* Mobile responsive */
      @media (max-width: 640px) {
        .voice-panel {
          min-width: min(320px, calc(100vw - 48px));
          max-width: min(380px, calc(100vw - 48px));
        }
      }
    `

    this.shadowRoot.appendChild(style)
  }

  /**
   * Setup event listeners for widget
   */
  private setupEventListeners(): void {
    // Listen for theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', (e) => {
      this.updateTheme(e.matches ? 'dark' : 'light')
    })

    // Listen for page navigation (for SPA support)
    window.addEventListener('popstate', () => {
      this.app?.handleNavigationChange()
      if (process.env['NODE_ENV'] === 'development' || this.config.debugMode) {
        console.log('[VoiceWidget] Navigation changed to:', window.location.href)
      }
    })

    // Listen for visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.app?.handleVisibilityChange(false)
      } else {
        this.app?.handleVisibilityChange(true)
      }
    })
  }

  /**
   * Update widget theme
   */
  updateTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.config.theme = theme
    this.app?.updateConfig({ theme })
  }

  /**
   * Update widget configuration
   */
  updateConfig(newConfig: Partial<EmbedConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // Convert relevant config changes to VoiceWidgetConfig format
    const voiceWidgetConfigUpdate: Partial<VoiceWidgetConfig> = {
      ...(newConfig.siteId && { siteId: newConfig.siteId }),
      ...(newConfig.tenantId && { tenantId: newConfig.tenantId }),
      ...(newConfig.userId && { userId: newConfig.userId }),
      ...(newConfig.apiEndpoint && { apiEndpoint: newConfig.apiEndpoint }),
      ...(newConfig.wsEndpoint && { wsEndpoint: newConfig.wsEndpoint }),
      ...(newConfig.locale && { locale: newConfig.locale }),
      ...(newConfig.theme && { theme: newConfig.theme }),
      ...(newConfig.position && { position: newConfig.position }),
      ...(newConfig.size && { size: newConfig.size }),
      ...(newConfig.autoStart !== undefined && { autoStart: newConfig.autoStart }),
      ...(newConfig.debugMode !== undefined && { debugMode: newConfig.debugMode }),
    };
    
    if (Object.keys(voiceWidgetConfigUpdate).length > 0) {
      this.app?.updateConfig(voiceWidgetConfigUpdate);
    }
  }

  /**
   * Show the widget
   */
  show(): void {
    if (this.container) {
      this.container.style.display = 'block'
    }
  }

  /**
   * Hide the widget
   */
  hide(): void {
    if (this.container) {
      this.container.style.display = 'none'
    }
  }

  /**
   * Destroy the widget
   */
  destroy(): void {
    if (this.app) {
      this.app.unmount()
      this.app = null
    }

    if (this.actionsBridge) {
      this.actionsBridge.destroy()
      this.actionsBridge = null
    }

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container)
      this.container = null
    }

    this.shadowRoot = null
  }

  /**
   * Get current widget state
   */
  getState(): any {
    return this.app?.getState() || null
  }

  /**
   * Trigger voice input programmatically
   */
  startVoiceInput(): void {
    this.app?.startVoiceSession()
  }

  /**
   * Stop voice input
   */
  stopVoiceInput(): void {
    this.app?.stopVoiceSession()
  }
}

/**
 * Initialize SiteSpeak Voice Widget
 */
function initSiteSpeak(config: EmbedConfig): void {
  // Prevent multiple initializations
  if (window.SiteSpeak) {
    console.warn('SiteSpeak already initialized')
    return
  }

  // Validate required config
  if (!config.tenantId) {
    console.error('SiteSpeak: tenantId is required')
    return
  }

  // Create voice widget manager
  const voiceManager = new VoiceWidgetManager(config)

  // Expose API
  window.SiteSpeak = {
    voice: voiceManager,
    config,
    version: '1.0.0',
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      voiceManager.init()
    })
  } else {
    voiceManager.init()
  }
}

// Auto-initialize from script tag data attributes
function autoInit(): void {
  const script = document.currentScript as HTMLScriptElement
  if (!script) {return}

  const config: EmbedConfig = {
    siteId: script.dataset['siteId'] || '',
    tenantId: script.dataset['tenantId'] || '',
    ...(script.dataset['apiEndpoint'] && { apiEndpoint: script.dataset['apiEndpoint'] }),
    ...(script.dataset['wsEndpoint'] && { wsEndpoint: script.dataset['wsEndpoint'] }),
    ...(script.dataset['userId'] && { userId: script.dataset['userId'] }),
    ...(script.dataset['locale'] && { locale: script.dataset['locale'] }),
    theme: (script.dataset['theme'] as 'light' | 'dark' | 'auto') || 'auto',
    position: (script.dataset['position'] as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left') || 'bottom-right',
    ...(script.dataset['color'] && { color: script.dataset['color'] }),
    size: mapSizeFromDataset(script.dataset['size'] as 'sm' | 'md' | 'lg') || 'medium',
    ...(script.dataset['autoStart'] && { autoStart: script.dataset['autoStart'] === 'true' }),
    ...(script.dataset['debugMode'] && { debugMode: script.dataset['debugMode'] === 'true' }),
  }

  if (config.tenantId) {
    initSiteSpeak(config)
  }
}

// Export for manual initialization
if (typeof window !== 'undefined') {
  ;(window as any).initSiteSpeak = initSiteSpeak
  
  // Auto-init if script has data attributes
  if (document.currentScript) {
    autoInit()
  }
}

export { initSiteSpeak, VoiceWidgetManager }