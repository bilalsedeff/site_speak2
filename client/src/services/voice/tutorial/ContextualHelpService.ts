/**
 * ContextualHelpService - Just-in-time help delivery system
 *
 * Features:
 * - Context-aware help suggestions
 * - Smart trigger conditions
 * - Universal website compatibility
 * - Performance-optimized help content
 * - Multi-modal help delivery (visual, audio, haptic)
 * - Adaptive help based on user experience
 */

import { EventEmitter } from 'events'

// Core types
export interface HelpContext {
  pageType: 'homepage' | 'product' | 'category' | 'checkout' | 'form' | 'article' | 'search' | 'other'
  pageUrl: string
  domElements: {
    buttons: number
    forms: number
    links: number
    inputs: number
    interactiveElements: DOMElement[]
  }
  userIntent?: string
  failedCommands?: string[]
  sessionDuration: number
  userExperience: 'novice' | 'intermediate' | 'expert'
  deviceType: 'mobile' | 'tablet' | 'desktop'
}

export interface DOMElement {
  selector: string
  tagName: string
  text?: string
  type?: string
  role?: string
  ariaLabel?: string
  isVisible: boolean
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface HelpSuggestion {
  id: string
  type: 'command' | 'tutorial' | 'tip' | 'guidance' | 'correction'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  title: string
  description: string
  voiceMessage?: string
  category: 'navigation' | 'interaction' | 'forms' | 'search' | 'general'
  triggers: HelpTrigger[]
  actions: HelpAction[]
  conditions?: HelpCondition[]
  metadata: {
    estimatedTime: number // seconds
    difficulty: 'easy' | 'medium' | 'hard'
    success_rate: number // 0-1
    popularity: number // 0-1
  }
}

export interface HelpTrigger {
  type: 'time_based' | 'error_based' | 'intent_based' | 'element_based' | 'pattern_based'
  condition: any
  threshold?: number
  cooldown?: number // milliseconds
}

export interface HelpAction {
  type: 'show_tooltip' | 'highlight_element' | 'show_modal' | 'speak_message' | 'start_tutorial' | 'suggest_command'
  target?: string // CSS selector
  content: string
  duration?: number
  animation?: 'pulse' | 'glow' | 'bounce' | 'fade'
}

export interface HelpCondition {
  type: 'user_experience' | 'page_type' | 'time_of_day' | 'device_type' | 'previous_actions'
  operator: '=' | '!=' | '>' | '<' | 'in' | 'not_in'
  value: any
}

export interface ActiveHelp {
  id: string
  suggestionId: string
  triggeredAt: Date
  context: HelpContext
  shown: boolean
  dismissed: boolean
  actionTaken?: string
  effectiveness?: number // 0-1 based on user response
}

export interface ContextualHelpConfig {
  enableSmartTriggers: boolean
  enableVoiceHelp: boolean
  enableVisualHelp: boolean
  enableAdaptiveHelp: boolean
  maxConcurrentHelp: number
  helpCooldownMs: number
  performanceMode: 'high' | 'balanced' | 'battery_saver'
  universalCompatibility: boolean
}

// Default configuration
const DEFAULT_CONFIG: ContextualHelpConfig = {
  enableSmartTriggers: true,
  enableVoiceHelp: true,
  enableVisualHelp: true,
  enableAdaptiveHelp: true,
  maxConcurrentHelp: 3,
  helpCooldownMs: 30000, // 30 seconds
  performanceMode: 'balanced',
  universalCompatibility: true
}

export class ContextualHelpService extends EventEmitter {
  private config: ContextualHelpConfig
  private helpSuggestions: Map<string, HelpSuggestion> = new Map()
  private activeHelp: Map<string, ActiveHelp> = new Map()
  private contextHistory: HelpContext[] = []
  private userPatterns: Map<string, any> = new Map()
  private cooldownTimers: Map<string, NodeJS.Timeout> = new Map()
  private isInitialized = false
  private currentContext: HelpContext | null = null
  private observerSetup = false

  constructor(config: Partial<ContextualHelpConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Initialize the contextual help service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {return}

    try {
      // Load built-in help suggestions
      await this.loadBuiltInSuggestions()

      // Set up DOM observation for context changes
      if (this.config.universalCompatibility) {
        this.setupUniversalObservers()
      }

      // Set up performance monitoring
      this.setupPerformanceMonitoring()

      this.isInitialized = true
      console.log('ContextualHelpService initialized successfully')
    } catch (error) {
      console.error('Failed to initialize ContextualHelpService:', error)
      throw error
    }
  }

