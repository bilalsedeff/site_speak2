import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Mic, ArrowRight, Lightbulb, Target, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

interface TutorialCardProps {
  title: string
  description: string
  icon?: ReactNode
  type?: 'lesson' | 'practice' | 'tip' | 'achievement'
  status?: 'available' | 'current' | 'completed' | 'locked'
  progress?: number // 0-100
  estimatedTime?: string
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
  onStart?: () => void
  onContinue?: () => void
  className?: string
  children?: ReactNode
}

export function TutorialCard({
  title,
  description,
  icon,
  type = 'lesson',
  status = 'available',
  progress,
  estimatedTime,
  difficulty,
  onStart,
  onContinue,
  className,
  children
}: TutorialCardProps) {
  const isInteractive = status !== 'locked'
  const showProgress = status === 'current' && progress !== undefined

  const getTypeIcon = () => {
    if (icon) {return icon}
    switch (type) {
      case 'lesson':
        return <Mic className="h-5 w-5" />
      case 'practice':
        return <Target className="h-5 w-5" />
      case 'tip':
        return <Lightbulb className="h-5 w-5" />
      case 'achievement':
        return <CheckCircle className="h-5 w-5" />
      default:
        return <Mic className="h-5 w-5" />
    }
  }

  const getTypeColor = () => {
    switch (type) {
      case 'lesson':
        return 'text-blue-500'
      case 'practice':
        return 'text-green-500'
      case 'tip':
        return 'text-yellow-500'
      case 'achievement':
        return 'text-purple-500'
      default:
        return 'text-primary'
    }
  }

  const getDifficultyColor = () => {
    switch (difficulty) {
      case 'beginner':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'advanced':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const getActionButton = () => {
    if (status === 'locked') {
      return (
        <Button variant="ghost" disabled className="cursor-not-allowed">
          Locked
        </Button>
      )
    }

    if (status === 'completed') {
      return (
        <Button variant="outline" onClick={onStart}>
          Review
        </Button>
      )
    }

    if (status === 'current' && onContinue) {
      return (
        <Button onClick={onContinue} className="group">
          Continue
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      )
    }

    return (
      <Button onClick={onStart} variant={status === 'current' ? 'default' : 'outline'}>
        Start
      </Button>
    )
  }

  return (
    <motion.div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card transition-all duration-300',
        isInteractive && 'hover:shadow-lg cursor-pointer',
        status === 'current' && 'ring-2 ring-primary/20 shadow-md',
        status === 'completed' && 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800',
        status === 'locked' && 'opacity-60',
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      {...(isInteractive && { whileHover: { y: -2 } })}
      transition={{ duration: 0.3 }}
    >
      {/* Progress Bar */}
      {showProgress && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      )}

      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start space-x-3">
            <div className={cn('p-2 rounded-lg bg-muted/50', getTypeColor())}>
              {getTypeIcon()}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground text-lg leading-tight">
                {title}
              </h3>
              <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
                {description}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          {status === 'completed' && (
            <motion.div
              className="p-1 rounded-full bg-green-100 dark:bg-green-900/30"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <CheckCircle className="h-4 w-4 text-green-600" />
            </motion.div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center space-x-4 mb-4">
          {estimatedTime && (
            <span className="text-xs text-muted-foreground flex items-center">
              <span className="mr-1">⏱️</span>
              {estimatedTime}
            </span>
          )}

          {difficulty && (
            <span className={cn('px-2 py-1 rounded-full text-xs font-medium', getDifficultyColor())}>
              {difficulty}
            </span>
          )}

          {type && (
            <span className="text-xs text-muted-foreground capitalize">
              {type}
            </span>
          )}
        </div>

        {/* Progress Text */}
        {showProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{Math.round(progress)}% complete</span>
            </div>
          </div>
        )}

        {/* Custom Content */}
        {children && (
          <div className="mb-4">
            {children}
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end">
          {getActionButton()}
        </div>
      </div>

      {/* Decorative Elements */}
      {status === 'current' && (
        <motion.div
          className="absolute top-4 right-4 w-2 h-2 bg-primary rounded-full"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [1, 0.7, 1]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      )}

      {/* Shimmer Effect for Locked Items */}
      {status === 'locked' && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] animate-shimmer" />
      )}
    </motion.div>
  )
}

// Specialized cards for different tutorial types
export function VoiceLessonCard({
  title,
  description,
  commands,
  onStart,
  ...props
}: Omit<TutorialCardProps, 'type' | 'icon'> & {
  commands?: string[]
}) {
  return (
    <TutorialCard
      {...props}
      title={title}
      description={description}
      type="lesson"
      icon={<Mic className="h-5 w-5" />}
      {...(onStart && { onStart })}
    >
      {commands && commands.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            You'll learn:
          </p>
          <ul className="space-y-1">
            {commands.map((command, index) => (
              <li key={index} className="text-sm text-foreground flex items-center">
                <span className="w-1.5 h-1.5 bg-primary rounded-full mr-2 flex-shrink-0" />
                "{command}"
              </li>
            ))}
          </ul>
        </div>
      )}
    </TutorialCard>
  )
}

export function PracticeCard({
  title,
  description,
  targetAccuracy = 80,
  attempts = 0,
  onStart,
  ...props
}: Omit<TutorialCardProps, 'type' | 'icon'> & {
  targetAccuracy?: number
  attempts?: number
}) {
  return (
    <TutorialCard
      {...props}
      title={title}
      description={description}
      type="practice"
      icon={<Target className="h-5 w-5" />}
      {...(onStart && { onStart })}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Target accuracy</span>
        <span className="font-medium">{targetAccuracy}%</span>
      </div>
      {attempts > 0 && (
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-muted-foreground">Attempts</span>
          <span className="font-medium">{attempts}</span>
        </div>
      )}
    </TutorialCard>
  )
}

export function TipCard({
  title,
  description,
  category,
  ...props
}: Omit<TutorialCardProps, 'type' | 'icon'> & {
  category?: string
}) {
  return (
    <TutorialCard
      {...props}
      title={title}
      description={description}
      type="tip"
      icon={<Lightbulb className="h-5 w-5" />}
    >
      {category && (
        <span className="inline-block px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full text-xs font-medium">
          {category}
        </span>
      )}
    </TutorialCard>
  )
}