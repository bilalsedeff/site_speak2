import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Shield, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface VoiceConsentModalProps {
  isOpen: boolean
  onAccept: () => void
  onDecline: () => void
}

export function VoiceConsentModal({ isOpen, onAccept, onDecline }: VoiceConsentModalProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
    }
  }, [isOpen])

  const handleAccept = () => {
    onAccept()
    setIsVisible(false)
  }

  const handleDecline = () => {
    onDecline()
    setIsVisible(false)
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="w-full max-w-md bg-background rounded-xl shadow-2xl border border-border"
          >
            {/* Header */}
            <div className="p-6 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Mic className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Voice Assistant
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Permission Required
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDecline}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <p className="text-foreground text-sm leading-relaxed">
                  To use the voice assistant, we need access to your microphone to hear and process your voice commands.
                </p>

                <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                  <div className="flex items-start space-x-3">
                    <Shield className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Your privacy is protected:</span>
                      <ul className="mt-1 space-y-1 ml-2">
                        <li>• Audio is processed in real-time only</li>
                        <li>• No recordings are permanently stored</li>
                        <li>• You can disable this anytime in settings</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground/80">
                  By continuing, you agree to allow microphone access for voice interactions.
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 pt-2 flex space-x-3">
              <Button
                variant="outline"
                onClick={handleDecline}
                className="flex-1"
              >
                Not Now
              </Button>
              <Button
                onClick={handleAccept}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                <Check className="h-4 w-4 mr-2" />
                Allow Voice Access
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}