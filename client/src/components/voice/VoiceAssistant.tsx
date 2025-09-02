import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Volume2, Settings, X, Lightbulb, Search, ShoppingCart } from 'lucide-react'

import { useVoice } from '@/providers/VoiceProvider'
import { Button } from '@/components/ui/Button'
import { VoiceVisualizer } from './VoiceVisualizer'
import { TranscriptDisplay } from './TranscriptDisplay'
import { VoiceSettings } from './VoiceSettings'
import { cn } from '@/lib/utils'

/**
 * Enhanced Voice Assistant following UI/UX guidelines:
 * - Single floating mic button with clear affordance
 * - Compact panel with live waveform and suggestion chips
 * - Brief and relevant responses that move conversation forward
 * - Accessibility with live captions and keyboard triggers
 */
export function VoiceAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isMinimized, setIsMinimized] = useState(true)
  
  const {
    isListening,
    isProcessing,
    isConnected,
    hasPermission,
    transcript,
    response,
    audioLevel,
    startListening,
    stopListening,
    requestPermission,
    clearTranscript,
  } = useVoice()

  // Suggestion chips for discoverability
  const suggestionChips = [
    { icon: Search, label: "Find products", query: "Show me your products" },
    { icon: ShoppingCart, label: "Check cart", query: "What's in my cart?" },
    { icon: Lightbulb, label: "Get help", query: "How can you help me?" },
  ]

  // Auto-open when user starts talking
  useEffect(() => {
    if (isListening && isMinimized) {
      setIsMinimized(false)
      setIsOpen(true)
    }
  }, [isListening, isMinimized])

  // Keyboard shortcuts for accessibility
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + Space to toggle voice
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space') {
        event.preventDefault()
        handleVoiceToggle()
      }
      
      // Escape to close panel
      if (event.key === 'Escape' && isOpen) {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [isOpen, isListening])

  const handleVoiceToggle = async () => {
    if (!isConnected) {
      console.warn('Voice assistant not connected')
      return
    }

    if (!hasPermission) {
      const granted = await requestPermission()
      if (!granted) {
        // Show permission modal or error
        return
      }
    }

    if (isListening) {
      stopListening()
    } else {
      try {
        await startListening()
        setIsOpen(true)
        setIsMinimized(false)
      } catch (error) {
        console.error('Failed to start listening:', error)
      }
    }
  }

  const handleClose = () => {
    setIsOpen(false)
    if (isListening) {
      stopListening()
    }
  }

  const handleMinimize = () => {
    setIsMinimized(true)
    setIsOpen(false)
  }

  const handleSuggestionClick = (query: string) => {
    // This would trigger the AI service with the suggested query
    console.log('Suggestion clicked:', query)
    // For now, just start listening
    if (!isListening) {
      handleVoiceToggle()
    }
  }

  return (
    <>
      {/* Main Voice Assistant Panel */}
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ 
              duration: 0.25,
              ease: [0.4, 0.0, 0.2, 1] // Material motion curve
            }}
            className="fixed right-4 top-4 z-50 w-96 max-w-[calc(100vw-2rem)]"
          >
            <div className="voice-panel overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    'transition-colors duration-[var(--motion-fast)]',
                    isConnected ? "bg-green-500" : "bg-red-500"
                  )} 
                  aria-label={isConnected ? "Connected" : "Disconnected"}
                  />
                  <h3 className="font-semibold text-sm max-heading-width">
                    Voice Assistant
                  </h3>
                </div>
                
                <div className="flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowSettings(!showSettings)}
                    className="touch-target"
                    aria-label="Voice settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleMinimize}
                    className="touch-target"
                    aria-label="Minimize voice assistant"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Settings Panel */}
              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <VoiceSettings onClose={() => setShowSettings(false)} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Voice Visualizer with live waveform */}
              <div className="p-4 bg-muted/10">
                <VoiceVisualizer 
                  isListening={isListening}
                  isProcessing={isProcessing}
                  audioLevel={audioLevel}
                />
              </div>

              {/* Suggestion chips for discoverability */}
              {!isListening && !isProcessing && !transcript && !response && (
                <div className="px-4 pb-2">
                  <p className="text-xs text-muted-foreground mb-2">Try saying:</p>
                  <div className="flex flex-wrap gap-1">
                    {suggestionChips.map((chip, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestionClick(chip.query)}
                        className="suggestion-chip"
                        type="button"
                        aria-label={`Suggest: ${chip.label}`}
                      >
                        <chip.icon className="h-3 w-3 mr-1" aria-hidden="true" />
                        <span>{chip.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Transcript and Response with live captions */}
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                <TranscriptDisplay
                  transcript={transcript}
                  response={response}
                  isProcessing={isProcessing}
                />
              </div>

              {/* Controls */}
              <div className="p-4 border-t border-border bg-muted/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={handleVoiceToggle}
                      disabled={!isConnected}
                      className={cn(
                        "voice-button",
                        isListening && "listening",
                        isProcessing && "processing"
                      )}
                      aria-label={
                        isListening ? 'Stop listening' : 
                        isProcessing ? 'Processing...' : 
                        'Start voice input'
                      }
                      aria-pressed={isListening}
                    >
                      {isListening ? (
                        <MicOff className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Mic className="h-5 w-5" aria-hidden="true" />
                      )}
                    </Button>
                    
                    {(transcript || response) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearTranscript}
                        aria-label="Clear conversation"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  
                  <div 
                    className="text-xs text-muted-foreground"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {isListening ? 'Listening...' :
                     isProcessing ? 'Processing...' :
                     isConnected ? 'Ready' : 'Connecting...'}
                  </div>
                </div>
                
                {/* Keyboard shortcut hint */}
                <div className="mt-2 text-xs text-muted-foreground/70">
                  <kbd className="text-xs">Ctrl+Shift+Space</kbd> to toggle voice
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Voice Button with tooltip */}
      <AnimatePresence>
        {(!isOpen || isMinimized) && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ 
              type: 'spring', 
              damping: 20, 
              stiffness: 300,
              duration: 0.15
            }}
            className="fixed bottom-6 right-6 z-40 group"
          >
            <Button
              onClick={() => setIsOpen(true)}
              disabled={!isConnected}
              className={cn(
                "voice-button rounded-full shadow-lg hover:shadow-xl",
                "transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
                isListening && "listening",
                isProcessing && "processing"
              )}
              aria-label={
                isListening ? 'Voice assistant is listening' :
                isProcessing ? 'Voice assistant is processing' :
                'Open voice assistant'
              }
              title="Talk to your site"
            >
              {isListening ? (
                <MicOff className="h-6 w-6" aria-hidden="true" />
              ) : isProcessing ? (
                <Volume2 className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Mic className="h-6 w-6" aria-hidden="true" />
              )}
            </Button>

            {/* Tooltip on hover */}
            <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap">
                Talk to your site
              </div>
            </div>

            {/* Connection status indicator */}
            {!isConnected && (
              <div 
                className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full animate-pulse"
                aria-label="Disconnected"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live region for screen readers */}
      <div 
        aria-live="polite" 
        aria-atomic="false"
        className="sr-only"
      >
        {transcript && `You said: ${transcript}`}
        {response && `Assistant replied: ${response}`}
      </div>
    </>
  )
}