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

  useEffect(() => {
    if (isVisible && text) {
      setShouldShow(true)
      
      // Start fade out after delay
      const timer = setTimeout(() => {
        setShouldShow(false)
      }, fadeDelay)

      return () => clearTimeout(timer)
    } else {
      setShouldShow(false)
      return undefined
    }
  }, [isVisible, text, fadeDelay])

  if (!text) {
    return null
  }

  return (
    <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
      <AnimatePresence>
        {shouldShow && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ 
              opacity: 0, 
              y: 10,
              transition: { 
                duration: fadeDuration / 1000,
                ease: "easeOut"
              }
            }}
            transition={{ 
              duration: 0.2,
              ease: "easeOut"
            }}
            className="max-w-2xl mx-auto px-6 py-3 bg-black/75 backdrop-blur-sm rounded-lg"
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