  /**
   * Update current context and trigger help if needed
   */
  async updateContext(context: Partial<HelpContext>): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    // Build complete context
    const fullContext: HelpContext = {
      pageType: 'other',
      pageUrl: window.location.href,
      domElements: await this.analyzeDOMElements(),
      sessionDuration: 0,
      userExperience: 'novice',
      deviceType: this.detectDeviceType(),
      ...context
    }

    this.currentContext = fullContext
    this.contextHistory.push(fullContext)

    // Keep history manageable
    if (this.contextHistory.length > 50) {
      this.contextHistory.splice(0, 10)
    }

    // Check for help triggers
    await this.checkHelpTriggers(fullContext)

    this.emit('context_updated', fullContext)
  }

  /**
   * Handle failed voice command
   */
  async handleFailedCommand(command: string, reason: string, confidence: number): Promise<void> {
    if (!this.currentContext) {return}

    // Update context with failed command
    const updatedContext = {
      ...this.currentContext,
      failedCommands: [...(this.currentContext.failedCommands || []), command]
    }

    // Look for specific help for this failure
    const errorHelp = await this.findErrorSpecificHelp(command, reason, confidence)
    if (errorHelp) {
      await this.showHelp(errorHelp, updatedContext)
    }

    // Update context
    await this.updateContext(updatedContext)
  }

  /**
   * Handle successful command for learning
   */
  async handleSuccessfulCommand(command: string, intent: string, element?: string): Promise<void> {
    // Learn from successful patterns
    const pattern = this.extractCommandPattern(command, intent, element)
    this.updateUserPatterns(pattern)

    // Check if we should suggest related commands
    const relatedHelp = await this.findRelatedHelp(command, intent)
    if (relatedHelp && this.currentContext) {
      await this.scheduleHelp(relatedHelp, this.currentContext, 5000) // Show after 5 seconds
    }
  }

  /**
   * Manually request help
   */
  async requestHelp(query?: string): Promise<HelpSuggestion[]> {
    if (!this.currentContext) {
      await this.updateContext({})
    }

    let suggestions: HelpSuggestion[]

    if (query) {
      // Find help matching the query
      suggestions = await this.searchHelp(query)
    } else {
      // Provide contextual suggestions
      suggestions = await this.getContextualSuggestions(this.currentContext!)
    }

    // Show the best suggestion immediately
    if (suggestions.length > 0 && suggestions[0]) {
      await this.showHelp(suggestions[0], this.currentContext!)
    }

    return suggestions
  }

