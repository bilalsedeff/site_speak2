import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Volume2, VolumeX, RotateCcw, ArrowRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TutorialProgressIndicator } from './TutorialProgressIndicator'
import { TutorialVoiceFeedback } from './VoiceWaveformVisualizer'

interface TutorialStep {
  id: string
  title: string
  content: string
  voiceInstructions: string
  expectedCommands?: string[]
  hints?: string[]
  successMessage?: string
  errorMessage?: string
}

interface VoiceTutorialModalProps {
  isOpen: boolean
  onClose: () => void
  tutorial: {
    id: string
    title: string
    description: string
    steps: TutorialStep[]
  }
  onComplete?: (completionData: any) => void
  onProgress?: (stepId: string, progress: number) => void
}

export function VoiceTutorialModal({
  isOpen,
  onClose,
  tutorial,
  onComplete,
  onProgress
}: VoiceTutorialModalProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isListening] = useState(false)
  const [audioLevel] = useState(0)
  void isListening
  void audioLevel
  const [confidence, setConfidence] = useState<number>()
  const [recognized, setRecognized] = useState<boolean>()
  const [attempts, setAttempts] = useState(0)
  const [isSpeaking, setIsSpeaking] = useState(false)
  void isSpeaking
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())

  const currentStep = tutorial.steps[currentStepIndex]
  const isLastStep = currentStepIndex === tutorial.steps.length - 1
  const isFirstStep = currentStepIndex === 0

  // Calculate overall progress
  const overallProgress = (completedSteps.size / tutorial.steps.length) * 100

  // Handle voice recognition feedback
  const handleVoiceCommand = useCallback((command: string, confidence: number) => {
    setConfidence(confidence)
    setAttempts(prev => prev + 1)

    if (currentStep && currentStep.expectedCommands) {
      const isMatch = currentStep.expectedCommands.some(expected =>
        command.toLowerCase().includes(expected.toLowerCase())
      )

      setRecognized(isMatch)

      if (isMatch && confidence > 0.7) {
        // Success - move to next step
        setTimeout(() => {
          if (currentStep) {
            setCompletedSteps(prev => new Set([...prev, currentStep.id]))
            onProgress?.(currentStep.id, 100)
          }

          if (isLastStep) {
            // Tutorial completed
            if (currentStep) {
              onComplete?.({
                tutorialId: tutorial.id,
                completedSteps: [...completedSteps, currentStep.id],
                totalAttempts: attempts,
                completionTime: Date.now()
              })
            }
          } else {
            setCurrentStepIndex(prev => prev + 1)
            setAttempts(0)
            setConfidence(undefined)
            setRecognized(undefined)
          }
        }, 1500)
      }
    }
  }, [currentStep, completedSteps, attempts, isLastStep, tutorial.id, onComplete, onProgress])

  // Mark as used to avoid TypeScript warnings
  void handleVoiceCommand

  // Speak instructions
  const speakInstructions = useCallback((text: string) => {
    if (!audioEnabled) {return}

    setIsSpeaking(true)

    // Use Web Speech API or your TTS service
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.9
    utterance.pitch = 1
    utterance.volume = 0.8

    utterance.onend = () => {
      setIsSpeaking(false)
    }

    speechSynthesis.speak(utterance)
  }, [audioEnabled])

  // Auto-speak instructions when step changes
  useEffect(() => {
    if (isOpen && currentStep && audioEnabled) {
      // Small delay to let animations settle
      setTimeout(() => {
        speakInstructions(currentStep.voiceInstructions)
      }, 500)
    }
  }, [currentStepIndex, isOpen, currentStep, audioEnabled, speakInstructions])

  // Navigation handlers
  const goToNextStep = () => {
    if (!isLastStep) {
      setCurrentStepIndex(prev => prev + 1)
      setAttempts(0)
      setConfidence(undefined)
      setRecognized(undefined)
    }
  }

  const goToPreviousStep = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(prev => prev - 1)
      setAttempts(0)
      setConfidence(undefined)
      setRecognized(undefined)
    }
  }

  const retryStep = () => {
    setAttempts(0)
    setConfidence(undefined)
    setRecognized(undefined)
    if (audioEnabled && currentStep) {
      speakInstructions(currentStep.voiceInstructions)
    }
  }

  // Create progress steps for indicator
  const progressSteps = tutorial.steps.map((step, index) => ({
    id: step.id,
    title: step.title,
    status: completedSteps.has(step.id) ? 'completed' as const :
            index === currentStepIndex ? 'current' as const : 'upcoming' as const,
    ...(index === currentStepIndex && { progress: Math.min(95, attempts * 25) })
  }))

  if (!isOpen) {return null}

  return (
    <AnimatePresence>
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
          className="w-full max-w-2xl bg-background rounded-2xl shadow-2xl border border-border overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 pb-4 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {tutorial.title}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {tutorial.description}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAudioEnabled(!audioEnabled)}
                  className="h-8 w-8 p-0"
                >
                  {audioEnabled ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Progress Indicator */}
            <TutorialProgressIndicator
              steps={progressSteps}
              variant="horizontal"
              showLabels={false}
            />

            {/* Overall Progress */}
            <div className="mt-3 text-center">
              <span className="text-sm text-muted-foreground">
                Step {currentStepIndex + 1} of {tutorial.steps.length}
              </span>
              <span className="text-sm font-medium text-foreground ml-2">
                ({Math.round(overallProgress)}% complete)
              </span>
            </div>
          </div>

          {/* Current Step Content */}
          <div className="p-6">
            {currentStep && (
              <motion.div
                key={currentStep.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Step Title and Content */}
                <div className="text-center space-y-3">
                  <h3 className="text-lg font-semibold text-foreground">
                    {currentStep.title}
                  </h3>
                  <p className="text-foreground leading-relaxed">
                    {currentStep.content}
                  </p>
                </div>

                {/* Voice Instructions */}
                <div className="bg-muted/30 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    Try saying:
                  </p>
                  <p className="font-medium text-foreground">
                    "{currentStep.voiceInstructions}"
                  </p>
                </div>

                {/* Voice Feedback */}
                <div className="flex justify-center">
                  <TutorialVoiceFeedback
                    isListening={isListening}
                    {...(confidence !== undefined && { confidence })}
                    {...(recognized !== undefined && { recognized })}
                  />
                </div>

                {/* Expected Commands */}
                {currentStep.expectedCommands && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground text-center">
                      Alternative commands:
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {currentStep.expectedCommands.map((command, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-muted rounded-full text-xs font-medium"
                        >
                          "{command}"
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hints */}
                {currentStep.hints && attempts > 2 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4"
                  >
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                      💡 Hint:
                    </p>
                    <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                      {currentStep.hints.map((hint, index) => (
                        <li key={index}>• {hint}</li>
                      ))}
                    </ul>
                  </motion.div>
                )}

                {/* Feedback Messages */}
                <AnimatePresence>
                  {recognized === true && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center"
                    >
                      <p className="text-green-800 dark:text-green-200 font-medium">
                        {currentStep.successMessage || "Great! Command recognized successfully!"}
                      </p>
                    </motion.div>
                  )}

                  {recognized === false && confidence !== undefined && confidence < 0.7 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center"
                    >
                      <p className="text-red-800 dark:text-red-200 font-medium mb-2">
                        {currentStep.errorMessage || "Command not recognized. Please try again."}
                      </p>
                      {attempts > 1 && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          Attempt {attempts} • Speak clearly and naturally
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-muted/30 border-t border-border flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {!isFirstStep && (
                <Button variant="outline" onClick={goToPreviousStep}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
              )}

              <Button variant="outline" onClick={retryStep}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>

            <div className="flex items-center space-x-2">
              {!isLastStep && (
                <Button variant="outline" onClick={goToNextStep}>
                  Skip
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}

              {isLastStep && currentStep && completedSteps.has(currentStep.id) && (
                <Button onClick={() => onComplete?.({
                  tutorialId: tutorial.id,
                  completedSteps: [...completedSteps],
                  totalAttempts: attempts,
                  completionTime: Date.now()
                })}>
                  Complete Tutorial
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}