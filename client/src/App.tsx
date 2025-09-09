import { Router, Route, Switch, useLocation } from 'wouter'
import { Suspense, lazy, useEffect } from 'react'
import { Toaster } from 'sonner'

import { Navbar } from '@/components/layout/Navbar'
import { SimpleTalkButton } from '@/components/voice/SimpleTalkButton'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { speculationRules } from '@/lib/speculation-rules'

// Lazy load pages for better performance
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Editor = lazy(() => import('@/pages/Editor').then(m => ({ default: m.Editor })))
const Templates = lazy(() => import('@/pages/Templates').then(m => ({ default: m.Templates })))
const Analytics = lazy(() => import('@/pages/Analytics').then(m => ({ default: m.Analytics })))
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })))
const Login = lazy(() => import('@/pages/Login').then(m => ({ default: m.Login })))

function App() {
  return (
    <div className="min-h-screen bg-background font-sans antialiased">
      <Router>
        <AppContent />
      </Router>
    </div>
  )
}

function AppContent() {
  const [location] = useLocation()

  // Auto-configure Speculation Rules based on current route
  useEffect(() => {
    speculationRules.autoConfigureRules(location)
  }, [location])

  return (
    <>
      <div className="flex min-h-screen">
        {/* Navigation */}
        <Navbar />
        
        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <Suspense fallback={<LoadingSpinner />}>
            <Switch>
              <Route path="/login" component={Login} />
              <Route path="/" component={Dashboard} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/editor/:siteId?" component={Editor} />
              <Route path="/templates" component={Templates} />
              <Route path="/analytics/:siteId?" component={Analytics} />
              <Route path="/settings" component={Settings} />
              
              {/* 404 Route */}
              <Route>
                {() => (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <h1 className="text-4xl font-bold text-muted-foreground mb-2">404</h1>
                      <p className="text-muted-foreground">Page not found</p>
                    </div>
                  </div>
                )}
              </Route>
            </Switch>
          </Suspense>
        </main>
      </div>
      
      {/* Global Voice Assistant - Simple Talk Button */}
      <SimpleTalkButton />
      
      {/* Global Toast Notifications */}
      <Toaster 
        position="bottom-right"
        theme="system"
        richColors
        closeButton
        duration={4000}
      />
    </>
  )
}

export default App