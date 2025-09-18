import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface VoiceWaveformVisualizerProps {
  isListening: boolean
  audioLevel?: number // 0-1
  mode?: 'minimal' | 'tutorial' | 'dynamic'
  className?: string
  showStatus?: boolean
  statusText?: string
}

export function VoiceWaveformVisualizer({
  isListening,
  audioLevel = 0,
  mode = 'tutorial',
  className,
  showStatus = true,
  statusText
}: VoiceWaveformVisualizerProps) {
  const [bars, setBars] = useState<number[]>([])
  const animationRef = useRef<number>()

  // Initialize bars for different modes
  useEffect(() => {
    const barCount = mode === 'minimal' ? 3 : mode === 'tutorial' ? 5 : 7
    setBars(new Array(barCount).fill(0))
  }, [mode])

  // Animate bars when listening
  useEffect(() => {
    if (isListening) {
      const animate = () => {
        setBars(prevBars =>
          prevBars.map((_, index) => {
            // Base animation + audio level influence
            const baseHeight = 0.3 + Math.sin(Date.now() * 0.005 + index * 0.8) * 0.2
            const audioInfluence = audioLevel * (0.8 - index * 0.1)
            const randomVariation = Math.random() * 0.3

            return Math.max(0.1, Math.min(1, baseHeight + audioInfluence + randomVariation))
          })
        )
        animationRef.current = requestAnimationFrame(animate)
      }
      animationRef.current = requestAnimationFrame(animate)
    } else {
      // Gradually reduce bars to minimum height
      const reduceHeight = () => {
        setBars(prevBars => {
          const newBars = prevBars.map(height => Math.max(0.1, height * 0.95))
          const stillAnimating = newBars.some(height => height > 0.15)

          if (stillAnimating) {
            animationRef.current = requestAnimationFrame(reduceHeight)
          }
          return newBars
        })
      }
      animationRef.current = requestAnimationFrame(reduceHeight)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isListening, audioLevel])

  const getStatusText = () => {
    if (statusText) {return statusText}
    if (isListening) {return 'Listening...'}
    return 'Click to speak'
  }

  const getStatusColor = () => {
    if (isListening) {return 'text-green-500'}
    return 'text-muted-foreground'
  }

  return (
    <div className={cn('flex flex-col items-center space-y-3', className)}>
      {/* Waveform Bars */}
      <div className="flex items-end space-x-1">
        {bars.map((height, index) => (
          <motion.div
            key={index}
            className={cn(
              'rounded-full transition-colors duration-300',
              mode === 'minimal' && 'w-1',
              mode === 'tutorial' && 'w-1.5',
              mode === 'dynamic' && 'w-2',
              isListening
                ? 'bg-gradient-to-t from-primary/60 to-primary'
                : 'bg-gradient-to-t from-muted/40 to-muted'
            )}
            style={{
              height: `${20 + (height * (mode === 'minimal' ? 20 : mode === 'tutorial' ? 30 : 40))}px`
            }}
            animate={{
              scaleY: height,
              filter: isListening
                ? `hue-rotate(${index * 20}deg) brightness(1.2)`
                : 'brightness(0.8)'
            }}
            transition={{
              scaleY: { type: 'spring', stiffness: 300, damping: 30 },
              filter: { duration: 0.3 }
            }}
          />
        ))}
      </div>

      {/* Audio Level Indicator for Tutorial Mode */}
      {mode === 'tutorial' && (
        <div className="w-32 h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${audioLevel * 100}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        </div>
      )}

      {/* Status Text */}
      {showStatus && (
        <motion.p
          className={cn(
            'text-xs font-medium transition-colors duration-300',
            getStatusColor()
          )}
          animate={{
            opacity: isListening ? [1, 0.7, 1] : 1
          }}
          transition={{
            opacity: isListening
              ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.3 }
          }}
        >
          {getStatusText()}
        </motion.p>
      )}

      {/* Listening Pulse Effect */}
      {isListening && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-primary/30"
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.3, 0, 0.3]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      )}
    </div>
  )
}

// Simplified version for minimal use cases
export function MinimalVoiceIndicator({
  isActive,
  className
}: {
  isActive: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-center space-x-1', className)}>
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          className={cn(
            'w-1 h-3 rounded-full',
            isActive ? 'bg-primary' : 'bg-muted'
          )}
          animate={
            isActive
              ? {
                  scaleY: [1, 1.5, 1],
                  opacity: [0.7, 1, 0.7]
                }
              : { scaleY: 1, opacity: 0.5 }
          }
          transition={{
            duration: 0.6,
            repeat: isActive ? Infinity : 0,
            delay: index * 0.1,
            ease: 'easeInOut'
          }}
        />
      ))}
    </div>
  )
}

// Tutorial-specific voice feedback component
export function TutorialVoiceFeedback({
  isListening,
  confidence,
  recognized,
  className
}: {
  isListening: boolean
  confidence?: number
  recognized?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center space-y-2', className)}>
      <VoiceWaveformVisualizer
        isListening={isListening}
        mode="tutorial"
        showStatus={false}
      />

      {/* Confidence Indicator */}
      {confidence !== undefined && (
        <div className="flex items-center space-x-2">
          <span className="text-xs text-muted-foreground">Confidence:</span>
          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                confidence > 0.8 ? 'bg-green-500' :
                confidence > 0.6 ? 'bg-yellow-500' : 'bg-red-500'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${confidence * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <span className="text-xs font-medium">
            {Math.round(confidence * 100)}%
          </span>
        </div>
      )}

      {/* Recognition Status */}
      {recognized !== undefined && (
        <motion.div
          className={cn(
            'px-2 py-1 rounded-full text-xs font-medium',
            recognized
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          )}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          {recognized ? 'Command recognized!' : 'Try again'}
        </motion.div>
      )}
    </div>
  )
}