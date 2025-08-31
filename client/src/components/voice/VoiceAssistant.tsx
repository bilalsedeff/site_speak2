import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Volume2, Settings, X } from 'lucide-react'

import { useVoice } from '@/providers/VoiceProvider'
import { Button } from '@/components/ui/Button'
import { VoiceVisualizer } from './VoiceVisualizer'
import { TranscriptDisplay } from './TranscriptDisplay'
import { VoiceSettings } from './VoiceSettings'
import { cn } from '@/lib/utils'

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

  // Auto-open when user starts talking
  useEffect(() => {
    if (isListening && isMinimized) {
      setIsMinimized(false)
      setIsOpen(true)
    }
  }, [isListening, isMinimized])

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

  return (
    <>
      {/* Main Voice Assistant Panel */}
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, x: 400, y: 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 400, y: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-4 top-4 z-50 w-96 max-w-[calc(100vw-2rem)]"
          >
            <div className="bg-card/95 backdrop-blur-glass border border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "w-3 h-3 rounded-full transition-colors",
                    isConnected ? "bg-green-500" : "bg-red-500"
                  )} />
                  <h3 className="font-semibold text-sm">Voice Assistant</h3>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettings(!showSettings)}
                    className="h-8 w-8 p-0"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMinimize}
                    className="h-8 w-8 p-0"
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

              {/* Voice Visualizer */}
              <div className="p-4 bg-muted/10">
                <VoiceVisualizer 
                  isListening={isListening}
                  isProcessing={isProcessing}
                  audioLevel={audioLevel}
                />
              </div>

              {/* Transcript and Response */}
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
                        "voice-button h-12 w-12",
                        isListening && "listening",
                        isProcessing && "processing"
                      )}
                    >
                      {isListening ? (
                        <MicOff className="h-5 w-5" />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                    </Button>
                    
                    {(transcript || response) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearTranscript}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    {isListening ? 'Listening...' :
                     isProcessing ? 'Processing...' :
                     isConnected ? 'Ready' : 'Connecting...'}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Voice Button (when minimized) */}
      <AnimatePresence>
        {(!isOpen || isMinimized) && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-40"
          >
            <Button
              onClick={() => setIsOpen(true)}
              disabled={!isConnected}
              className={cn(
                "voice-button h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all",
                isListening && "listening",
                isProcessing && "processing"
              )}
            >
              {isListening ? (
                <MicOff className="h-6 w-6" />
              ) : isProcessing ? (
                <Volume2 className="h-6 w-6" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>

            {/* Connection status indicator */}
            {!isConnected && (
              <div className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full animate-pulse" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}