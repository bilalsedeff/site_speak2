import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface VoiceVisualizerProps {
  isListening: boolean
  isProcessing: boolean
  audioLevel: number
}

export function VoiceVisualizer({ isListening, isProcessing, audioLevel }: VoiceVisualizerProps) {
  // Generate wave bars with different heights based on audio level
  const generateWaveBars = () => {
    const bars = []
    const numBars = 20
    const baseHeight = 4
    const maxHeight = 40
    
    for (let i = 0; i < numBars; i++) {
      const heightMultiplier = isListening 
        ? Math.max(0.2, audioLevel + (Math.sin(Date.now() * 0.005 + i * 0.5) * 0.3))
        : 0.2
      
      const height = Math.max(baseHeight, heightMultiplier * maxHeight)
      
      bars.push(
        <motion.div
          key={i}
          className={cn(
            "rounded-full transition-colors duration-200",
            isListening 
              ? "bg-primary" 
              : isProcessing
              ? "bg-yellow-500"
              : "bg-muted-foreground/30"
          )}
          animate={{
            height: isListening || isProcessing ? height : baseHeight,
            opacity: isListening || isProcessing ? 1 : 0.5,
          }}
          transition={{
            duration: 0.1,
            ease: "easeOut",
            delay: isListening ? i * 0.02 : 0,
          }}
          style={{
            width: '3px',
            minHeight: `${baseHeight}px`,
          }}
        />
      )
    }
    
    return bars
  }

  return (
    <div className="flex items-center justify-center space-x-1 h-12 px-4">
      {/* Status indicator */}
      <div className="flex items-center justify-center mr-4">
        {isListening && (
          <motion.div
            className="w-3 h-3 bg-primary rounded-full"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [1, 0.7, 1],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
        
        {isProcessing && (
          <motion.div
            className="w-3 h-3 bg-yellow-500 rounded-full"
            animate={{
              rotate: 360,
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        )}
        
        {!isListening && !isProcessing && (
          <div className="w-3 h-3 bg-muted-foreground/30 rounded-full" />
        )}
      </div>

      {/* Wave visualizer */}
      <div className="voice-visualizer">
        {generateWaveBars()}
      </div>

      {/* Audio level indicator */}
      {isListening && (
        <div className="ml-4 flex flex-col items-center space-y-1">
          <div className="text-xs text-muted-foreground">Level</div>
          <div className="w-2 h-8 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="w-full bg-primary rounded-full"
              animate={{
                height: `${Math.max(10, audioLevel * 100)}%`,
              }}
              transition={{ duration: 0.1 }}
              style={{
                transformOrigin: 'bottom',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}