  /**
   * Show help suggestion
   */
  async showHelp(suggestion: HelpSuggestion, context: HelpContext): Promise<string> {
    // Check if we're not overwhelming the user
    if (this.activeHelp.size >= this.config.maxConcurrentHelp) {
      console.log('Max concurrent help reached, skipping suggestion')
      return ''
    }

    // Check cooldown
    if (this.cooldownTimers.has(suggestion.id)) {
      console.log('Help suggestion on cooldown, skipping')
      return ''
    }

    const helpId = `help_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const activeHelp: ActiveHelp = {
      id: helpId,
      suggestionId: suggestion.id,
      triggeredAt: new Date(),
      context,
      shown: false,
      dismissed: false
    }

    this.activeHelp.set(helpId, activeHelp)

    try {
      // Execute help actions
      for (const action of suggestion.actions) {
        await this.executeHelpAction(action, helpId)
      }

      activeHelp.shown = true
      this.activeHelp.set(helpId, activeHelp)

      // Speak voice message if enabled and available
      if (this.config.enableVoiceHelp && suggestion.voiceMessage) {
        await this.speakHelpMessage(suggestion.voiceMessage)
      }

      // Set cooldown timer
      this.setCooldownTimer(suggestion.id)

      this.emit('help_shown', { helpId, suggestion, context })

      return helpId

    } catch (error) {
      console.error('Failed to show help:', error)
      this.activeHelp.delete(helpId)
      throw error
    }
  }

  /**
   * Dismiss help
   */
  async dismissHelp(helpId: string, feedback?: 'helpful' | 'not_helpful' | 'irrelevant'): Promise<void> {
    const activeHelp = this.activeHelp.get(helpId)
    if (!activeHelp) {return}

    activeHelp.dismissed = true
    activeHelp.effectiveness = feedback === 'helpful' ? 1 : feedback === 'not_helpful' ? 0 : 0.5

    // Update suggestion effectiveness
    const suggestion = this.helpSuggestions.get(activeHelp.suggestionId)
    if (suggestion && feedback) {
      this.updateSuggestionEffectiveness(suggestion, feedback)
    }

    // Remove visual elements
    await this.cleanupHelpVisuals(helpId)

    this.activeHelp.delete(helpId)
    this.emit('help_dismissed', { helpId, feedback, effectiveness: activeHelp.effectiveness })
  }

  /**
   * Get active help
   */
  getActiveHelp(): ActiveHelp[] {
    return Array.from(this.activeHelp.values())
  }

  /**
   * Clear all active help
   */
  async clearAllHelp(): Promise<void> {
    const activeHelpIds = Array.from(this.activeHelp.keys())

    for (const helpId of activeHelpIds) {
      await this.dismissHelp(helpId)
    }
  }

  // Private methods

  private async loadBuiltInSuggestions(): Promise<void> {
    const builtInSuggestions: HelpSuggestion[] = [
      {
        id: 'voice_activation_help',
        type: 'guidance',
        priority: 'high',
        title: 'How to Activate Voice Commands',
        description: 'Click the microphone button or say "Hey SiteSpeak" to activate voice commands',
        voiceMessage: 'To activate voice commands, click the microphone button or say "Hey SiteSpeak"',
        category: 'general',
        triggers: [
          {
            type: 'time_based',
            condition: { sessionDuration: 30000 }, // 30 seconds
            threshold: 1
          }
        ],
        actions: [
          {
            type: 'show_tooltip',
            target: '[data-voice-button]',
            content: 'Click here to activate voice commands',
            duration: 5000,
            animation: 'pulse'
          }
        ],
        conditions: [
          {
            type: 'user_experience',
            operator: '=',
            value: 'novice'
          }
        ],
        metadata: {
          estimatedTime: 10,
          difficulty: 'easy',
          success_rate: 0.9,
          popularity: 0.8
        }
      },

      {
        id: 'navigation_commands_help',
        type: 'tutorial',
        priority: 'medium',
        title: 'Navigation Commands',
        description: 'Learn basic navigation commands like "go to home", "scroll down", "go back"',
        voiceMessage: 'Try navigation commands like "go to home", "scroll down", or "go back"',
        category: 'navigation',
        triggers: [
          {
            type: 'error_based',
            condition: { failedNavigationCommands: 2 },
            threshold: 1
          }
        ],
        actions: [
          {
            type: 'show_modal',
            content: 'Navigation Commands Tutorial',
            duration: 0 // Manual dismissal
          }
        ],
        metadata: {
          estimatedTime: 60,
          difficulty: 'easy',
          success_rate: 0.85,
          popularity: 0.9
        }
      },

      {
        id: 'button_click_help',
        type: 'tip',
        priority: 'medium',
        title: 'Clicking Buttons with Voice',
        description: 'Say "click [button name]" or "press [button text]" to interact with buttons',
        voiceMessage: 'To click buttons, say "click" followed by the button name or text',
        category: 'interaction',
        triggers: [
          {
            type: 'element_based',
            condition: { hasButtons: true },
            threshold: 1
          }
        ],
        actions: [
          {
            type: 'highlight_element',
            target: 'button:first-of-type, [role="button"]:first-of-type',
            content: 'Try saying "click this button"',
            duration: 3000,
            animation: 'glow'
          }
        ],
        metadata: {
          estimatedTime: 15,
          difficulty: 'easy',
          success_rate: 0.8,
          popularity: 0.95
        }
      },

      {
        id: 'form_filling_help',
        type: 'guidance',
        priority: 'high',
        title: 'Filling Forms with Voice',
        description: 'Use commands like "type in email", "enter my name", or "select option"',
        voiceMessage: 'For forms, try "type in email", "enter my name", or "select option"',
        category: 'forms',
        triggers: [
          {
            type: 'element_based',
            condition: { hasForms: true },
            threshold: 1
          }
        ],
        actions: [
          {
            type: 'show_tooltip',
            target: 'form input:first-of-type',
            content: 'Say "type in this field" to fill this input',
            duration: 4000
          }
        ],
        metadata: {
          estimatedTime: 30,
          difficulty: 'medium',
          success_rate: 0.75,
          popularity: 0.7
        }
      },

      {
        id: 'search_help',
        type: 'command',
        priority: 'medium',
        title: 'Voice Search Commands',
        description: 'Use "search for [term]" or "find [product]" to search the website',
        voiceMessage: 'To search, say "search for" followed by what you\'re looking for',
        category: 'search',
        triggers: [
          {
            type: 'element_based',
            condition: { hasSearchBox: true },
            threshold: 1
          }
        ],
        actions: [
          {
            type: 'highlight_element',
            target: '[type="search"], [placeholder*="search" i], .search-box',
            content: 'Say "search for" followed by your query',
            duration: 4000,
            animation: 'pulse'
          }
        ],
        metadata: {
          estimatedTime: 20,
          difficulty: 'easy',
          success_rate: 0.85,
          popularity: 0.8
        }
      }
    ]

    builtInSuggestions.forEach(suggestion => {
      this.helpSuggestions.set(suggestion.id, suggestion)
    })
  }

  private async checkHelpTriggers(context: HelpContext): Promise<void> {
    for (const suggestion of this.helpSuggestions.values()) {
      // Skip if already showing this suggestion
      if (Array.from(this.activeHelp.values()).some(ah => ah.suggestionId === suggestion.id)) {
        continue
      }

      // Check conditions first
      if (!this.evaluateConditions(suggestion.conditions || [], context)) {
        continue
      }

      // Check triggers
      for (const trigger of suggestion.triggers) {
        if (await this.evaluateTrigger(trigger, context)) {
          await this.showHelp(suggestion, context)
          break // Only trigger once per context update
        }
      }
    }
  }

  private async evaluateTrigger(trigger: HelpTrigger, context: HelpContext): Promise<boolean> {
    switch (trigger.type) {
      case 'time_based':
        return context.sessionDuration >= (trigger.condition.sessionDuration || 0)

      case 'error_based':
        return (context.failedCommands?.length || 0) >= (trigger.threshold || 1)

      case 'element_based':
        return this.evaluateElementCondition(trigger.condition, context.domElements)

      case 'intent_based':
        return context.userIntent === trigger.condition.intent

      case 'pattern_based':
        return this.evaluatePatternCondition(trigger.condition, context)

      default:
        return false
    }
  }

  private evaluateConditions(conditions: HelpCondition[], context: HelpContext): boolean {
    return conditions.every(condition => {
      switch (condition.type) {
        case 'user_experience':
          return this.evaluateOperator(context.userExperience, condition.operator, condition.value)

        case 'page_type':
          return this.evaluateOperator(context.pageType, condition.operator, condition.value)

        case 'device_type':
          return this.evaluateOperator(context.deviceType, condition.operator, condition.value)

        default:
          return true
      }
    })
  }

  private evaluateOperator(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case '=':
        return actual === expected
      case '!=':
        return actual !== expected
      case '>':
        return actual > expected
      case '<':
        return actual < expected
      case 'in':
        return Array.isArray(expected) && expected.includes(actual)
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual)
      default:
        return false
    }
  }

  private evaluateElementCondition(condition: any, domElements: HelpContext['domElements']): boolean {
    if (condition.hasButtons) {
      return domElements.buttons > 0
    }
    if (condition.hasForms) {
      return domElements.forms > 0
    }
    if (condition.hasSearchBox) {
      return domElements.interactiveElements.some(el =>
        el.type === 'search' || el.selector.includes('search')
      )
    }
    return false
  }

  private evaluatePatternCondition(_condition: any, _context: HelpContext): boolean {
    // Implement pattern matching logic
    return false
  }

  private async executeHelpAction(action: HelpAction, helpId: string): Promise<void> {
    switch (action.type) {
      case 'show_tooltip':
        await this.showTooltip(action, helpId)
        break

      case 'highlight_element':
        await this.highlightElement(action, helpId)
        break

      case 'show_modal':
        await this.showModal(action, helpId)
        break

      case 'speak_message':
        await this.speakHelpMessage(action.content)
        break

      case 'suggest_command':
        await this.suggestCommand(action, helpId)
        break

      default:
        console.warn('Unknown help action type:', action.type)
    }
  }

  private async showTooltip(action: HelpAction, helpId: string): Promise<void> {
    if (!this.config.enableVisualHelp) {return}

    const target = action.target ? document.querySelector(action.target) : null
    if (!target) {return}

    const tooltip = document.createElement('div')
    tooltip.id = `help-tooltip-${helpId}`
    tooltip.className = 'sitespeak-help-tooltip'
    tooltip.textContent = action.content
    tooltip.style.cssText = `
      position: absolute;
      background: #1f2937;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10000;
      pointer-events: none;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-width: 200px;
      word-wrap: break-word;
    `

    // Position tooltip
    const rect = target.getBoundingClientRect()
    tooltip.style.left = `${rect.left + rect.width / 2}px`
    tooltip.style.top = `${rect.bottom + 8}px`
    tooltip.style.transform = 'translateX(-50%)'

    document.body.appendChild(tooltip)

    // Add animation
    if (action.animation) {
      this.addAnimation(target as HTMLElement, action.animation)
    }

    // Auto-remove after duration
    if (action.duration) {
      setTimeout(() => {
        tooltip.remove()
        this.removeAnimation(target as HTMLElement)
      }, action.duration)
    }
  }

  private async highlightElement(action: HelpAction, helpId: string): Promise<void> {
    if (!this.config.enableVisualHelp) {return}

    const target = action.target ? document.querySelector(action.target) : null
    if (!target) {return}

    // Add highlight overlay
    const overlay = document.createElement('div')
    overlay.id = `help-highlight-${helpId}`
    overlay.className = 'sitespeak-help-highlight'
    overlay.style.cssText = `
      position: absolute;
      border: 2px solid #3b82f6;
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.1);
      pointer-events: none;
      z-index: 9999;
      transition: all 0.3s ease;
    `

    // Position overlay
    const rect = target.getBoundingClientRect()
    overlay.style.left = `${rect.left - 2}px`
    overlay.style.top = `${rect.top - 2}px`
    overlay.style.width = `${rect.width + 4}px`
    overlay.style.height = `${rect.height + 4}px`

    document.body.appendChild(overlay)

    // Add animation
    if (action.animation) {
      this.addAnimation(overlay, action.animation)
    }

    // Add tooltip if content provided
    if (action.content) {
      const tooltip = document.createElement('div')
      tooltip.textContent = action.content
      tooltip.style.cssText = `
        position: absolute;
        background: #1f2937;
        color: white;
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 12px;
        top: -30px;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
      `
      overlay.appendChild(tooltip)
    }

    // Auto-remove after duration
    if (action.duration) {
      setTimeout(() => {
        overlay.remove()
      }, action.duration)
    }
  }

  private async showModal(action: HelpAction, helpId: string): Promise<void> {
    // Emit event for React components to handle
    this.emit('show_help_modal', {
      helpId,
      title: action.content,
      type: 'help'
    })
  }

  private async suggestCommand(action: HelpAction, helpId: string): Promise<void> {
    // Emit event for command suggestion UI
    this.emit('suggest_command', {
      helpId,
      command: action.content,
      target: action.target
    })
  }

  private addAnimation(element: HTMLElement, animation: string): void {
    const className = `sitespeak-help-${animation}`

    // Add CSS if not already present
    if (!document.getElementById('sitespeak-help-styles')) {
      const style = document.createElement('style')
      style.id = 'sitespeak-help-styles'
      style.textContent = `
        .sitespeak-help-pulse {
          animation: sitespeak-pulse 2s infinite;
        }
        .sitespeak-help-glow {
          animation: sitespeak-glow 1.5s ease-in-out infinite alternate;
        }
        .sitespeak-help-bounce {
          animation: sitespeak-bounce 1s infinite;
        }
        .sitespeak-help-fade {
          animation: sitespeak-fade 2s ease-in-out infinite;
        }

