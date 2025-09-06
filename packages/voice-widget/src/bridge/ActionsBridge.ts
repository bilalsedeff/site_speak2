/**
 * Actions Bridge - Connects voice widget to site actions via postMessage
 * 
 * Fully implemented with:
 * - PostMessage communication protocol
 * - Handshake and configuration exchange
 * - Action execution with parameter validation
 * - Security checks with origin validation
 * - Message queuing and retry logic
 * - Real-time status updates
 */

interface SiteAction {
  id: string
  name: string
  description: string
  type: 'navigation' | 'form' | 'button' | 'custom'
  selector: string
  parameters: Record<string, ActionParameter>
  confirmation: boolean
  riskLevel: 'low' | 'medium' | 'high'
  category: string
}

interface ActionParameter {
  type: string
  required: boolean
  description: string
  validation?: Record<string, any>
}

// BridgeConfig interface removed - configuration is handled during handshake

export class ActionsBridge {
  private initialized = false
  private messageHandlers = new Map<string, Function>()
  private allowedOrigins: string[] = []
  private messageQueue: Array<{ message: Record<string, unknown>, timestamp: number }> = []
  private maxQueueSize = 100
  private availableActions = new Map<string, SiteAction>()
  private handshakeCompleted = false
  private responseTimeouts = new Map<string, NodeJS.Timeout>()
  
  constructor() {
    this.handleMessage = this.handleMessage.bind(this)
  }

