import { motion, AnimatePresence } from 'framer-motion'
import { User, Bot, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface TranscriptDisplayProps {
  transcript: string
  response: string
  isProcessing: boolean
}

export function TranscriptDisplay({ transcript, response, isProcessing }: TranscriptDisplayProps) {
  const playResponse = () => {
    if (response && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(response)
      utterance.rate = 0.9
      utterance.pitch = 1
      speechSynthesis.speak(utterance)
    }
  }

  return (
    <div className="space-y-3">
      {/* User Transcript */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="flex items-start space-x-3"
          >
            <div className="flex-shrink-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
              <User className="h-3 w-3 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-primary/10 rounded-lg p-3">
                <p className="text-sm text-foreground font-medium">You said:</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {transcript}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Processing State */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="flex items-start space-x-3"
          >
            <div className="flex-shrink-0 w-6 h-6 bg-muted rounded-full flex items-center justify-center">
              <Bot className="h-3 w-3 text-muted-foreground animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Processing your request...
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Response */}
      <AnimatePresence>
        {response && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="flex items-start space-x-3"
          >
            <div className="flex-shrink-0 w-6 h-6 bg-secondary rounded-full flex items-center justify-center">
              <Bot className="h-3 w-3 text-secondary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-secondary/50 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-foreground font-medium mb-1">SiteSpeak AI:</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {response}
                    </p>
                  </div>
                  
                  {/* Play Response Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={playResponse}
                    className="h-8 w-8 p-0 flex-shrink-0 ml-2"
                    title="Play response"
                  >
                    <Volume2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!transcript && !response && !isProcessing && (
        <div className="text-center py-8">
          <Bot className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-2">
            Voice Assistant Ready
          </p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Click the microphone button and start speaking to interact with your AI assistant
          </p>
        </div>
      )}
    </div>
  )
}