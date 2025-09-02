import { z } from 'zod'

/**
 * ARIA landmark roles schema for semantic HTML structure
 * Based on MDN ARIA landmark roles: https://developer.mozilla.org/docs/Web/Accessibility/ARIA/Reference/Roles/landmark_role
 */
export const AriaLandmarkSchema = z.enum([
  'banner',     // Site header
  'navigation', // Nav menus
  'main',       // Primary content
  'complementary', // Sidebar content
  'contentinfo', // Site footer
  'search',     // Search functionality
  'form',       // Form containers
  'region',     // Generic landmark
])

export type AriaLandmark = z.infer<typeof AriaLandmarkSchema>

/**
 * Component ARIA requirements schema
 */
export const ComponentAriaSchema = z.object({
  // Required ARIA attributes
  requiredAttributes: z.array(z.string()).optional(),
  
  // Recommended ARIA attributes
  recommendedAttributes: z.array(z.string()).optional(),
  
  // Landmark role this component should have (if any)
  landmarkRole: AriaLandmarkSchema.optional(),
  
  // Interactive role requirements
  role: z.string().optional(),
  
  // Focus management requirements
  focusable: z.boolean().default(false),
  focusOrder: z.number().optional(),
  
  // Screen reader requirements
  screenReaderText: z.string().optional(),
  hasVisibleLabel: z.boolean().default(true),
  
  // Live region requirements
  liveRegion: z.enum(['polite', 'assertive', 'off']).optional(),
  
  // Keyboard navigation
  keyboardNavigable: z.boolean().default(false),
  keyboardShortcuts: z.array(z.object({
    key: z.string(),
    description: z.string(),
  })).optional(),
})

export type ComponentAria = z.infer<typeof ComponentAriaSchema>

/**
 * Button ARIA requirements
 */
export const ButtonAriaRequirements: ComponentAria = {
  role: 'button',
  focusable: true,
  keyboardNavigable: true,
  hasVisibleLabel: true,
  requiredAttributes: ['aria-label'],
  keyboardShortcuts: [
    { key: 'Space', description: 'Activate button' },
    { key: 'Enter', description: 'Activate button' },
  ],
}

/**
 * Input ARIA requirements
 */
export const InputAriaRequirements: ComponentAria = {
  focusable: true,
  hasVisibleLabel: true,
  requiredAttributes: ['aria-label'],
  recommendedAttributes: ['aria-describedby', 'aria-invalid', 'aria-required'],
}

/**
 * Card ARIA requirements
 */
export const CardAriaRequirements: ComponentAria = {
  role: 'article',
  recommendedAttributes: ['aria-labelledby', 'aria-describedby'],
}

/**
 * Navigation ARIA requirements
 */
export const NavigationAriaRequirements: ComponentAria = {
  landmarkRole: 'navigation',
  role: 'navigation',
  requiredAttributes: ['aria-label'],
  keyboardNavigable: true,
  keyboardShortcuts: [
    { key: 'Tab', description: 'Navigate to next item' },
    { key: 'Shift+Tab', description: 'Navigate to previous item' },
    { key: 'Arrow keys', description: 'Navigate between menu items' },
  ],
}

/**
 * Main content ARIA requirements
 */
export const MainContentAriaRequirements: ComponentAria = {
  landmarkRole: 'main',
  role: 'main',
}

/**
 * Form ARIA requirements
 */
export const FormAriaRequirements: ComponentAria = {
  landmarkRole: 'form',
  role: 'form',
  recommendedAttributes: ['aria-labelledby', 'aria-describedby'],
}

/**
 * Voice Widget ARIA requirements
 */
export const VoiceWidgetAriaRequirements: ComponentAria = {
  role: 'application',
  focusable: true,
  keyboardNavigable: true,
  hasVisibleLabel: true,
  requiredAttributes: ['aria-label', 'aria-expanded'],
  recommendedAttributes: ['aria-describedby', 'aria-live'],
  liveRegion: 'polite',
  keyboardShortcuts: [
    { key: 'Space', description: 'Start/stop voice recording' },
    { key: 'Escape', description: 'Close voice panel' },
    { key: 'Enter', description: 'Submit voice input' },
  ],
}

/**
 * Toast/Notification ARIA requirements
 */
export const ToastAriaRequirements: ComponentAria = {
  role: 'alert',
  liveRegion: 'assertive',
  requiredAttributes: ['aria-label'],
  focusable: false, // Toasts should not steal focus
}

/**
 * Modal ARIA requirements
 */
export const ModalAriaRequirements: ComponentAria = {
  role: 'dialog',
  focusable: true,
  requiredAttributes: ['aria-labelledby', 'aria-modal'],
  recommendedAttributes: ['aria-describedby'],
  keyboardShortcuts: [
    { key: 'Escape', description: 'Close modal' },
    { key: 'Tab', description: 'Navigate within modal (focus trap)' },
  ],
}

/**
 * Loading/Progress ARIA requirements
 */
export const LoadingAriaRequirements: ComponentAria = {
  role: 'progressbar',
  liveRegion: 'polite',
  requiredAttributes: ['aria-label'],
  recommendedAttributes: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'],
}

/**
 * Search ARIA requirements
 */
export const SearchAriaRequirements: ComponentAria = {
  landmarkRole: 'search',
  role: 'search',
  requiredAttributes: ['aria-label'],
  keyboardNavigable: true,
}

/**
 * Helper function to get ARIA requirements for a component
 */
export function getAriaRequirements(componentName: string): ComponentAria | null {
  const requirements: Record<string, ComponentAria> = {
    'Button': ButtonAriaRequirements,
    'Input': InputAriaRequirements,
    'Card': CardAriaRequirements,
    'Navigation': NavigationAriaRequirements,
    'MainContent': MainContentAriaRequirements,
    'Form': FormAriaRequirements,
    'VoiceWidget': VoiceWidgetAriaRequirements,
    'Toast': ToastAriaRequirements,
    'Modal': ModalAriaRequirements,
    'Loading': LoadingAriaRequirements,
    'Search': SearchAriaRequirements,
  }
  
  return requirements[componentName] || null
}

/**
 * Helper function to validate ARIA compliance
 */
export function validateAriaCompliance(
  componentName: string,
  props: Record<string, any>
): { isCompliant: boolean; violations: string[] } {
  const requirements = getAriaRequirements(componentName)
  if (!requirements) {
    return { isCompliant: true, violations: [] }
  }
  
  const violations: string[] = []
  
  // Check required attributes
  if (requirements.requiredAttributes) {
    for (const attr of requirements.requiredAttributes) {
      if (!(attr in props)) {
        violations.push(`Missing required ARIA attribute: ${attr}`)
      }
    }
  }
  
  // Check focus requirements
  if (requirements.focusable && !props.tabIndex && props.tabIndex !== 0) {
    // Check if element is naturally focusable or has tabIndex
    const naturallyFocusable = ['button', 'input', 'select', 'textarea', 'a'].includes(
      props.as || componentName.toLowerCase()
    )
    if (!naturallyFocusable) {
      violations.push('Focusable element missing tabIndex')
    }
  }
  
  // Check label requirements
  if (requirements.hasVisibleLabel && !props['aria-label'] && !props['aria-labelledby']) {
    violations.push('Element missing accessible label (aria-label or aria-labelledby)')
  }
  
  return {
    isCompliant: violations.length === 0,
    violations,
  }
}