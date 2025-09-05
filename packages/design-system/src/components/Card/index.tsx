import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../utils/cn'
import { CardPropsSchema } from '../../schemas/component-schemas'
import { validateAriaCompliance } from '../../schemas/aria-schemas'
import { ComponentMetadata, generateAriaAttributes } from '../../utils/component-metadata'

const cardVariants = cva(
  'rounded-lg border bg-card text-card-foreground shadow-sm',
  {
    variants: {
      variant: {
        default: 'border-border',
        outlined: 'border-2 border-border',
        elevated: 'shadow-md border-0',
      },
      padding: {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-6',
        lg: 'p-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
    },
  }
)

export interface CardComponentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  // Structured data props for Schema.org
  itemType?: string
  itemProp?: string
  itemScope?: boolean
}

// Component metadata
export const CardMetadata: ComponentMetadata = {
  name: 'Card',
  version: '1.0.0',
  description: 'Container component for grouping related content with optional structured data',
  category: 'layout',
  tags: ['container', 'content', 'structured-data'],
  props: CardPropsSchema.shape,
  requiredProps: ['children'],
  defaultProps: {
    variant: 'default',
    padding: 'md',
  },
  variants: {
    variant: ['default', 'outlined', 'elevated'],
    padding: ['none', 'sm', 'md', 'lg'],
  },
}

const Card = React.forwardRef<HTMLDivElement, CardComponentProps>(
  ({ className, variant, padding, itemType, itemProp, itemScope, children, ...props }, ref) => {
    // Validate ARIA compliance
    const ariaValidation = validateAriaCompliance('Card', props)
    if (!ariaValidation.isCompliant && process.env['NODE_ENV'] === 'development') {
      console.warn(`Card ARIA violations:`, ariaValidation.violations)
    }

    // Generate ARIA attributes
    const ariaAttributes = generateAriaAttributes('Card', props)

    // Structured data attributes
    const structuredDataAttributes: Record<string, any> = {}
    if (itemType) {structuredDataAttributes['itemType'] = itemType}
    if (itemProp) {structuredDataAttributes['itemProp'] = itemProp}
    if (itemScope) {structuredDataAttributes['itemScope'] = itemScope}

    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, padding }), className)}
        {...ariaAttributes}
        {...structuredDataAttributes}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-2xl font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  >
    {children}
  </h3>
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  cardVariants,
}
export type { CardComponentProps as CardProps }