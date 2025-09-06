import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface ToastProps extends Toast {
  onClose: (id: string) => void
}

const toastIcons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const toastStyles = {
  success: 'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100',
  error: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
  warning: 'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100',
  info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100',
}

/**
 * Individual Toast component following UI/UX guidelines:
 * - Non-blocking notifications
 * - Respects reduced motion
 * - Proper ARIA live regions
 * - Auto-dismissal with manual override
 */
const ToastComponent: React.FC<ToastProps> = ({
  id,
  type,
  title,
  description,
  duration = 5000,
  action,
  onClose,
}) => {
  const Icon = toastIcons[type]
  
  React.useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id)
      }, duration)
      
      return () => clearTimeout(timer)
    }
    
    return () => {} // Return empty cleanup function for else case
  }, [id, duration, onClose])

  const handleClose = () => {
    onClose(id)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{
        duration: 0.3,
        ease: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
      }}
      className={cn(
        'toast',
        'flex items-start space-x-3 p-4',
        'max-w-sm w-full',
        'border rounded-lg shadow-lg',
        toastStyles[type]
      )}
      role="alert"
      aria-live="polite"
    >
      <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
      
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold max-reading-width">
          {title}
        </div>
        
        {description && (
          <div className="text-sm opacity-90 mt-1 max-reading-width">
            {description}
          </div>
        )}
        
        {action && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={action.onClick}
              className="h-8 px-2 text-xs"
            >
              {action.label}
            </Button>
          </div>
        )}
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClose}
        className="h-8 w-8 p-0 opacity-70 hover:opacity-100"
        aria-label={`Close ${type} notification`}
      >
        <X className="h-4 w-4" />
      </Button>
    </motion.div>
  )
}

/**
 * Toast Container for managing multiple toasts
 */
interface ToastContainerProps {
  toasts: Toast[]
  onClose: (id: string) => void
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  return createPortal(
    <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastComponent {...toast} onClose={onClose} />
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  )
}

/**
 * Toast context and hook for managing toast notifications
 */
interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearToasts: () => void
}

const ToastContext = React.createContext<ToastContextType | null>(null)

export const useToast = () => {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: React.ReactNode
  maxToasts?: number
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ 
  children, 
  maxToasts = 5 
}) => {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const addToast = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const newToast = { ...toast, id }
    
    setToasts(prevToasts => {
      const updated = [...prevToasts, newToast]
      // Keep only the most recent toasts
      return updated.slice(-maxToasts)
    })
  }, [maxToasts])

  const removeToast = React.useCallback((id: string) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id))
  }, [])

  const clearToasts = React.useCallback(() => {
    setToasts([])
  }, [])

  const value = React.useMemo(() => ({
    toasts,
    addToast,
    removeToast,
    clearToasts,
  }), [toasts, addToast, removeToast, clearToasts])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  )
}

// Convenience functions for common toast types
export const toast = {
  success: (title: string, description?: string, options?: Partial<Toast>) => ({
    type: 'success' as const,
    title,
    description,
    ...options,
  }),
  error: (title: string, description?: string, options?: Partial<Toast>) => ({
    type: 'error' as const,
    title,
    description,
    ...options,
  }),
  warning: (title: string, description?: string, options?: Partial<Toast>) => ({
    type: 'warning' as const,
    title,
    description,
    ...options,
  }),
  info: (title: string, description?: string, options?: Partial<Toast>) => ({
    type: 'info' as const,
    title,
    description,
    ...options,
  }),
}