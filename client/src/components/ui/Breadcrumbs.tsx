import * as React from 'react'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href?: string
  onClick?: () => void
  current?: boolean
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  showHome?: boolean
  homeHref?: string
  onHomeClick?: () => void
  separator?: React.ReactNode
  className?: string
}

/**
 * Breadcrumbs component for progressive navigation
 * Following UI/UX guidelines for navigation hierarchy
 */
const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  items,
  showHome = true,
  homeHref = '/',
  onHomeClick,
  separator = <ChevronRight className="h-4 w-4" />,
  className,
}) => {
  const allItems = showHome
    ? [
        {
          label: 'Home',
          href: homeHref,
          onClick: onHomeClick,
          current: false,
        },
        ...items,
      ]
    : items

  return (
    <nav 
      aria-label="Breadcrumb" 
      className={cn('breadcrumbs', className)}
    >
      <ol className="flex items-center space-x-2">
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1
          const isHome = showHome && index === 0

          return (
            <li key={index} className="flex items-center space-x-2">
              {index > 0 && (
                <span className="breadcrumb-separator" aria-hidden="true">
                  {separator}
                </span>
              )}
              
              {item.href || item.onClick ? (
                <a
                  href={item.href}
                  onClick={(e) => {
                    if (item.onClick) {
                      e.preventDefault()
                      item.onClick()
                    }
                  }}
                  className={cn(
                    'breadcrumb-item',
                    'focus-ring rounded-sm px-1 py-0.5',
                    isLast ? 'text-foreground font-medium' : 'hover:text-foreground'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {isHome ? (
                    <span className="flex items-center space-x-1">
                      <Home className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">{item.label}</span>
                    </span>
                  ) : (
                    item.label
                  )}
                </a>
              ) : (
                <span
                  className={cn(
                    'breadcrumb-item',
                    isLast ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {isHome ? (
                    <span className="flex items-center space-x-1">
                      <Home className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">{item.label}</span>
                    </span>
                  ) : (
                    item.label
                  )}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export { Breadcrumbs, type BreadcrumbItem }