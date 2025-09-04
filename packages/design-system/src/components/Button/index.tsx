import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '../../utils/cn'
import { ButtonPropsSchema, type ButtonProps } from '../../schemas/component-schemas'
import { ButtonAriaRequirements, validateAriaCompliance } from '../../schemas/aria-schemas'
import { ComponentMetadata } from '../../utils/component-metadata'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonComponentProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  children: React.ReactNode
}

// Component metadata for the site contract system
export const ButtonMetadata: ComponentMetadata = {
  name: 'Button',
  version: '1.0.0',
  description: 'Interactive button component with multiple variants and states',
  category: 'ui',
  tags: ['interactive', 'form', 'action'],
  props: ButtonPropsSchema.shape,
  requiredProps: ['children'],
  defaultProps: {
    variant: 'default',
    size: 'default',
    type: 'button',
    disabled: false,
    loading: false,
  },
  variants: {
    variant: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    size: ['default', 'sm', 'lg', 'icon'],
  },
}

const Button = React.forwardRef<HTMLButtonElement, ButtonComponentProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    // Validate ARIA compliance
    const ariaValidation = validateAriaCompliance('Button', props)
    if (!ariaValidation.isCompliant && process.env['NODE_ENV'] === 'development') {
      console.warn(`Button ARIA violations:`, ariaValidation.violations)
    }

    const Comp = asChild ? Slot : 'button'
    const isDisabled = disabled || loading

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        {...props}
      >
        {loading && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

// Export with metadata
export { Button, buttonVariants }
export type { ButtonComponentProps as ButtonProps }