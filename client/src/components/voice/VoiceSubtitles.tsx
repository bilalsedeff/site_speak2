import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface VoiceSubtitlesProps {
  text: string
  isVisible: boolean
  fadeDelay?: number // Delay before starting fade out (ms)
  fadeDuration?: number // Duration of fade out (ms)
}

export function VoiceSubtitles({ 
  text, 
  isVisible, 
  fadeDelay = 3000, 
  fadeDuration = 1000 
}: VoiceSubtitlesProps) {
  const [shouldShow, setShouldShow] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  useEffect(() => {
    if (isVisible && text) {
      setShouldShow(true)
      setIsAnimatingOut(false)
      
      // Start fade out after delay
      const timer = setTimeout(() => {
        setIsAnimatingOut(true)
        // Remove from DOM after animation completes
        setTimeout(() => {
          setShouldShow(false)
          setIsAnimatingOut(false)
        }, fadeDuration)
      }, fadeDelay)

      return () => clearTimeout(timer)
    } else if (!isVisible) {
      // Immediate fade out when visibility is turned off
      if (shouldShow) {
        setIsAnimatingOut(true)
        setTimeout(() => {
          setShouldShow(false)
          setIsAnimatingOut(false)
        }, fadeDuration * 0.5) // Faster fade when turning off visibility
      }
      return () => {} // Return cleanup function even when no timer
    }
    
    return () => {} // Default cleanup function
  }, [isVisible, text, fadeDelay, fadeDuration, shouldShow])

  if (!text) {
    return null
  }

  return (
    <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
      <AnimatePresence mode="wait">
        {shouldShow && (
          <motion.div
            key={text} // Re-animate when text changes
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ 
              opacity: isAnimatingOut ? 0 : 1, 
              y: isAnimatingOut ? -10 : 0,
              scale: isAnimatingOut ? 0.95 : 1
            }}
            exit={{ 
              opacity: 0, 
              y: -10,
              scale: 0.95,
              transition: { 
                duration: fadeDuration / 1000,
                ease: "easeInOut"
              }
            }}
            transition={{ 
              duration: isAnimatingOut ? fadeDuration / 1000 : 0.3,
              ease: isAnimatingOut ? "easeInOut" : "easeOut"
            }}
            className="max-w-2xl mx-auto px-6 py-3 bg-black/80 backdrop-blur-md rounded-xl shadow-2xl border border-white/10"
          >
            <p className="text-white text-sm font-medium text-center leading-relaxed">
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}