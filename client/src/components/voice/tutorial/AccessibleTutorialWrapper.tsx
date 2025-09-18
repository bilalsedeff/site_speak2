/**
 * AccessibleTutorialWrapper - WCAG 2.1 AA compliant tutorial system wrapper
 *
 * Features:
 * - Screen reader compatibility
 * - Keyboard navigation support
 * - High contrast mode support
 * - Reduced motion respect
 * - Focus management
 * - Semantic HTML structure
 * - ARIA labels and descriptions
 */

import { ReactNode, useEffect, useRef, useState, useCallback } from 'react'
import { useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AccessibilitySettings {
  enableScreenReader: boolean
  enableKeyboardNav: boolean
  enableHighContrast: boolean
  enableReducedMotion: boolean
  enableAudioDescriptions: boolean
  fontSize: 'small' | 'medium' | 'large' | 'extra-large'
  focusVisible: boolean
}

interface AccessibleTutorialWrapperProps {
  children: ReactNode
  currentStep?: string
  totalSteps?: number
  isListening?: boolean
  className?: string
  accessibilitySettings?: Partial<AccessibilitySettings>
  onAccessibilityChange?: (settings: AccessibilitySettings) => void
}

// Default accessibility settings
const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  enableScreenReader: true,
  enableKeyboardNav: true,
  enableHighContrast: false,
  enableReducedMotion: false,
  enableAudioDescriptions: true,
  fontSize: 'medium',
  focusVisible: true
}

