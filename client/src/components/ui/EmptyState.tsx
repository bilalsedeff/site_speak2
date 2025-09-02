import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  actions?: Array<{
    label: string
    onClick: () => void
    variant?: 'default' | 'outline' | 'ghost'
    icon?: React.ReactNode
  }>
  className?: string
}

/**
 * Empty State component that follows UI/UX guidelines:
 * - Shows 1-2 "next best actions"
 * - Teaches users what to do next
 * - Uses actionable, context-aware copy
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actions = [],
  className,
}) => {
  return (
    <div className={cn('empty-state', className)}>
      {icon && (
        <div className="empty-state-icon">
          {icon}
        </div>
      )}
      
      <h3 className="empty-state-title max-heading-width">
        {title}
      </h3>
      
      {description && (
        <p className="empty-state-description max-reading-width">
          {description}
        </p>
      )}
      
      {actions.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          {actions.slice(0, 2).map((action, index) => (
            <Button
              key={index}
              onClick={action.onClick}
              variant={action.variant || (index === 0 ? 'default' : 'outline')}
              className="min-w-[120px]"
            >
              {action.icon && (
                <span className="mr-2" aria-hidden="true">
                  {action.icon}
                </span>
              )}
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

export { EmptyState }