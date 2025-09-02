import React, { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Send, Loader2, Bot, User, Zap, AlertCircle, RefreshCw } from 'lucide-react'

import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { useAI, useConversationHistory } from '../../hooks/useAI'
import { cn } from '@/lib/utils'

interface AIChatProps {
  className?: string
  placeholder?: string
  maxHeight?: string
  sessionId?: string
  context?: {
    page?: string
    component?: string
    user?: Record<string, any>
  }
  onActionRequired?: (action: any) => void
  showHistory?: boolean
}

/**
 * AI Chat component following UI/UX guidelines:
 * - Brief and relevant responses that move conversation forward
 * - Low cognitive load with minimal options per view
 * - Helpful empty states that teach next steps
 * - Accessibility with proper ARIA labels and live regions
 */
export function AIChat({
  className,
  placeholder = "Ask me anything about this site...",
  maxHeight = "400px",
  sessionId,
  context,
  onActionRequired,
  showHistory = true,
}: AIChatProps) {
  const [input, setInput] = useState('')
  const [localMessages, setLocalMessages] = useState<Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: string
    actions?: any[]
    streaming?: boolean
  }>>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    isConnected,
    isLoading,
    isStreaming,
    error,
    lastResponse,
    streamingResponse,
    query,
    startStreaming,
    executeAction,
    clearState,
  } = useAI()

  const {
    messages: historyMessages,
    isLoading: historyLoading,
    addMessage,
  } = useConversationHistory(sessionId)

  // Combine history and local messages
  const allMessages = showHistory ? [...historyMessages, ...localMessages] : localMessages

  // Auto-scroll to bottom with smooth behavior
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'nearest'
      })
    }
  }, [allMessages, streamingResponse])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Handle streaming response
  useEffect(() => {
    if (isStreaming && streamingResponse) {
      setLocalMessages(prev => {
        const messages = [...prev]
        const lastMessage = messages[messages.length - 1]
        
        if (lastMessage && lastMessage.role === 'assistant' && lastMessage.streaming) {
          lastMessage.content = streamingResponse
        } else {
          messages.push({
            role: 'assistant',
            content: streamingResponse,
            timestamp: new Date().toISOString(),
            streaming: true,
          })
        }
        
        return messages
      })
    } else if (!isStreaming && streamingResponse) {
      // Mark streaming as complete
      setLocalMessages(prev => {
        const messages = [...prev]
        const lastMessage = messages[messages.length - 1]
        
        if (lastMessage && lastMessage.streaming) {
          lastMessage.streaming = false
          lastMessage.content = streamingResponse
        }
        
        return messages
      })
    }
  }, [isStreaming, streamingResponse])

  // Handle traditional response
  useEffect(() => {
    if (lastResponse && !isStreaming) {
      const newMessage = {
        role: 'assistant' as const,
        content: lastResponse.response,
        timestamp: new Date().toISOString(),
        actions: lastResponse.actions,
      }
      
      setLocalMessages(prev => [...prev, newMessage])
      addMessage('assistant', lastResponse.response)
      
      // Handle actions
      if (lastResponse.actions && lastResponse.actions.length > 0) {
        onActionRequired?.(lastResponse.actions)
      }
    }
  }, [lastResponse, isStreaming, addMessage, onActionRequired])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() || isLoading || isStreaming || !isConnected) {
      return
    }

    const userMessage = {
      role: 'user' as const,
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }

    // Add user message immediately
    setLocalMessages(prev => [...prev, userMessage])
    addMessage('user', input.trim())

    const currentInput = input.trim()
    setInput('')

    try {
      // Start streaming for better UX
      await startStreaming({
        query: currentInput,
        context,
        sessionId,
        language: 'en',
      })
    } catch (error) {
      console.error('Failed to send AI query:', error)
      
      // Fallback to traditional query
      try {
        await query({
          query: currentInput,
          context,
          sessionId,
          language: 'en',
        })
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError)
      }
    }
  }

  const handleActionClick = async (action: any) => {
    try {
      const success = await executeAction(action)
      if (success) {
        // Add system message about successful action
        const systemMessage = {
          role: 'assistant' as const,
          content: `✅ Successfully executed: ${action.name}`,
          timestamp: new Date().toISOString(),
        }
        setLocalMessages(prev => [...prev, systemMessage])
      }
    } catch (error) {
      console.error('Failed to execute action:', error)
      
      const errorMessage = {
        role: 'assistant' as const,
        content: `❌ Failed to execute action: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      }
      setLocalMessages(prev => [...prev, errorMessage])
    }
  }

  const handleRetry = () => {
    clearState()
    inputRef.current?.focus()
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!isConnected) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="p-0">
          <EmptyState
            icon={<AlertCircle className="h-12 w-12" />}
            title="AI Assistant Unavailable"
            description="The AI assistant is currently disconnected. Please check your connection and try again."
            actions={[
              {
                label: "Retry Connection",
                onClick: () => window.location.reload(),
                variant: "default",
                icon: <RefreshCw className="h-4 w-4" />
              }
            ]}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("w-full flex flex-col", className)}>
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm max-heading-width">AI Assistant</span>
          </div>
          <div className="flex-1" />
          <div className={cn(
            "w-2 h-2 rounded-full transition-colors duration-[var(--motion-fast)]",
            isConnected ? "bg-green-500" : "bg-red-500"
          )}
          aria-label={isConnected ? "Connected" : "Disconnected"}
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col space-y-4 p-4 pt-4">
        {/* Messages Container */}
        <div 
          className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2"
          style={{ maxHeight }}
          role="log"
          aria-label="Conversation history"
        >
          {historyLoading && showHistory && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Loading history...</span>
            </div>
          )}

          {allMessages.length === 0 && !historyLoading && (
            <EmptyState
              icon={<Bot className="h-12 w-12" />}
              title="Let's start a conversation"
              description="Ask me about this site's features, get help with navigation, or request actions like searching products or managing your cart."
              actions={[
                {
                  label: "Ask about features",
                  onClick: () => {
                    setInput("What can you help me with?")
                    inputRef.current?.focus()
                  },
                  variant: "default"
                }
              ]}
            />
          )}

          <AnimatePresence>
            {allMessages.map((message, index) => (
              <motion.div
                key={`${message.timestamp}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ 
                  duration: 0.2,
                  ease: [0.4, 0.0, 0.2, 1]
                }}
                className={cn(
                  "flex space-x-3",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                )}

                <div className={cn(
                  "max-w-[80%] space-y-2",
                  message.role === 'user' ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "rounded-lg px-4 py-2 text-sm max-reading-width",
                    message.role === 'user'
                      ? "bg-primary text-primary-foreground ml-auto"
                      : "bg-muted"
                  )}>
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    {message.streaming && (
                      <div className="flex items-center mt-2">
                        <Loader2 className="h-3 w-3 animate-spin mr-2" />
                        <span className="text-xs opacity-70">Thinking...</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {message.actions && message.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {message.actions.slice(0, 3).map((action, actionIndex) => (
                        <Button
                          key={actionIndex}
                          onClick={() => handleActionClick(action)}
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs min-h-[32px]"
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          {action.name}
                        </Button>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    {formatTimestamp(message.timestamp)}
                  </div>
                </div>

                {message.role === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                      <User className="h-4 w-4" />
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center py-4"
            >
              <div className="bg-destructive/10 text-destructive rounded-lg px-4 py-2 text-sm flex items-center space-x-2 max-reading-width">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
                <Button onClick={handleRetry} variant="ghost" size="sm" className="ml-2">
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} aria-hidden="true" />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              disabled={isLoading || isStreaming || !isConnected}
              className={cn(
                "form-input min-h-[44px]",
                "max-reading-width",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
              maxLength={1000}
              aria-label="Chat message input"
            />
            {(isLoading || isStreaming) && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          
          <Button 
            type="submit" 
            disabled={!input.trim() || isLoading || isStreaming || !isConnected}
            size="sm"
            className="touch-target"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>

        {/* Character count */}
        {input.length > 800 && (
          <div className="text-xs text-muted-foreground text-right">
            {input.length}/1000 characters
          </div>
        )}
      </CardContent>

      {/* Live region for screen readers */}
      <div 
        aria-live="polite" 
        aria-atomic="false"
        className="sr-only"
      >
        {isLoading && "AI is processing your message"}
        {isStreaming && "AI is responding"}
        {error && `Error: ${error}`}
      </div>
    </Card>
  )
}