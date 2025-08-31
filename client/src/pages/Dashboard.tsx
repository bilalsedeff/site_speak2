import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, BarChart3, Mic, Zap } from 'lucide-react'

import { useAppSelector, useAppDispatch } from '@/store'
import { fetchSites } from '@/store/slices/sitesSlice'
import { openModal } from '@/store/slices/uiSlice'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export function Dashboard() {
  const dispatch = useAppDispatch()
  const { sites, isLoading } = useAppSelector(state => state.sites)
  const { user } = useAppSelector(state => state.auth)

  useEffect(() => {
    dispatch(fetchSites())
  }, [dispatch])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size="lg" text="Loading your sites..." />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold mb-2">
            Welcome back{user?.name ? `, ${user.name}` : ''}!
          </h1>
          <p className="text-muted-foreground">
            Build, manage, and deploy voice-powered websites with ease
          </p>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
        >
          <div className="bg-card rounded-lg p-6 border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Sites</p>
                <p className="text-2xl font-bold">{sites.filter(s => s.status === 'published').length}</p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Zap className="h-6 w-6 text-primary" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg p-6 border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Voice Interactions</p>
                <p className="text-2xl font-bold">0</p>
              </div>
              <div className="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center">
                <Mic className="h-6 w-6 text-secondary" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg p-6 border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Visits</p>
                <p className="text-2xl font-bold">0</p>
              </div>
              <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-accent" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Sites Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Your Sites</h2>
            <Button onClick={() => dispatch(openModal('createSite'))}>
              <Plus className="h-4 w-4 mr-2" />
              New Site
            </Button>
          </div>

          {sites.length === 0 ? (
            <div className="bg-card rounded-lg border border-border p-12 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No sites yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first voice-powered website to get started
              </p>
              <Button onClick={() => dispatch(openModal('createSite'))}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Site
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sites.map((site, index) => (
                <motion.div
                  key={site.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="bg-card rounded-lg border border-border p-6 hover:border-primary/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium truncate">{site.name}</h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      site.status === 'published' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : site.status === 'draft'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                    }`}>
                      {site.status}
                    </span>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {site.description || 'No description'}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Created {new Date(site.createdAt).toLocaleDateString()}</span>
                    <span className="flex items-center">
                      <Mic className="h-3 w-3 mr-1" />
                      Voice Ready
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Getting Started */}
        {sites.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg p-8"
          >
            <h3 className="text-lg font-medium mb-4">Getting Started with SiteSpeak</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-lg font-bold text-primary">1</span>
                </div>
                <h4 className="font-medium mb-2">Create a Site</h4>
                <p className="text-sm text-muted-foreground">
                  Start with a template or build from scratch using our visual editor
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-lg font-bold text-primary">2</span>
                </div>
                <h4 className="font-medium mb-2">Add Voice AI</h4>
                <p className="text-sm text-muted-foreground">
                  Configure your AI assistant to help visitors interact with your site
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-lg font-bold text-primary">3</span>
                </div>
                <h4 className="font-medium mb-2">Publish & Share</h4>
                <p className="text-sm text-muted-foreground">
                  Deploy your site with integrated voice assistance for your users
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}