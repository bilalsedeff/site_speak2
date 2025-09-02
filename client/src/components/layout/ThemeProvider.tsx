import * as React from 'react'

type Theme = 'dark' | 'light' | 'system'

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'dark' | 'light'
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined)

/**
 * Theme Provider following UI/UX guidelines:
 * - Provides light/dark by default with system toggle
 * - Respects prefers-color-scheme
 * - Persists user choice
 * - Maintains contrast compliance in both modes
 */
export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'sitespeak-theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = React.useState<'dark' | 'light'>('light')

  // Initialize theme from localStorage
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey) as Theme
      if (stored && ['dark', 'light', 'system'].includes(stored)) {
        setThemeState(stored)
      }
    } catch {
      // Fallback to default if localStorage is not available
    }
  }, [storageKey])

  // Resolve system theme
  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const updateSystemTheme = () => {
      const systemTheme = mediaQuery.matches ? 'dark' : 'light'
      setResolvedTheme(theme === 'system' ? systemTheme : theme as 'dark' | 'light')
    }

    updateSystemTheme()
    mediaQuery.addEventListener('change', updateSystemTheme)
    
    return () => mediaQuery.removeEventListener('change', updateSystemTheme)
  }, [theme])

  // Apply theme to document
  React.useEffect(() => {
    const root = window.document.documentElement
    
    // Remove previous theme classes
    root.classList.remove('light', 'dark')
    
    // Apply current theme
    root.classList.add(resolvedTheme)
    
    // Set color-scheme CSS property for better browser defaults
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const setTheme = React.useCallback((theme: Theme) => {
    try {
      localStorage.setItem(storageKey, theme)
    } catch {
      // Ignore localStorage errors
    }
    setThemeState(theme)
  }, [storageKey])

  const value = React.useMemo(() => ({
    theme,
    setTheme,
    resolvedTheme,
  }), [theme, setTheme, resolvedTheme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeContext)
  
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  
  return context
}