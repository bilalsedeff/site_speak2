import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

import { useVoice } from '@/providers/VoiceProvider'
import { VoiceSubtitles } from './VoiceSubtitles'
import { VoiceConsentModal } from './VoiceConsentModal'
import { cn } from '@/lib/utils'

const CONSENT_STORAGE_KEY = 'voice_consent_granted'

// Organic breathing shadow with morphing shape - jel gibi sürekli şekil değiştiren efekt
const organicShadowVariants = {
  idle: {
    scale: [1, 1.3, 0.8, 1.2, 0.9, 1],
    opacity: [0.1, 0.18, 0.06, 0.14, 0.08, 0.1],
    borderRadius: [
      "65% 35% 25% 75%", 
      "25% 75% 80% 20%", 
      "80% 20% 35% 65%", 
      "35% 65% 75% 25%",
      "75% 25% 20% 80%",
      "65% 35% 25% 75%"
    ],
    rotate: [0, 20, -15, 30, -10, 0],
    x: [0, -3, 4, -2, 3, 0],
    y: [0, 2, -3, 4, -2, 0],
    transition: {
      duration: 14,
      repeat: Infinity,
      ease: "easeInOut",
      times: [0, 0.2, 0.4, 0.6, 0.8, 1]
    }
  },
  hidden: {
    scale: 0.6,
    opacity: 0,
    borderRadius: "50%",
    x: 0,
    y: 0,
    rotate: 0,
    transition: {
      duration: 1.5,
      ease: "easeOut"
    }
  }
}

// İkinci katman - daha büyük ve daha şeffaf jel efekti
const glowLayerVariants = {
  idle: {
    scale: [1, 1.5, 0.85, 1.3, 0.95, 1],
    opacity: [0.05, 0.1, 0.03, 0.08, 0.04, 0.05],
    borderRadius: [
      "70% 30% 40% 60%",
      "40% 60% 75% 25%", 
      "75% 25% 30% 70%",
      "30% 70% 60% 40%",
      "60% 40% 25% 75%",
      "70% 30% 40% 60%"
    ],
    rotate: [0, -25, 35, -20, 25, 0],
    x: [0, 2, -4, 3, -1, 0],
    y: [0, -1, 3, -2, 4, 0],
    transition: {
      duration: 18,
      repeat: Infinity,
      ease: "easeInOut",
      times: [0, 0.2, 0.4, 0.6, 0.8, 1]
    }
  },
  hidden: {
    scale: 0.5,
    opacity: 0,
    borderRadius: "50%",
    x: 0,
    y: 0,
    rotate: 0,
    transition: {
      duration: 2,
      ease: "easeOut"
    }
  }
}

// Main circle breathing animation for active state
const circleVariants = {
  ready: {
    scale: 1,
    transition: {
      duration: 0.3,
      ease: "easeOut"
    }
  },
  listening: {
    scale: [1, 1.12, 1],
    transition: {
      duration: 2.8,
      repeat: Infinity,
      ease: "easeInOut"
    }
  },
  processing: {
    scale: [1, 1.06, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut"
    }
  },
  disconnected: {
    scale: 1,
    opacity: 0.6,
    transition: {
      duration: 0.3,
      ease: "easeOut"
    }
  }
}

// Audio level pulse animation with elegant motion
const audioPulseVariants = {
  idle: {
    scale: 1,
    opacity: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut"
    }
  },
  active: (audioLevel: number) => ({
    scale: 1 + audioLevel * 0.2,
    opacity: 0.2 + audioLevel * 0.25,
    transition: {
      duration: 0.4,
      ease: "easeOut"
    }
  })
}