export function AccessibleTutorialWrapper({
  children,
  currentStep,
  totalSteps,
  isListening = false,
  className,
  accessibilitySettings = {},
  onAccessibilityChange
}: AccessibleTutorialWrapperProps) {
  const [settings, setSettings] = useState<AccessibilitySettings>({
    ...DEFAULT_ACCESSIBILITY_SETTINGS,
    ...accessibilitySettings
  })
  const [announcements, setAnnouncements] = useState<string[]>([])
  void announcements // Intentionally unused - for future enhancement
  const [focusedElement, setFocusedElement] = useState<HTMLElement | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const ariaLiveRef = useRef<HTMLDivElement>(null)
  const skipLinkRef = useRef<HTMLAnchorElement>(null)

  // Respect user's motion preferences
  const shouldReduceMotion = useReducedMotion()
  const effectiveReducedMotion = shouldReduceMotion || settings.enableReducedMotion

  // Handle accessibility settings changes
  const updateSettings = useCallback((newSettings: Partial<AccessibilitySettings>) => {
    const updatedSettings = { ...settings, ...newSettings }
    setSettings(updatedSettings)
    onAccessibilityChange?.(updatedSettings)
  }, [settings, onAccessibilityChange])

  // Screen reader announcements
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (!settings.enableScreenReader) {return}

    setAnnouncements(prev => [...prev, message])

    // Update aria-live region
    if (ariaLiveRef.current) {
      ariaLiveRef.current.setAttribute('aria-live', priority)
      ariaLiveRef.current.textContent = message

      // Clear after announcement
      setTimeout(() => {
        if (ariaLiveRef.current) {
          ariaLiveRef.current.textContent = ''
        }
      }, 1000)
    }
  }, [settings.enableScreenReader])

  // Keyboard navigation
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!settings.enableKeyboardNav) {return}

    switch (event.key) {
      case 'Escape':
        // Find and focus close button or exit tutorial
        { const closeButton = document.querySelector('[aria-label*="close"], [aria-label*="exit"]') as HTMLElement
        closeButton?.focus()
        break }

      case 'F6':
        // Cycle through main regions
        event.preventDefault()
        cycleFocusRegions()
        break

      case '?':
        // Show help with Shift+?
        if (event.shiftKey) {
          event.preventDefault()
          showKeyboardHelp()
        }
        break

      case 'Tab':
        // Enhanced tab navigation
        if (event.shiftKey) {
          handleShiftTab(event)
        } else {
          handleTab(event)
        }
        break
    }
  }, [settings.enableKeyboardNav])

  // Focus management
  const cycleFocusRegions = useCallback(() => {
    const regions = [
      '[role="main"]',
      '[role="navigation"]',
      '[role="complementary"]',
      '.tutorial-content',
      '.tutorial-controls'
    ]

    const elements = regions
      .map(selector => document.querySelector(selector) as HTMLElement)
      .filter(Boolean)

    if (elements.length === 0) {return}

    const currentIndex = elements.findIndex(el => el.contains(document.activeElement))
    const nextIndex = (currentIndex + 1) % elements.length
    const nextElement = elements[nextIndex]?.querySelector('[tabindex="0"], button, input, a') as HTMLElement

    nextElement?.focus()
  }, [])

  const handleTab = useCallback((event: KeyboardEvent) => {
    // Custom tab handling for better tutorial flow
    const tutorialElements = Array.from(
      document.querySelectorAll('[data-tutorial-focusable="true"]')
    ) as HTMLElement[]

    if (tutorialElements.length === 0) {return}

    const currentIndex = tutorialElements.findIndex(el => el === document.activeElement)
    const isLastElement = currentIndex === tutorialElements.length - 1

    if (isLastElement) {
      // Wrap to first element
      event.preventDefault()
      tutorialElements[0]?.focus()
    }
  }, [])

  const handleShiftTab = useCallback((event: KeyboardEvent) => {
    const tutorialElements = Array.from(
      document.querySelectorAll('[data-tutorial-focusable="true"]')
    ) as HTMLElement[]

    if (tutorialElements.length === 0) {return}

    const currentIndex = tutorialElements.findIndex(el => el === document.activeElement)
    const isFirstElement = currentIndex === 0 || currentIndex === -1

    if (isFirstElement) {
      // Wrap to last element
      event.preventDefault()
      tutorialElements[tutorialElements.length - 1]?.focus()
    }
  }, [])

  const showKeyboardHelp = useCallback(() => {
    const helpText = `
      Keyboard shortcuts for voice tutorial:
      - Tab: Navigate forward through interactive elements
      - Shift+Tab: Navigate backward
      - Escape: Close modal or exit current step
      - F6: Cycle through main page regions
      - Space: Activate buttons or start/stop voice commands
      - Enter: Confirm actions
      - Arrow keys: Navigate through options or steps
      - Shift+?: Show this help
    `
    announce(helpText, 'assertive')
  }, [announce])

  // Update announcements for tutorial state changes
  useEffect(() => {
    if (currentStep && totalSteps) {
      announce(`Tutorial step ${currentStep} of ${totalSteps}`)
    }
  }, [currentStep, totalSteps, announce])

  useEffect(() => {
    if (isListening) {
      announce('Voice recognition is active. Speak your command now.', 'assertive')
    } else {
      announce('Voice recognition stopped. You can activate it again or use keyboard navigation.')
    }
  }, [isListening, announce])

  // Set up keyboard event listeners
  useEffect(() => {
    if (settings.enableKeyboardNav) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
    return undefined
  }, [handleKeyDown, settings.enableKeyboardNav])

  // Set up focus visible management
  useEffect(() => {
    if (!settings.focusVisible) {return}

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      if (target) {
        setFocusedElement(target)
        target.setAttribute('data-focus-visible', 'true')
      }
    }

    const handleFocusOut = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      if (target) {
        target.removeAttribute('data-focus-visible')
      }
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [settings.focusVisible])

  // Apply high contrast mode
  useEffect(() => {
    if (settings.enableHighContrast) {
      document.documentElement.setAttribute('data-high-contrast', 'true')
    } else {
      document.documentElement.removeAttribute('data-high-contrast')
    }
  }, [settings.enableHighContrast])

  // Apply font size
  useEffect(() => {
    document.documentElement.setAttribute('data-font-size', settings.fontSize)
  }, [settings.fontSize])

  return (
    <>
      {/* Skip Link */}
      <a
        ref={skipLinkRef}
        href="#tutorial-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded"
        data-tutorial-focusable="true"
      >
        Skip to main tutorial content
      </a>

      {/* Accessibility Controls */}
      <div
        className="sr-only"
        role="region"
        aria-label="Accessibility Controls"
      >
        <button
          onClick={() => updateSettings({ enableHighContrast: !settings.enableHighContrast })}
          aria-pressed={settings.enableHighContrast}
          data-tutorial-focusable="true"
        >
          {settings.enableHighContrast ? 'Disable' : 'Enable'} high contrast mode
        </button>

        <button
          onClick={() => updateSettings({ enableReducedMotion: !settings.enableReducedMotion })}
          aria-pressed={settings.enableReducedMotion}
          data-tutorial-focusable="true"
        >
          {settings.enableReducedMotion ? 'Enable' : 'Disable'} animations
        </button>

        <button
          onClick={() => updateSettings({ enableAudioDescriptions: !settings.enableAudioDescriptions })}
          aria-pressed={settings.enableAudioDescriptions}
          data-tutorial-focusable="true"
        >
          {settings.enableAudioDescriptions ? 'Disable' : 'Enable'} audio descriptions
        </button>

        <fieldset>
          <legend>Font Size</legend>
          {(['small', 'medium', 'large', 'extra-large'] as const).map(size => (
            <label key={size}>
              <input
                type="radio"
                name="fontSize"
                value={size}
                checked={settings.fontSize === size}
                onChange={() => updateSettings({ fontSize: size })}
                data-tutorial-focusable="true"
              />
              {size.charAt(0).toUpperCase() + size.slice(1).replace('-', ' ')}
            </label>
          ))}
        </fieldset>
      </div>

      {/* Main Tutorial Wrapper */}
      <div
        ref={wrapperRef}
        className={cn(
          'tutorial-wrapper',
          settings.enableHighContrast && 'high-contrast',
          effectiveReducedMotion && 'reduced-motion',
          className
        )}
        role="application"
        aria-label="Voice-guided tutorial"
        aria-describedby="tutorial-description"
      >
        {/* Tutorial Description for Screen Readers */}
        <div id="tutorial-description" className="sr-only">
          Interactive voice-guided tutorial. You can use voice commands or keyboard navigation.
          Press Shift+? for keyboard shortcuts. Current step: {currentStep} of {totalSteps}.
          Voice recognition is {isListening ? 'active' : 'inactive'}.
        </div>

        {/* Voice Status Indicator */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {isListening ? 'Listening for voice commands' : 'Voice recognition inactive'}
        </div>

        {/* Main Content */}
        <main
          id="tutorial-main-content"
          role="main"
          className="tutorial-content"
          aria-labelledby="tutorial-title"
        >
          {children}
        </main>

        {/* ARIA Live Region for Announcements */}
        <div
          ref={ariaLiveRef}
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        />

        {/* Keyboard Help */}
        <div
          role="complementary"
          aria-labelledby="keyboard-help-title"
          className="sr-only focus-within:not-sr-only"
        >
          <h3 id="keyboard-help-title">Keyboard Navigation Help</h3>
          <ul>
            <li>Tab: Move to next interactive element</li>
            <li>Shift+Tab: Move to previous interactive element</li>
            <li>Escape: Close current dialog or return to previous step</li>
            <li>Space: Activate voice commands or buttons</li>
            <li>Enter: Confirm actions</li>
            <li>F6: Move between page regions</li>
            <li>Shift+?: Show this help</li>
          </ul>
        </div>

        {/* Focus Indicator for Screen Readers */}
        {focusedElement && (
          <div
            role="status"
            aria-live="polite"
            className="sr-only"
          >
            Currently focused: {
              focusedElement.getAttribute('aria-label') ||
              focusedElement.textContent?.trim().substring(0, 50) ||
              focusedElement.tagName.toLowerCase()
            }
          </div>
        )}
      </div>

      {/* Global Accessibility Styles */}
      <style>{`
        /* High Contrast Mode */
        [data-high-contrast="true"] {
          --background: #000000;
          --foreground: #ffffff;
          --primary: #ffff00;
          --primary-foreground: #000000;
          --secondary: #00ffff;
          --secondary-foreground: #000000;
          --muted: #333333;
          --muted-foreground: #cccccc;
          --border: #ffffff;
        }

        [data-high-contrast="true"] * {
          border-color: var(--border) !important;
          background-color: var(--background) !important;
          color: var(--foreground) !important;
        }

        [data-high-contrast="true"] button,
        [data-high-contrast="true"] [role="button"] {
          background-color: var(--primary) !important;
          color: var(--primary-foreground) !important;
          border: 2px solid var(--primary) !important;
        }

        [data-high-contrast="true"] button:focus,
        [data-high-contrast="true"] [role="button"]:focus {
          outline: 3px solid var(--secondary) !important;
          outline-offset: 2px !important;
        }

        /* Font Size Scaling */
        [data-font-size="small"] {
          font-size: 14px;
        }

        [data-font-size="medium"] {
          font-size: 16px;
        }

        [data-font-size="large"] {
          font-size: 18px;
        }

        [data-font-size="extra-large"] {
          font-size: 22px;
        }

        /* Reduced Motion */
        .reduced-motion *,
        .reduced-motion *::before,
        .reduced-motion *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }

        /* Focus Visible Enhancement */
        [data-focus-visible="true"] {
          outline: 2px solid var(--primary) !important;
          outline-offset: 2px !important;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2) !important;
        }

        /* Screen Reader Only Content */
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .sr-only.focus:not(.sr-only),
        .sr-only:focus:not(.sr-only) {
          position: static;
          width: auto;
          height: auto;
          padding: inherit;
          margin: inherit;
          overflow: visible;
          clip: auto;
          white-space: inherit;
        }

        /* Ensure proper focus indicators */
        button:focus-visible,
        [role="button"]:focus-visible,
        input:focus-visible,
        select:focus-visible,
        textarea:focus-visible,
        a:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }

        /* High contrast focus indicators */
        [data-high-contrast="true"] *:focus-visible {
          outline: 3px solid var(--secondary) !important;
          outline-offset: 2px !important;
        }

        /* Ensure sufficient color contrast */
        [data-high-contrast="true"] .tutorial-wrapper {
          background: #000000 !important;
          color: #ffffff !important;
        }

        /* Motion preferences */
        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }

        /* Prefers high contrast */
        @media (prefers-contrast: high) {
          :root {
            --border: #ffffff;
          }
        }

        /* Custom properties for tutorial elements */
        .tutorial-wrapper {
          --focus-ring-color: var(--primary);
          --focus-ring-width: 2px;
          --focus-ring-offset: 2px;
        }

        /* Enhanced keyboard navigation indicators */
        [data-tutorial-focusable="true"]:focus {
          outline: var(--focus-ring-width) solid var(--focus-ring-color);
          outline-offset: var(--focus-ring-offset);
        }
      `}</style>
    </>
  )
}