        @keyframes sitespeak-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes sitespeak-glow {
          from { box-shadow: 0 0 5px rgba(59, 130, 246, 0.5); }
          to { box-shadow: 0 0 20px rgba(59, 130, 246, 0.8); }
        }
        @keyframes sitespeak-bounce {
          0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-10px); }
          60% { transform: translateY(-5px); }
        }
        @keyframes sitespeak-fade {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `
      document.head.appendChild(style)
    }

    element.classList.add(className)
  }

  private removeAnimation(element: HTMLElement): void {
    const animationClasses = ['sitespeak-help-pulse', 'sitespeak-help-glow', 'sitespeak-help-bounce', 'sitespeak-help-fade']
    animationClasses.forEach(cls => element.classList.remove(cls))
  }

  private async cleanupHelpVisuals(helpId: string): Promise<void> {
    // Remove tooltips
    const tooltip = document.getElementById(`help-tooltip-${helpId}`)
    if (tooltip) {tooltip.remove()}

    // Remove highlights
    const highlight = document.getElementById(`help-highlight-${helpId}`)
    if (highlight) {highlight.remove()}
  }

  private async speakHelpMessage(message: string): Promise<void> {
    if (!this.config.enableVoiceHelp || typeof speechSynthesis === 'undefined') {
      return
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(message)
      utterance.rate = 0.9
      utterance.pitch = 1
      utterance.volume = 0.8

      utterance.onend = () => resolve()
      utterance.onerror = (error) => reject(error)

      speechSynthesis.speak(utterance)
    })
  }

  private setCooldownTimer(suggestionId: string): void {
    // Clear existing timer
    const existingTimer = this.cooldownTimers.get(suggestionId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.cooldownTimers.delete(suggestionId)
    }, this.config.helpCooldownMs)

    this.cooldownTimers.set(suggestionId, timer)
  }

  private async analyzeDOMElements(): Promise<HelpContext['domElements']> {
    if (typeof document === 'undefined') {
      return { buttons: 0, forms: 0, links: 0, inputs: 0, interactiveElements: [] }
    }

    const buttons = document.querySelectorAll('button, [role="button"], [type="button"], [type="submit"]').length
    const forms = document.querySelectorAll('form').length
    const links = document.querySelectorAll('a[href]').length
    const inputs = document.querySelectorAll('input, textarea, select').length

    const interactiveElements: DOMElement[] = []

    // Collect key interactive elements
    const elements = document.querySelectorAll('button, [role="button"], input, select, textarea, a[href]')
    elements.forEach((el, index) => {
      if (index < 20) { // Limit for performance
        const rect = el.getBoundingClientRect()
        const isVisible = rect.width > 0 && rect.height > 0

        const elementInfo: any = {
          selector: this.generateSelector(el),
          tagName: el.tagName.toLowerCase(),
          text: el.textContent?.trim().substring(0, 50),
          isVisible,
          boundingBox: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          }
        }

        // Add optional properties only if they exist
        const type = el.getAttribute('type')
        if (type) {
          elementInfo.type = type
        }

        const role = el.getAttribute('role')
        if (role) {
          elementInfo.role = role
        }

        const ariaLabel = el.getAttribute('aria-label')
        if (ariaLabel) {
          elementInfo.ariaLabel = ariaLabel
        }

        interactiveElements.push(elementInfo)
      }
    })

    return { buttons, forms, links, inputs, interactiveElements }
  }

  private generateSelector(element: Element): string {
    // Generate a simple selector for the element
    if (element.id) {
      return `#${element.id}`
    }

    const className = Array.from(element.classList).join('.')
    if (className) {
      return `${element.tagName.toLowerCase()}.${className}`
    }

    return element.tagName.toLowerCase()
  }

  private detectDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    if (typeof window === 'undefined') {return 'desktop'}

    const width = window.innerWidth
    if (width < 768) {return 'mobile'}
    if (width < 1024) {return 'tablet'}
    return 'desktop'
  }

  private setupUniversalObservers(): void {
    if (this.observerSetup || typeof window === 'undefined') {return}

    // Listen for page changes
    let lastUrl = window.location.href
    const checkForUrlChange = () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href
        this.updateContext({ pageUrl: lastUrl })
      }
    }

    // Use MutationObserver for DOM changes
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false

      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if interactive elements were added
          const hasInteractive = Array.from(mutation.addedNodes).some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element
              return element.matches('button, [role="button"], input, form, a[href]') ||
                     element.querySelector('button, [role="button"], input, form, a[href]')
            }
            return false
          })

          if (hasInteractive) {
            shouldUpdate = true
          }
        }
      })

      if (shouldUpdate) {
        // Debounce updates
        if (this.updateTimer) {
          clearTimeout(this.updateTimer)
        }
        this.updateTimer = setTimeout(() => {
          this.updateContext({})
        }, 500)
      }
    })

    // Observe the entire document
    observer.observe(document.body, {
      childList: true,
      subtree: true
    })

    // Check for URL changes periodically
    setInterval(checkForUrlChange, 1000)

    this.observerSetup = true
  }

  private updateTimer: NodeJS.Timeout | null = null

  private setupPerformanceMonitoring(): void {
    if (this.config.performanceMode === 'battery_saver') {
      // Reduce update frequency and features for battery saving
      this.config.helpCooldownMs = Math.max(this.config.helpCooldownMs, 60000)
      this.config.maxConcurrentHelp = Math.min(this.config.maxConcurrentHelp, 1)
    }
  }

  private async findErrorSpecificHelp(_command: string, reason: string, _confidence: number): Promise<HelpSuggestion | null> {
    // Look for help suggestions that match the error pattern
    for (const suggestion of this.helpSuggestions.values()) {
      if (suggestion.type === 'correction' || suggestion.type === 'guidance') {
        // Simple matching logic - in a real implementation, this would be more sophisticated
        if (suggestion.description.toLowerCase().includes(reason.toLowerCase()) ||
            suggestion.title.toLowerCase().includes('error') ||
            suggestion.title.toLowerCase().includes('help')) {
          return suggestion
        }
      }
    }

    return null
  }

  private async findRelatedHelp(_command: string, intent: string): Promise<HelpSuggestion | null> {
    // Find related help based on successful command
    for (const suggestion of this.helpSuggestions.values()) {
      if (suggestion.category === intent && suggestion.type === 'tip') {
        return suggestion
      }
    }

    return null
  }

  private async scheduleHelp(suggestion: HelpSuggestion, context: HelpContext, delay: number): Promise<void> {
    setTimeout(() => {
      this.showHelp(suggestion, context)
    }, delay)
  }

  private async searchHelp(query: string): Promise<HelpSuggestion[]> {
    const results: HelpSuggestion[] = []
    const queryLower = query.toLowerCase()

    for (const suggestion of this.helpSuggestions.values()) {
      const score = this.calculateSearchScore(suggestion, queryLower)
      if (score > 0.3) {
        results.push(suggestion)
      }
    }

    return results.sort((a, b) => this.calculateSearchScore(b, queryLower) - this.calculateSearchScore(a, queryLower))
  }

  private calculateSearchScore(suggestion: HelpSuggestion, query: string): number {
    let score = 0

    if (suggestion.title.toLowerCase().includes(query)) {score += 0.8}
    if (suggestion.description.toLowerCase().includes(query)) {score += 0.6}
    if (suggestion.category.toLowerCase().includes(query)) {score += 0.4}

    return Math.min(score, 1)
  }

  private async getContextualSuggestions(context: HelpContext): Promise<HelpSuggestion[]> {
    const suggestions: HelpSuggestion[] = []

    for (const suggestion of this.helpSuggestions.values()) {
      if (this.evaluateConditions(suggestion.conditions || [], context)) {
        suggestions.push(suggestion)
      }
    }

    return suggestions.sort((a, b) => {
      // Sort by priority and relevance
      const priorityScore = (s: HelpSuggestion) => {
        switch (s.priority) {
          case 'urgent': return 4
          case 'high': return 3
          case 'medium': return 2
          case 'low': return 1
          default: return 0
        }
      }

      return priorityScore(b) - priorityScore(a)
    })
  }

  private extractCommandPattern(command: string, intent: string, element?: string): any {
    return {
      command: command.toLowerCase(),
      intent,
      element,
      timestamp: new Date(),
      success: true
    }
  }

  private updateUserPatterns(pattern: any): void {
    // Update user behavior patterns for adaptive help
    const userId = 'current_user' // In real implementation, get from session
    const patterns = this.userPatterns.get(userId) || []
    patterns.push(pattern)

    // Keep recent patterns only
    if (patterns.length > 100) {
      patterns.splice(0, 20)
    }

    this.userPatterns.set(userId, patterns)
  }

  private updateSuggestionEffectiveness(suggestion: HelpSuggestion, feedback: string): void {
    // Update suggestion effectiveness based on user feedback
    const currentSuccess = suggestion.metadata.success_rate
    const feedbackScore = feedback === 'helpful' ? 1 : feedback === 'not_helpful' ? 0 : 0.5

    // Simple exponential moving average
    suggestion.metadata.success_rate = currentSuccess * 0.9 + feedbackScore * 0.1
  }
}

// Factory function
export function createContextualHelpService(config?: Partial<ContextualHelpConfig>): ContextualHelpService {
  return new ContextualHelpService(config)
}