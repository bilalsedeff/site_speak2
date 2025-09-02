import * as React from 'react'
import { cn } from '@/lib/utils'
import { Breadcrumbs, type BreadcrumbItem } from '../ui/Breadcrumbs'

interface PageLayoutProps {
  children: React.ReactNode
  type?: 'dashboard' | 'catalog' | 'detail' | 'form'
  breadcrumbs?: BreadcrumbItem[]
  title?: string
  description?: string
  actions?: React.ReactNode
  sidebar?: React.ReactNode
  filters?: React.ReactNode
  className?: string
}

/**
 * Page Layout component implementing UI/UX guidelines:
 * - Dashboard: 3-column responsive grid
 * - Catalog: sticky filters + content grid
 * - Detail: left content, right sidebar
 * - Form: single column with proper grouping
 */
const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  type = 'dashboard',
  breadcrumbs,
  title,
  description,
  actions,
  sidebar,
  filters,
  className,
}) => {
  const getLayoutClass = () => {
    switch (type) {
      case 'dashboard':
        return 'layout-dashboard'
      case 'catalog':
        return 'layout-catalog'
      case 'detail':
        return 'layout-detail'
      case 'form':
        return 'max-w-2xl mx-auto'
      default:
        return ''
    }
  }

  return (
    <div className={cn('min-h-screen bg-background', className)}>
      {/* Header area with navigation */}
      <header className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="mb-4">
              <Breadcrumbs items={breadcrumbs} />
            </div>
          )}
          
          {(title || description || actions) && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                {title && (
                  <h1 className="text-2xl font-bold text-foreground max-heading-width">
                    {title}
                  </h1>
                )}
                {description && (
                  <p className="text-muted-foreground mt-1 max-reading-width">
                    {description}
                  </p>
                )}
              </div>
              
              {actions && (
                <div className="flex-shrink-0">
                  {actions}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main content area */}
      <main 
        className="container mx-auto px-4 py-8"
        role="main"
        aria-label="Main content"
      >
        {type === 'catalog' && filters ? (
          <div className="layout-catalog">
            {/* Filters sidebar */}
            <aside className="layout-filters">
              <div className="space-y-6">
                {filters}
              </div>
            </aside>
            
            {/* Main content */}
            <div className="layout-content">
              {children}
            </div>
          </div>
        ) : type === 'detail' && sidebar ? (
          <div className="layout-detail">
            {/* Main content */}
            <div className="layout-detail-content">
              {children}
            </div>
            
            {/* Sidebar */}
            <aside className="layout-detail-sidebar">
              {sidebar}
            </aside>
          </div>
        ) : (
          <div className={getLayoutClass()}>
            {children}
          </div>
        )}
      </main>
    </div>
  )
}

/**
 * Dashboard Hero section for KPIs
 */
interface DashboardHeroProps {
  children: React.ReactNode
  className?: string
}

const DashboardHero: React.FC<DashboardHeroProps> = ({ children, className }) => {
  return (
    <section className={cn('layout-hero', className)}>
      {children}
    </section>
  )
}

/**
 * Content section with proper spacing
 */
interface ContentSectionProps {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
  spacing?: 'comfortable' | 'compact'
}

const ContentSection: React.FC<ContentSectionProps> = ({
  title,
  description,
  children,
  className,
  spacing = 'comfortable',
}) => {
  return (
    <section className={cn(
      spacing === 'comfortable' ? 'density-comfortable' : 'density-compact',
      'space-y-6',
      className
    )}>
      {(title || description) && (
        <header className="space-y-2">
          {title && (
            <h2 className="text-xl font-semibold text-foreground max-heading-width">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-muted-foreground max-reading-width">
              {description}
            </p>
          )}
        </header>
      )}
      
      <div>
        {children}
      </div>
    </section>
  )
}

export { PageLayout, DashboardHero, ContentSection }