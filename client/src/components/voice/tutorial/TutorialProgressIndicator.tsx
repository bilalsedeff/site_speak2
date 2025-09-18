import { motion } from 'framer-motion'
import { Check, Circle, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TutorialStep {
  id: string
  title: string
  status: 'completed' | 'current' | 'upcoming'
  progress?: number // 0-100 for current step
}

interface TutorialProgressIndicatorProps {
  steps: TutorialStep[]
  className?: string
  variant?: 'horizontal' | 'vertical'
  showLabels?: boolean
}

export function TutorialProgressIndicator({
  steps,
  className,
  variant = 'horizontal',
  showLabels = true
}: TutorialProgressIndicatorProps) {
  const isHorizontal = variant === 'horizontal'

  return (
    <div
      className={cn(
        'flex items-center',
        isHorizontal ? 'space-x-4' : 'flex-col space-y-4',
        className
      )}
    >
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={cn(
            'flex items-center',
            isHorizontal ? 'flex-col' : 'flex-row',
            isHorizontal && showLabels ? 'space-y-2' : 'space-x-3'
          )}
        >
          {/* Step Circle */}
          <motion.div
            className="relative flex items-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
          >
            {/* Connection Line (not for first item) */}
            {index > 0 && (
              <div
                className={cn(
                  'absolute bg-border',
                  isHorizontal
                    ? '-left-4 top-1/2 h-px w-4 -translate-y-1/2'
                    : '-top-4 left-1/2 w-px h-4 -translate-x-1/2'
                )}
              />
            )}

            {/* Main Circle */}
            <motion.div
              className={cn(
                'relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300',
                step.status === 'completed' && 'bg-green-500 border-green-500',
                step.status === 'current' && 'bg-primary border-primary',
                step.status === 'upcoming' && 'bg-background border-border'
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {step.status === 'completed' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <Check className="h-5 w-5 text-white" />
                </motion.div>
              )}

              {step.status === 'current' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <Play className="h-4 w-4 text-white" />
                </motion.div>
              )}

              {step.status === 'upcoming' && (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}

              {/* Progress Ring for Current Step */}
              {step.status === 'current' && step.progress !== undefined && (
                <motion.svg
                  className="absolute inset-0 h-full w-full -rotate-90"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <circle
                    cx="50%"
                    cy="50%"
                    r="18"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    className="text-primary/20"
                  />
                  <motion.circle
                    cx="50%"
                    cy="50%"
                    r="18"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    className="text-primary"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 18}`}
                    initial={{ strokeDashoffset: `${2 * Math.PI * 18}` }}
                    animate={{
                      strokeDashoffset: `${2 * Math.PI * 18 * (1 - (step.progress || 0) / 100)}`
                    }}
                    transition={{ duration: 0.6, ease: 'easeInOut' }}
                  />
                </motion.svg>
              )}
            </motion.div>

            {/* Pulse Animation for Current Step */}
            {step.status === 'current' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-primary/20"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0, 0.5]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
              />
            )}
          </motion.div>

          {/* Step Label */}
          {showLabels && (
            <motion.div
              className={cn(
                'text-center',
                isHorizontal ? 'min-w-0' : 'min-w-0 flex-1'
              )}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 + 0.2 }}
            >
              <p
                className={cn(
                  'text-sm font-medium leading-tight',
                  step.status === 'completed' && 'text-green-600',
                  step.status === 'current' && 'text-primary',
                  step.status === 'upcoming' && 'text-muted-foreground'
                )}
              >
                {step.title}
              </p>
              {step.status === 'current' && step.progress !== undefined && (
                <p className="text-xs text-muted-foreground mt-1">
                  {Math.round(step.progress)}% complete
                </p>
              )}
            </motion.div>
          )}
        </div>
      ))}
    </div>
  )
}

// Usage example:
/*
const tutorialSteps: TutorialStep[] = [
  { id: 'welcome', title: 'Welcome', status: 'completed' },
  { id: 'permissions', title: 'Permissions', status: 'completed' },
  { id: 'basic-commands', title: 'Basic Commands', status: 'current', progress: 60 },
  { id: 'navigation', title: 'Navigation', status: 'upcoming' },
  { id: 'advanced', title: 'Advanced Features', status: 'upcoming' }
]

<TutorialProgressIndicator
  steps={tutorialSteps}
  variant="horizontal"
  showLabels={true}
/>
*/