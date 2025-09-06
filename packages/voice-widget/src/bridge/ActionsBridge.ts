/**
 * Actions Bridge - Connects voice widget to site actions via postMessage
 * TODO: Implement full action dispatch and site integration
 */

export class ActionsBridge {
  private initialized = false
  private messageHandlers = new Map<string, Function>()
  private allowedOrigins: string[] = ['*'] // TODO: Configure based on site domain
  private messageQueue: Array<{ message: Record<string, unknown>, timestamp: number }> = []
  private maxQueueSize = 100
  
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
    
    // TODO: Register available actions from site manifest
    // TODO: Setup authentication and security checks
    // TODO: Initialize action validators
    
    this.initialized = true
    
    // Process any queued messages
    this.processMessageQueue()
    
    console.log('[ActionsBridge] Initialized')
  }

  /**
   * Cleanup and remove listeners
   */
  destroy(): void {
    if (!this.initialized) {
      return
    }

    window.removeEventListener('message', this.handleMessage)
    this.messageHandlers.clear()
    this.initialized = false
    console.log('[ActionsBridge] Destroyed')
  }

  /**
   * Execute an action on the parent site
   */
  async executeAction(actionName: string, parameters: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.initialized) {
      throw new Error('ActionsBridge not initialized')
    }

    // TODO: Validate action exists and parameters
    // TODO: Apply security checks
    // TODO: Handle rate limiting

    return new Promise((resolve, reject) => {
      const messageId = this.generateMessageId()
      
      // Setup response handler
      const handleResponse = (response: any) => {
        if (response.success) {
          resolve(response.data)
        } else {
          reject(new Error(response.error || 'Action execution failed'))
        }
      }

      this.messageHandlers.set(messageId, handleResponse)

      // Send action to parent site
      this._postMessage({
        type: 'VOICE_WIDGET_ACTION',
        messageId,
        action: actionName,
        parameters,
        timestamp: Date.now()
      })

      // Cleanup after timeout
      setTimeout(() => {
        this.messageHandlers.delete(messageId)
        reject(new Error('Action execution timeout'))
      }, 10000) // 10 second timeout
    })
  }

  /**
   * Register an action result handler
   */
  onActionResult(actionName: string, _handler: (result: unknown) => void): void {
    // TODO: Implement action result subscription
    console.log(`[ActionsBridge] Registered handler for action: ${actionName}`)
  }

  /**
   * Get available actions from the site
   */
  async getAvailableActions(): Promise<string[]> {
    // TODO: Fetch from site manifest or API
    return ['navigation.goto', 'search.query', 'contact.submit']
  }

  /**
   * Handle incoming messages from parent site
   */
  private handleMessage(event: MessageEvent): void {
    if (!event.data || typeof event.data !== 'object') {
      return
    }

    const { type, messageId, success, data, error } = event.data

    // Handle action responses
    if (type === 'VOICE_WIDGET_ACTION_RESPONSE' && messageId) {
      const handler = this.messageHandlers.get(messageId)
      if (handler) {
        handler({ success, data, error })
        this.messageHandlers.delete(messageId)
      }
    }

    // Handle site notifications
    if (type === 'SITE_STATE_CHANGED') {
      // TODO: Update widget state based on site changes
      console.log('[ActionsBridge] Site state changed:', data)
    }
  }

  /**
   * Generate unique message ID for request tracking
   */
  private generateMessageId(): string {
    return `voice_widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Check if bridge is ready
   */
  isReady(): boolean {
    return this.initialized
  }

  /**
   * Send a message to the parent site with queue management and origin validation
   * Implements safe cross-frame communication for voice widget actions
   */
  private _postMessage(message: Record<string, unknown>): void {
    if (!this.initialized) {
      // Queue messages if not initialized yet
      this.queueMessage(message)
      return
    }

    try {
      // Add metadata for tracking and security
      const enrichedMessage = {
        ...message,
        source: 'voice-widget',
        version: '1.0.0',
        timestamp: message['timestamp'] || Date.now()
      }

      // Send to parent with origin validation
      const targetOrigin = this.allowedOrigins.includes('*') ? '*' : this.allowedOrigins[0] || '*'
      window.parent.postMessage(enrichedMessage, targetOrigin)

      // Log for debugging (only in development)
      if (process.env['NODE_ENV'] === 'development') {
        console.log('[ActionsBridge] Message sent:', (enrichedMessage as any).type)
      }
    } catch (error) {
      console.error('[ActionsBridge] Failed to send message:', error)
      // TODO: Implement retry logic for failed messages
    }
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