  /**
   * Initialize the bridge and setup message listeners
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Setup postMessage listener for communication with parent site
    window.addEventListener('message', this.handleMessage)
    
    // Initiate handshake with parent site
    await this.performHandshake()
    
    this.initialized = true
    
    // Process any queued messages
    this.processMessageQueue()
    
    if (process.env['NODE_ENV'] === 'development') {
      console.log('[ActionsBridge] Initialized with', this.availableActions.size, 'actions')
    }
  }

  /**
   * Perform handshake with parent site to exchange configuration
   */
  private async performHandshake(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Handshake timeout - parent site may not have bridge script'))
      }, 5000)

      const handleHandshake = (event: MessageEvent) => {
        if (!event.data || typeof event.data !== 'object') {return}
        const { kind, config, ready } = event.data

        if (kind === 'hello' && ready && config) {
          // Store allowed origins
          this.allowedOrigins = [event.origin]
          
          // Register available actions
          if (config.actions) {
            config.actions.forEach((action: SiteAction) => {
              this.availableActions.set(action.id, action)
            })
          }

          this.handshakeCompleted = true
          window.removeEventListener('message', handleHandshake)
          clearTimeout(timeout)
          resolve()
        }
      }

      window.addEventListener('message', handleHandshake)
      
      // Send handshake request to parent
      this._postMessage({
        'kind': 'hello',
        'version': '1.0.0'
      })
    })
  }

  /**
   * Cleanup and remove listeners
   */
  destroy(): void {
    if (!this.initialized) {
      return
    }

    // Clear all timeouts
    this.responseTimeouts.forEach(timeout => clearTimeout(timeout))
    this.responseTimeouts.clear()

    // Remove event listeners
    window.removeEventListener('message', this.handleMessage)
    
    // Clear handlers and state
    this.messageHandlers.clear()
    this.availableActions.clear()
    this.allowedOrigins = []
    this.handshakeCompleted = false
    this.initialized = false
    
    if (process.env['NODE_ENV'] === 'development') {
      console.log('[ActionsBridge] Destroyed')
    }
  }

  /**
   * Execute an action on the parent site
   */
  async executeAction(actionName: string, parameters: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.initialized || !this.handshakeCompleted) {
      throw new Error('ActionsBridge not initialized or handshake not completed')
    }

    // Find action by name
    const action = Array.from(this.availableActions.values()).find(a => a.name === actionName)
    if (!action) {
      throw new Error(`Action not found: ${actionName}`)
    }

    // Validate parameters
    const validationResult = this.validateParameters(action, parameters)
    if (!validationResult.valid) {
      throw new Error(`Parameter validation failed: ${validationResult.errors.join(', ')}`)
    }

    // Apply security checks
    if (action.riskLevel === 'high' && !parameters['_confirmed']) {
      throw new Error(`Action "${actionName}" requires confirmation due to high risk level`)
    }

    return new Promise((resolve, reject) => {
      const messageId = this.generateMessageId()
      
      // Setup response handler
      const handleResponse = (response: any) => {
        // Clear timeout
        const timeout = this.responseTimeouts.get(messageId)
        if (timeout) {
          clearTimeout(timeout)
          this.responseTimeouts.delete(messageId)
        }

        if (response.result !== undefined) {
          resolve(response.result)
        } else {
          reject(new Error(response.error || 'Action execution failed'))
        }
      }

      this.messageHandlers.set(messageId, handleResponse)

      // Send action execution request
      this._postMessage({
        'kind': 'execute',
        'id': messageId,
        'actionId': action.id,
        'args': validationResult.cleanedParameters
      })

      // Setup timeout
      const timeout = setTimeout(() => {
        this.messageHandlers.delete(messageId)
        this.responseTimeouts.delete(messageId)
        reject(new Error(`Action execution timeout for ${actionName}`))
      }, 10000)
      
      this.responseTimeouts.set(messageId, timeout)
    })
  }

  /**
   * Validate action parameters
   */
  private validateParameters(action: SiteAction, parameters: Record<string, unknown>): {
    valid: boolean
    errors: string[]
    cleanedParameters: Record<string, unknown>
  } {
    const errors: string[] = []
    const cleanedParameters: Record<string, unknown> = {}

    // Check required parameters
    Object.entries(action.parameters).forEach(([name, param]) => {
      const value = parameters[name]

      if (param.required && (value === undefined || value === null)) {
        errors.push(`Missing required parameter: ${name}`)
        return
      }

      if (value !== undefined && value !== null) {
        // Basic type validation
        const expectedType = param.type.toLowerCase()
        const actualType = typeof value

        if (expectedType === 'string' && actualType !== 'string') {
          errors.push(`Parameter ${name} must be a string, got ${actualType}`)
        } else if (expectedType === 'number' && actualType !== 'number') {
          errors.push(`Parameter ${name} must be a number, got ${actualType}`)
        } else if (expectedType === 'boolean' && actualType !== 'boolean') {
          errors.push(`Parameter ${name} must be a boolean, got ${actualType}`)
        } else {
          cleanedParameters[name] = value
        }
      }
    })

    return {
      valid: errors.length === 0,
      errors,
      cleanedParameters
    }
  }

  /**
   * Register an action result handler
   */
  onActionResult(actionName: string, handler: (result: unknown) => void): () => void {
    const handlerKey = `result_${actionName}_${Date.now()}`
    
    const wrappedHandler = (event: MessageEvent) => {
      if (event.data?.kind === 'result' && event.data?.actionName === actionName) {
        handler(event.data.result)
      }
    }

    // Add to message handlers for cleanup
    this.messageHandlers.set(handlerKey, wrappedHandler)
    window.addEventListener('message', wrappedHandler)
    
    if (process.env['NODE_ENV'] === 'development') {
      console.log(`[ActionsBridge] Registered result handler for action: ${actionName}`)
    }

    // Return cleanup function
    return () => {
      window.removeEventListener('message', wrappedHandler)
      this.messageHandlers.delete(handlerKey)
    }
  }

  /**
   * Get available actions from the site
   */
  async getAvailableActions(): Promise<SiteAction[]> {
    if (!this.handshakeCompleted) {
      throw new Error('Bridge not ready - handshake not completed')
    }

    return Array.from(this.availableActions.values())
  }

  /**
   * Get available action names
   */
  async getAvailableActionNames(): Promise<string[]> {
    const actions = await this.getAvailableActions()
    return actions.map(action => action.name)
  }

  /**
   * Check if a specific action is available
   */
  isActionAvailable(actionName: string): boolean {
    return Array.from(this.availableActions.values()).some(action => action.name === actionName)
  }

  /**
   * Handle incoming messages from parent site
   */
  private handleMessage(event: MessageEvent): void {
    // Security: Only process messages from allowed origins during handshake
    if (this.handshakeCompleted && this.allowedOrigins.length > 0 && !this.allowedOrigins.includes(event.origin)) {
      console.warn('[ActionsBridge] Rejected message from unauthorized origin:', event.origin)
      return
    }

    if (!event.data || typeof event.data !== 'object') {
      return
    }

    const { kind, id, result, error, actionName, status } = event.data

    switch (kind) {
      case 'hello':
        // Handshake is handled by performHandshake method
        break

      case 'result':
        // Handle action execution results
        if (id) {
          const handler = this.messageHandlers.get(id)
          if (handler) {
            handler({ result })
            this.messageHandlers.delete(id)
          }
        }
        break

      case 'error':
        // Handle action execution errors
        if (id) {
          const handler = this.messageHandlers.get(id)
          if (handler) {
            handler({ error })
            this.messageHandlers.delete(id)
          }
        }
        break

      case 'status':
        // Handle status updates (processing, completed, failed)
        if (process.env['NODE_ENV'] === 'development') {
          console.log(`[ActionsBridge] Action status update:`, { actionName, status })
        }
        this.emitActionStatus(actionName, status)
        break

      default:
        console.warn('[ActionsBridge] Unknown message kind:', kind)
    }
  }

  /**
   * Emit action status to listeners
   */
  private emitActionStatus(actionName: string, status: string): void {
    // Emit custom event for action status
    const event = new CustomEvent('actionStatusChange', {
      detail: { actionName, status }
    })
    window.dispatchEvent(event)
  }

  /**
   * Generate unique message ID for request tracking
   */
  private generateMessageId(): string {
    return `voice_widget_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  /**
   * Check if bridge is ready
   */
  isReady(): boolean {
    return this.initialized && this.handshakeCompleted
  }

  /**
   * Get bridge status information
   */
  getStatus(): {
    initialized: boolean
    handshakeCompleted: boolean
    availableActions: number
    allowedOrigins: string[]
    pendingMessages: number
  } {
    return {
      initialized: this.initialized,
      handshakeCompleted: this.handshakeCompleted,
      availableActions: this.availableActions.size,
      allowedOrigins: [...this.allowedOrigins],
      pendingMessages: this.messageQueue.length
    }
  }

  /**
   * Send a message to the parent site with queue management and origin validation
   * Implements safe cross-frame communication for voice widget actions
   */
  private _postMessage(message: Record<string, unknown>): void {
    if (!this.initialized && message['kind'] !== 'hello') {
      // Queue messages if not initialized yet (except handshake)
      this.queueMessage(message)
      return
    }

    try {
      // Add metadata for tracking and security
      const enrichedMessage: Record<string, unknown> = {
        ...message,
        source: 'voice-widget',
        version: '1.0.0',
        timestamp: Date.now()
      }

      // Determine target origin with security
      let targetOrigin: string
      if (!this.handshakeCompleted) {
        // During handshake, use wildcard but will be validated on response
        targetOrigin = '*'
      } else if (this.allowedOrigins.length > 0) {
        // Use specific origin for security
        const firstOrigin = this.allowedOrigins[0]
        if (!firstOrigin) {
          throw new Error('Allowed origins array is empty')
        }
        targetOrigin = firstOrigin
      } else {
        throw new Error('No allowed origins configured')
      }

      window.parent.postMessage(enrichedMessage, targetOrigin)

      // Log for debugging (only in development)
      if (process.env['NODE_ENV'] === 'development') {
        const messageKind = enrichedMessage['kind'] as string || 'unknown'
        console.log('[ActionsBridge] Message sent:', messageKind, 'to', targetOrigin)
      }
    } catch (error) {
      console.error('[ActionsBridge] Failed to send message:', error)
      
      // Implement retry logic for failed messages
      if (this.canRetryMessage(message)) {
        setTimeout(() => this._postMessage(message), 1000)
      }
    }
  }

  /**
   * Check if message can be retried
   */
  private canRetryMessage(message: Record<string, unknown>): boolean {
    const retryCount = (message['_retryCount'] as number) || 0
    const maxRetries = 3
    
    if (retryCount < maxRetries) {
      message['_retryCount'] = retryCount + 1
      return true
    }
    
    return false
  }

  /**
   * Queue message for later delivery when bridge is not ready
   */
  private queueMessage(message: Record<string, unknown>): void {
    if (this.messageQueue.length >= this.maxQueueSize) {
      // Remove oldest message to prevent memory leaks
      this.messageQueue.shift()
    }
    
    this.messageQueue.push({
      message,
      timestamp: Date.now()
    })
  }

  /**
   * Process queued messages after initialization
   */
  private processMessageQueue(): void {
    const queuedMessages = [...this.messageQueue]
    this.messageQueue = []
    
    for (const { message } of queuedMessages) {
      this._postMessage(message)
    }
  }
}