// Accessibility utility hooks
export function useAccessibilityAnnouncements() {
  const [announcements, setAnnouncements] = useState<string[]>([])

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    setAnnouncements(prev => [...prev, message])

    // Create temporary live region if none exists
    let liveRegion = document.querySelector('[aria-live]') as HTMLElement
    if (!liveRegion) {
      liveRegion = document.createElement('div')
      liveRegion.setAttribute('aria-live', priority)
      liveRegion.setAttribute('aria-atomic', 'true')
      liveRegion.className = 'sr-only'
      document.body.appendChild(liveRegion)
    }

    liveRegion.textContent = message

    // Clear after announcement
    setTimeout(() => {
      if (liveRegion && liveRegion.textContent === message) {
        liveRegion.textContent = ''
      }
    }, 1000)
  }, [])

  return { announcements, announce }
}

// Focus management hook
export function useFocusManagement() {
  const [focusedElement, setFocusedElement] = useState<HTMLElement | null>(null)

  const trapFocus = useCallback((container: HTMLElement) => {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault()
            lastElement?.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault()
            firstElement?.focus()
          }
        }
      }
    }

    container.addEventListener('keydown', handleTabKey)
    firstElement?.focus()

    return () => {
      container.removeEventListener('keydown', handleTabKey)
    }
  }, [])

  const moveFocus = useCallback((direction: 'next' | 'previous') => {
    const focusableElements = Array.from(
      document.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ) as HTMLElement[]

    const currentIndex = focusableElements.findIndex(el => el === document.activeElement)

    if (direction === 'next') {
      const nextIndex = (currentIndex + 1) % focusableElements.length
      focusableElements[nextIndex]?.focus()
    } else {
      const prevIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1
      focusableElements[prevIndex]?.focus()
    }
  }, [])

  return { focusedElement, setFocusedElement, trapFocus, moveFocus }
}

export default AccessibleTutorialWrapper