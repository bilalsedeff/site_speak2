/**
 * @sitespeak/voice-widget
 *
 * Voice-first AI assistant widget for embeddable voice interactions
 * Follows Frontend Source-of-Truth standards with Shadow DOM isolation
 */

// Main embed functionality
export { initSiteSpeak, VoiceWidgetManager } from './embed'

// Core app components
export { VoiceWidgetApp } from './app/VoiceWidgetApp'
export type { VoiceWidgetConfig } from './app/VoiceWidgetApp'

// Actions bridge for site interactions
export { ActionsBridge } from './bridge/ActionsBridge'

// Type definitions for embedding
export interface EmbedConfig {
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

// Window interface augmentation
declare global {
  interface Window {
    SiteSpeak?: {
      voice: any
      config: EmbedConfig
      version: string
    }
    initSiteSpeak?: (config: EmbedConfig) => void
  }
}

// Version export
export const VERSION = '1.0.0'

// Default configuration
export const DEFAULT_CONFIG: Partial<EmbedConfig> = {
  apiEndpoint: 'https://api.sitespeak.ai',
  wsEndpoint: 'wss://api.sitespeak.ai/voice',
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
}