export function SimpleVoiceCircle() {
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [hasUserConsent, setHasUserConsent] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const [isFirstClick, setIsFirstClick] = useState(true)
  const [isInConversation, setIsInConversation] = useState(false)
  const closeTimeoutRef = useRef<NodeJS.Timeout>()
  
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
  } = useVoice()

  // Check for existing consent on mount
  useEffect(() => {
    const existingConsent = localStorage.getItem(CONSENT_STORAGE_KEY)
    if (existingConsent === 'true') {
      setHasUserConsent(true)
    }
  }, [])

  // Show popup after mount if user has consent
  useEffect(() => {
    if (hasUserConsent && !isInConversation) {
      const timer = setTimeout(() => {
        setShowPopup(true)
        // Auto-hide popup after 3 seconds
        closeTimeoutRef.current = setTimeout(() => {
          setShowPopup(false)
        }, 3000)
      }, 1000)
      
      return () => {
        clearTimeout(timer)
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current)
        }
      }
    }
    return () => {}
  }, [hasUserConsent, isInConversation])

  // Manage conversation state
  useEffect(() => {
    const inConversation = isListening || isProcessing || Boolean(transcript || response)
    setIsInConversation(inConversation)
    
    // Hide popup during conversation
    if (inConversation && showPopup) {
      setShowPopup(false)
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [isListening, isProcessing, transcript, response, showPopup])

  const handleCircleClick = async () => {
    // First time user - show consent modal
    if (!hasUserConsent) {
      setShowConsentModal(true)
      return
    }

    // Hide popup on click
    if (showPopup) {
      setShowPopup(false)
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }

    // Start continuous listening flow
    if (isFirstClick) {
      setIsFirstClick(false)
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
    } else {
      // In continuous mode, only stop if user explicitly clicks while listening
      if (isListening) {
        stopListening()
        setIsFirstClick(true) // Reset for next conversation
      } else {
        // Resume listening
        try {
          await startListening()
        } catch (error) {
          console.error('Failed to resume listening:', error)
        }
      }
    }
  }

  const handleConsentAccept = async () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'true')
    setHasUserConsent(true)
    setShowConsentModal(false)
    
    // Immediately start listening after consent
    try {
      if (!hasPermission) {
        const granted = await requestPermission()
        if (!granted) {
          console.warn('Microphone permission denied after consent')
          return
        }
      }
      await startListening()
      setIsFirstClick(false)
    } catch (error) {
      console.error('Failed to start listening after consent:', error)
    }
  }

  const handleConsentDecline = () => {
    setShowConsentModal(false)
  }

  const handlePopupClose = () => {
    setShowPopup(false)
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
    }
  }

  // Determine circle state and appearance
  const getCircleState = () => {
    if (!isConnected) {
      return { variant: 'disconnected', disabled: true }
    }
    if (isProcessing) {
      return { variant: 'processing', disabled: false }
    }
    if (isListening) {
      return { variant: 'listening', disabled: false }
    }
    return { variant: 'ready', disabled: false }
  }

  const circleState = getCircleState()

  return (
    <>
      {/* Simple Voice Circle */}
      <motion.div
        className="fixed bottom-6 right-6 z-40"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
      >
        <div className="relative">
          {/* Talk to me popup */}
          <AnimatePresence>
            {showPopup && hasUserConsent && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="absolute bottom-full right-0 mb-3 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 whitespace-nowrap"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Talk to me</span>
                  <button 
                    onClick={handlePopupClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {/* Small arrow pointing down */}
                <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Organic Breathing Shadow - Primary Layer */}
          <motion.div
            className="absolute inset-0 -m-4 rounded-full"
            style={{
              background: "radial-gradient(ellipse, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.08) 40%, rgba(59, 130, 246, 0.04) 70%, transparent 100%)",
              filter: "blur(8px)"
            }}
            variants={organicShadowVariants}
            animate={isInConversation ? "hidden" : "idle"}
          />

          {/* Secondary Glow Layer for Depth */}
          <motion.div
            className="absolute inset-0 -m-6 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, rgba(59, 130, 246, 0.06) 50%, transparent 80%)",
              filter: "blur(12px)"
            }}
            variants={glowLayerVariants}
            animate={isInConversation ? "hidden" : "idle"}
          />

          {/* Audio Level Pulse Ring */}
          <AnimatePresence>
            {isListening && (
              <motion.div
                className="absolute inset-0 rounded-full border border-blue-400/30"
                variants={audioPulseVariants}
                initial="idle"
                animate="active"
                exit="idle"
                custom={audioLevel || 0}
                style={{
                  filter: `drop-shadow(0 0 ${(audioLevel || 0) * 6}px rgba(59, 130, 246, 0.4))`
                }}
              />
            )}
          </AnimatePresence>

          {/* Main Circle Button - Clean and minimal */}
          <motion.button
            onClick={handleCircleClick}
            disabled={circleState.disabled}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            variants={circleVariants}
            animate={circleState.variant}
            className={cn(
              "relative w-12 h-12 rounded-full shadow-lg transition-all duration-500",
              "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-300",
              "backdrop-blur-sm border border-white/20",
              {
                "bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700": circleState.variant === 'ready',
                "bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800": circleState.variant === 'listening',
                "bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700": circleState.variant === 'processing',
                "bg-gradient-to-br from-gray-400 to-gray-500 cursor-not-allowed": circleState.variant === 'disconnected',
              }
            )}
            aria-label={
              circleState.variant === 'listening' ? 'Listening...' :
              circleState.variant === 'processing' ? 'Processing...' :
              circleState.variant === 'disconnected' ? 'Disconnected' :
              'Start voice conversation'
            }
          >
            {/* Subtle Inner Glow */}
            <div className="absolute inset-0 rounded-full bg-white/15" />
            
            {/* Central Dot - Minimalist approach instead of microphone */}
            <div className="relative z-10 flex items-center justify-center w-full h-full">
              <div className="w-2 h-2 bg-white/90 rounded-full shadow-sm" />
            </div>

            {/* Processing Indicator - More subtle */}
            {isProcessing && (
              <motion.div
                className="absolute inset-1 rounded-full border border-white/20"
                animate={{ rotate: 360 }}
                transition={{ 
                  duration: 3, 
                  repeat: Infinity, 
                  ease: "linear" 
                }}
              />
            )}

            {/* Connection Status Indicator */}
            {!isConnected && (
              <motion.div 
                className="absolute -top-1 -right-1 w-3 h-3 bg-red-400 rounded-full border border-white"
                title="Disconnected"
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.8, 1, 0.8]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Enhanced Subtitles */}
      <VoiceSubtitles
        text={response || transcript}
        isVisible={Boolean(response || transcript || (isListening && transcript))}
        fadeDelay={response ? 4000 : (isListening ? 0 : 2000)}
        fadeDuration={1500}
      />

      {/* Consent Modal */}
      <VoiceConsentModal
        isOpen={showConsentModal}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
      />
    </>
  )
}