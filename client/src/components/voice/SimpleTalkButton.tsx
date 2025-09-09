import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Volume2, X } from 'lucide-react'

import { useVoice } from '@/providers/VoiceProvider'
import { VoiceSubtitles } from './VoiceSubtitles'
import { VoiceConsentModal } from './VoiceConsentModal'
import { VoiceWaveform } from './VoiceWaveform'
import { SuggestionChips } from './SuggestionChips'
import { cn } from '@/lib/utils'

const CONSENT_STORAGE_KEY = 'voice_consent_granted'

export function SimpleTalkButton() {
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [hasUserConsent, setHasUserConsent] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [partialTranscript, setPartialTranscript] = useState('')
  
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
    processText, // For suggestion chip clicks
  } = useVoice()

  // Check for existing consent on mount
  useEffect(() => {
    const existingConsent = localStorage.getItem(CONSENT_STORAGE_KEY)
    if (existingConsent === 'true') {
      setHasUserConsent(true)
    }
  }, [])

  // Handle suggestion chips visibility
  useEffect(() => {
    if (hasUserConsent && !isListening && !isProcessing && !transcript && !response) {
      const timer = setTimeout(() => {
        setShowSuggestions(true)
      }, 2000) // Show suggestions after 2 seconds of inactivity
      
      return () => clearTimeout(timer)
    } else {
      setShowSuggestions(false)
      return undefined
    }
  }, [hasUserConsent, isListening, isProcessing, transcript, response])

  // Track partial transcripts for real-time feedback
  useEffect(() => {
    if (isListening && transcript) {
      setPartialTranscript(transcript)
    } else if (!isListening) {
      setPartialTranscript('')
    }
  }, [isListening, transcript])

  const handleTalkButtonClick = async () => {
    // First time user - show consent modal
    if (!hasUserConsent) {
      setShowConsentModal(true)
      return
    }

    // Toggle listening state
    if (isListening) {
      stopListening()
    } else {
      try {
        if (!hasPermission) {
          const granted = await requestPermission()
          if (!granted) {
            console.warn('Microphone permission denied')
            return
          }
        }
        await startListening()
      } catch (error) {
        console.error('Failed to start listening:', error)
      }
    }
  }

  const handleConsentAccept = async () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'true')
    setHasUserConsent(true)
    setShowConsentModal(false)
    
    // Immediately try to start listening after consent
    try {
      if (!hasPermission) {
        const granted = await requestPermission()
        if (!granted) {
          console.warn('Microphone permission denied after consent')
          return
        }
      }
      await startListening()
    } catch (error) {
      console.error('Failed to start listening after consent:', error)
    }
  }

  const handleConsentDecline = () => {
    setShowConsentModal(false)
    // Don't store declined consent so they can try again later
  }

  const handleSuggestionClick = async (suggestion: string) => {
    setShowSuggestions(false)
    try {
      // Process the suggestion as text input
      await processText?.(suggestion)
    } catch (error) {
      console.error('Failed to process suggestion:', error)
    }
  }

  const clearTranscript = () => {
    setPartialTranscript('')
    // Clear any existing transcript from voice provider if available
  }

  // Determine button state and appearance
  const getButtonState = () => {
    if (!isConnected) {
      return { icon: Mic, label: 'Connecting...', disabled: true, variant: 'muted' }
    }
    if (isProcessing) {
      return { icon: Volume2, label: 'AI is speaking...', disabled: false, variant: 'processing' }
    }
    if (isListening) {
      return { icon: MicOff, label: 'Listening... (tap to stop)', disabled: false, variant: 'listening' }
    }
    return { icon: Mic, label: 'Talk to me', disabled: false, variant: 'ready' }
  }

  const buttonState = getButtonState()
  const IconComponent = buttonState.icon

  return (
    <>
      {/* Main Talk Button */}
      <motion.div
        className="fixed bottom-6 right-6 z-40"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
      >
        <div className="relative group">
          {/* Enhanced waveform visualization */}
          <AnimatePresence>
            {isListening && (
              <>
                {/* Audio level ring */}
                {audioLevel > 0.1 && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary"
                    initial={{ scale: 1, opacity: 0.8 }}
                    animate={{ 
                      scale: 1 + audioLevel * 0.3, 
                      opacity: 0.6 + audioLevel * 0.4 
                    }}
                    exit={{ scale: 1, opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    style={{
                      filter: `drop-shadow(0 0 ${audioLevel * 20}px rgb(var(--primary)))`
                    }}
                  />
                )}
                
                {/* Waveform visualization */}
                <motion.div
                  className="absolute -bottom-2 left-1/2 transform -translate-x-1/2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  <VoiceWaveform 
                    audioLevel={audioLevel || 0} 
                    isListening={isListening}
                    className="bg-background/90 backdrop-blur-sm rounded px-2 py-1 shadow-sm border border-border/50"
                  />
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Main Button */}
          <motion.button
            onClick={handleTalkButtonClick}
            disabled={buttonState.disabled}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "relative w-16 h-16 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
              {
                "bg-primary text-primary-foreground hover:bg-primary/90": buttonState.variant === 'ready',
                "bg-red-500 text-white hover:bg-red-600 animate-pulse": buttonState.variant === 'listening',
                "bg-blue-500 text-white hover:bg-blue-600": buttonState.variant === 'processing',
                "bg-muted text-muted-foreground cursor-not-allowed": buttonState.variant === 'muted',
              }
            )}
            aria-label={buttonState.label}
          >
            <IconComponent 
              className={cn(
                "w-6 h-6 transition-transform duration-200",
                isListening && "scale-110"
              )} 
            />

            {/* Processing indicator */}
            {isProcessing && (
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-white/30"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            )}
          </motion.button>

          {/* Tooltip */}
          <div className={cn(
            "absolute bottom-full right-0 mb-2 px-3 py-1 bg-foreground text-background text-xs rounded whitespace-nowrap",
            "opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none",
            "transform translate-y-1 group-hover:translate-y-0"
          )}>
            {buttonState.label}
          </div>

          {/* Connection status indicator */}
          {!isConnected && (
            <div 
              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse border-2 border-background"
              title="Disconnected"
            />
          )}
        </div>
      </motion.div>

      {/* Enhanced Subtitles with partial transcript support */}
      <VoiceSubtitles
        text={response || transcript || partialTranscript}
        isVisible={Boolean(response || transcript || (isListening && partialTranscript))}
        fadeDelay={response ? 4000 : (isListening ? 0 : 2000)} // Don't fade while listening
        fadeDuration={1500}
      />

      {/* Suggestion Chips for voice discoverability */}
      <SuggestionChips
        isVisible={showSuggestions && hasUserConsent}
        onSuggestionClick={handleSuggestionClick}
        context="general" // Could be dynamic based on page context
      />

      {/* Consent Modal */}
      <VoiceConsentModal
        isOpen={showConsentModal}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
      />

      {/* Enhanced controls and feedback */}
      <AnimatePresence>
        {hasUserConsent && (transcript || partialTranscript) && (
          <motion.div
            className="fixed bottom-24 right-6 z-30"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <button
              onClick={clearTranscript}
              className="w-8 h-8 bg-background/90 backdrop-blur-sm border border-border/50 rounded-full shadow-sm hover:bg-muted/80 transition-colors flex items-center justify-center group"
              title="Clear transcript"
            >
              <X className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard shortcut hint (only show if user has consented) */}
      {hasUserConsent && !isListening && !isProcessing && !showSuggestions && (
        <div className="fixed bottom-4 right-24 text-xs text-muted-foreground/60 z-30 pointer-events-none">
          <kbd className="text-xs bg-muted/50 px-1 py-0.5 rounded">
            Ctrl+Space
          </kbd>
        </div>
      )}

      {/* Global keyboard shortcut listener */}
      {hasUserConsent && (
        <div className="sr-only">
          <div
            tabIndex={-1}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
                e.preventDefault()
                handleTalkButtonClick()
              }
            }}
            style={{ position: 'absolute', left: '-9999px' }}
          />
        </div>
      )}
    </>
  )
}