import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, Eye, EyeOff } from 'lucide-react'

import { useAppDispatch, useAppSelector } from '@/store'
import { login } from '@/store/slices/authSlice'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export function Login() {
  const dispatch = useAppDispatch()
  const { isLoading, error } = useAppSelector(state => state.auth)
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.email || !formData.password) {
      return
    }

    dispatch(login({
      email: formData.email,
      password: formData.password
    }))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-card rounded-2xl shadow-xl border border-border p-8">
          {/* Logo and Header */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4"
            >
              <Mic className="h-8 w-8 text-primary-foreground" />
            </motion.div>
            <h1 className="text-2xl font-bold mb-2">Welcome to SiteSpeak</h1>
            <p className="text-muted-foreground">
              Sign in to build voice-powered websites
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-3 py-2 pr-10 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-destructive/10 border border-destructive/20 rounded-md p-3"
              >
                <p className="text-sm text-destructive">{error}</p>
              </motion.div>
            )}

            <Button
              type="submit"
              disabled={isLoading || !formData.email || !formData.password}
              className="w-full h-11"
            >
              {isLoading ? (
                <LoadingSpinner size="sm" />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Demo Login */}
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-center text-sm text-muted-foreground mb-4">
              Demo Account
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setFormData({
                  email: 'demo@sitespeak.com',
                  password: 'demo123456'
                })
              }}
              className="w-full"
            >
              Use Demo Account
            </Button>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Don't have an account?{' '}
              <button className="text-primary hover:underline">
                Sign up
              </button>
            </p>
          </div>
        </div>

        {/* Features Preview */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-8 text-center"
        >
          <p className="text-sm text-muted-foreground mb-4">
            What makes SiteSpeak special?
          </p>
          <div className="flex justify-center space-x-6 text-xs">
            <div className="flex items-center text-muted-foreground">
              <Mic className="h-3 w-3 mr-1" />
              Voice AI
            </div>
            <div className="flex items-center text-muted-foreground">
              <span className="w-3 h-3 bg-primary/20 rounded-full mr-1" />
              No Code
            </div>
            <div className="flex items-center text-muted-foreground">
              <span className="w-3 h-3 bg-secondary/20 rounded-full mr-1" />
              Fast Deploy
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}