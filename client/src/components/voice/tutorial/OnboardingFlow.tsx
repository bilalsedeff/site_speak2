import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  Volume2,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Shield,
  Zap,
  Target,
  HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { VoiceWaveformVisualizer } from './VoiceWaveformVisualizer'
import { VoiceConsentModal } from '../VoiceConsentModal'
import { cn } from '@/lib/utils'

interface OnboardingStep {
  id: string
  title: string
  subtitle: string
  content: React.ReactNode
  icon: React.ReactNode
  action?: {
    label: string
    handler: () => Promise<void> | void
  }
  skipLabel?: string
  showProgress?: boolean
}

interface OnboardingFlowProps {
  isOpen: boolean
  onComplete: (data: any) => void
  onClose: () => void
  initialStep?: number
  userContext?: {
    isReturningUser: boolean
    hasUsedVoiceAssistants: boolean
    deviceType: 'mobile' | 'tablet' | 'desktop'
  }
}

export function OnboardingFlow({
  isOpen,
  onComplete,
  onClose,
  initialStep = 0,
  userContext = {
    isReturningUser: false,
    hasUsedVoiceAssistants: false,
    deviceType: 'desktop'
  }
}: OnboardingFlowProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStep)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [permissionsGranted, setPermissionsGranted] = useState(false)
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  void setMicrophoneLevel // Intentionally unused - for future enhancement
  const [isTestingVoice, setIsTestingVoice] = useState(false)
  const [voiceTestResult, setVoiceTestResult] = useState<'success' | 'failed' | null>(null)

  // Function declarations (moved above steps to fix hoisting issues)
  const advanceStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      setCompletedSteps(prev => new Set([...prev, currentStepIndex]))
      setCurrentStepIndex(prev => prev + 1)
    }
  }, [currentStepIndex])

  const requestMicrophonePermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop()) // Stop the stream immediately
      setPermissionsGranted(true)
      setTimeout(advanceStep, 1000) // Auto-advance after showing success
    } catch (error) {
      console.error('Microphone permission denied:', error)
      setShowConsentModal(true)
    }
  }, [advanceStep])

  const testVoice = useCallback(async () => {
    setIsTestingVoice(true)
    setVoiceTestResult(null)

    try {
      // Simulate voice test (in real implementation, this would use the VoiceTutorialEngine)
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Simulate random success/failure for demo
      const success = Math.random() > 0.3
      setVoiceTestResult(success ? 'success' : 'failed')

      if (success) {
        setTimeout(advanceStep, 2000)
      }
    } catch (error) {
      setVoiceTestResult('failed')
    } finally {
      setIsTestingVoice(false)
    }
  }, [advanceStep])

  const completeOnboarding = useCallback(() => {
    const completionData = {
      completedAt: new Date(),
      stepsCompleted: completedSteps.size,
      totalSteps: 5, // Using fixed value instead of steps.length to avoid circular dependency
      permissionsGranted,
      voiceTestPassed: voiceTestResult === 'success',
      userContext
    }
    onComplete(completionData)
  }, [completedSteps.size, permissionsGranted, voiceTestResult, userContext, onComplete])

  // Define onboarding steps
  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to SiteSpeak',
      subtitle: 'Your voice-powered website assistant',
      icon: <Sparkles className="h-12 w-12 text-primary" />,
      content: (
        <div className="text-center space-y-6">
          <div className="max-w-md mx-auto">
            <p className="text-lg text-foreground leading-relaxed">
              Navigate, search, and interact with websites using just your voice.
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Let's get you set up in just a few quick steps.
            </p>
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <motion.div
              className="p-4 bg-muted/50 rounded-lg"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Zap className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
              <h4 className="font-medium text-sm">Lightning Fast</h4>
              <p className="text-xs text-muted-foreground">
                Ultra-low latency responses
              </p>
            </motion.div>

            <motion.div
              className="p-4 bg-muted/50 rounded-lg"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Shield className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <h4 className="font-medium text-sm">Private & Secure</h4>
              <p className="text-xs text-muted-foreground">
                No recordings stored
              </p>
            </motion.div>

            <motion.div
              className="p-4 bg-muted/50 rounded-lg"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Target className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <h4 className="font-medium text-sm">Universal</h4>
              <p className="text-xs text-muted-foreground">
                Works on any website
              </p>
            </motion.div>
          </div>
        </div>
      ),
      action: {
        label: "Let's Get Started",
        handler: () => advanceStep()
      }
    },

    {
      id: 'permissions',
      title: 'Microphone Permission',
      subtitle: 'We need access to your microphone to hear your voice commands',
      icon: <Mic className="h-12 w-12 text-primary" />,
      content: (
        <div className="text-center space-y-6">
          <div className="max-w-md mx-auto">
            <p className="text-foreground leading-relaxed">
              To use voice commands, we need permission to access your microphone.
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Don't worry - your privacy is protected. Audio is processed in real-time and never stored.
            </p>
          </div>

          {/* Privacy assurance */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 max-w-md mx-auto">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div className="text-left">
                <h4 className="font-medium text-green-800 dark:text-green-200 text-sm">
                  Your Privacy is Protected
                </h4>
                <ul className="text-xs text-green-700 dark:text-green-300 mt-1 space-y-1">
                  <li>• Audio processed in real-time only</li>
                  <li>• No recordings permanently stored</li>
                  <li>• You control when to enable/disable</li>
                </ul>
              </div>
            </div>
          </div>

          {permissionsGranted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 max-w-md mx-auto"
            >
              <div className="flex items-center justify-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-green-800 dark:text-green-200 font-medium">
                  Microphone access granted!
                </span>
              </div>
            </motion.div>
          )}
        </div>
      ),
      action: {
        label: permissionsGranted ? 'Continue' : 'Grant Permission',
        handler: permissionsGranted ? advanceStep : requestMicrophonePermission
      },
      skipLabel: 'Skip for now'
    },

    {
      id: 'voice_test',
      title: 'Voice Test',
      subtitle: 'Let\'s test your microphone and voice recognition',
      icon: <Volume2 className="h-12 w-12 text-primary" />,
      content: (
        <div className="text-center space-y-6">
          <div className="max-w-md mx-auto">
            <p className="text-foreground leading-relaxed">
              Now let's make sure everything is working properly.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Try saying "Hello SiteSpeak" when you see the listening indicator.
            </p>
          </div>

          {/* Voice visualizer */}
          <div className="flex justify-center">
            <VoiceWaveformVisualizer
              isListening={isTestingVoice}
              audioLevel={microphoneLevel}
              mode="tutorial"
              statusText={
                isTestingVoice ? 'Say "Hello SiteSpeak"' :
                voiceTestResult === 'success' ? 'Test successful!' :
                voiceTestResult === 'failed' ? 'Let\'s try again' :
                'Click to test your voice'
              }
            />
          </div>

          {voiceTestResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'max-w-md mx-auto p-4 rounded-lg border',
                voiceTestResult === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              )}
            >
              <div className="flex items-center justify-center space-x-2">
                {voiceTestResult === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <HelpCircle className="h-5 w-5 text-red-600" />
                )}
                <span className={cn(
                  'font-medium',
                  voiceTestResult === 'success'
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-red-800 dark:text-red-200'
                )}>
                  {voiceTestResult === 'success'
                    ? 'Perfect! Your voice is working great.'
                    : 'Having trouble? Check your microphone settings.'
                  }
                </span>
              </div>
            </motion.div>
          )}
        </div>
      ),
      action: {
        label: voiceTestResult === 'success' ? 'Continue' : 'Test Voice',
        handler: voiceTestResult === 'success' ? advanceStep : testVoice
      },
      skipLabel: 'Skip test'
    },

    {
      id: 'basic_commands',
      title: 'Basic Commands',
      subtitle: 'Learn the essential voice commands',
      icon: <Target className="h-12 w-12 text-primary" />,
      content: (
        <div className="space-y-6">
          <div className="text-center max-w-md mx-auto">
            <p className="text-foreground leading-relaxed">
              Here are some basic commands to get you started:
            </p>
          </div>

          {/* Command examples */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[
              { command: 'Navigate to home', description: 'Go to homepage' },
              { command: 'Click search button', description: 'Click any button' },
              { command: 'Scroll down', description: 'Scroll the page' },
              { command: 'Go back', description: 'Previous page' }
            ].map((item, index) => (
              <motion.div
                key={index}
                className="p-4 bg-muted/50 rounded-lg border border-border"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
              >
                <div className="text-left">
                  <p className="font-medium text-foreground text-sm">
                    "{item.command}"
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              💡 Tip: Speak naturally and clearly for best results
            </p>
          </div>
        </div>
      ),
      action: {
        label: 'Start Interactive Tutorial',
        handler: () => advanceStep()
      },
      skipLabel: 'Skip to finish'
    },

    {
      id: 'completion',
      title: 'You\'re All Set!',
      subtitle: 'Ready to start using voice commands',
      icon: <CheckCircle className="h-12 w-12 text-green-500" />,
      content: (
        <div className="text-center space-y-6">
          <div className="max-w-md mx-auto">
            <p className="text-lg text-foreground leading-relaxed">
              Congratulations! You're ready to use SiteSpeak's voice assistant.
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Try it out by saying "Help me navigate" or click any button and say "Click here".
            </p>
          </div>

          {/* Success animation */}
          <motion.div
            className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, 10, -10, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
            >
              <CheckCircle className="h-10 w-10 text-green-500" />
            </motion.div>
          </motion.div>

          {/* Quick tips */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 max-w-md mx-auto">
            <h4 className="font-medium text-blue-800 dark:text-blue-200 text-sm mb-2">
              Quick Tips:
            </h4>
            <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 text-left">
              <li>• Look for the voice icon to activate commands</li>
              <li>• Use natural language - no need for exact phrases</li>
              <li>• Access help anytime by saying "Help"</li>
            </ul>
          </div>
        </div>
      ),
      action: {
        label: 'Start Using Voice Commands',
        handler: completeOnboarding
      },
      showProgress: false
    }
  ]

  const currentStep = steps[currentStepIndex]
  const isLastStep = currentStepIndex === steps.length - 1

  // Early return if no current step (should not happen in normal flow)
  if (!currentStep) {
    return null
  }

  // Progress calculation
  const progress = ((currentStepIndex + 1) / steps.length) * 100

  const goBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1)
    }
  }, [currentStepIndex])

  // Skip step
  const skipStep = useCallback(() => {
    advanceStep()
  }, [advanceStep])

  if (!isOpen) {return null}

  return (
    <>
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
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    Voice Assistant Setup
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Step {currentStepIndex + 1} of {steps.length}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0"
                >
                  ×
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Content */}
            <div className="p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-8"
                >
                  {/* Step Header */}
                  <div className="text-center space-y-4">
                    <motion.div
                      className="flex justify-center"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
                    >
                      {currentStep.icon}
                    </motion.div>
                    <div>
                      <h3 className="text-2xl font-bold text-foreground">
                        {currentStep.title}
                      </h3>
                      <p className="text-muted-foreground">
                        {currentStep.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Step Content */}
                  <div className="min-h-[300px]">
                    {currentStep.content}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-muted/30 border-t border-border flex items-center justify-between">
              <div>
                {currentStepIndex > 0 && (
                  <Button variant="outline" onClick={goBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                )}
              </div>

              <div className="flex items-center space-x-3">
                {currentStep.skipLabel && !isLastStep && (
                  <Button variant="ghost" onClick={skipStep}>
                    {currentStep.skipLabel}
                  </Button>
                )}

                {currentStep.action && (
                  <Button
                    onClick={currentStep.action.handler}
                    className="group"
                    disabled={isTestingVoice}
                  >
                    {currentStep.action.label}
                    {!isLastStep && (
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Consent Modal */}
      <VoiceConsentModal
        isOpen={showConsentModal}
        onAccept={() => {
          setShowConsentModal(false)
          requestMicrophonePermission()
        }}
        onDecline={() => {
          setShowConsentModal(false)
          advanceStep() // Continue without permissions
        }}
      />
    </>
  )
}

// Export default for easy importing
export default OnboardingFlow