import { useState } from 'react'
import { useLocation } from 'wouter'
import { motion } from 'framer-motion'
import { 
  LayoutDashboard, 
  Edit3, 
  Layout, 
  BarChart3, 
  Settings, 
  Plus,
  Menu,
  X,
  Mic
} from 'lucide-react'

import { useAppSelector, useAppDispatch } from '@/store'
import { toggleSidebar, openModal } from '@/store/slices/uiSlice'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const navigationItems = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/',
    shortcut: '⌘1'
  },
  {
    label: 'Editor',
    icon: Edit3,
    path: '/editor',
    shortcut: '⌘2'
  },
  {
    label: 'Templates',
    icon: Layout,
    path: '/templates',
    shortcut: '⌘3'
  },
  {
    label: 'Analytics',
    icon: BarChart3,
    path: '/analytics',
    shortcut: '⌘4'
  },
  {
    label: 'Settings',
    icon: Settings,
    path: '/settings',
    shortcut: '⌘5'
  },
]

export function Navbar() {
  const [location, navigate] = useLocation()
  const dispatch = useAppDispatch()
  const { isOpen: sidebarOpen } = useAppSelector(state => state.ui.sidebar)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleNavigation = (path: string) => {
    navigate(path)
  }

  if (!sidebarOpen) {
    return (
      <div className="fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => dispatch(toggleSidebar())}
          className="bg-background/80 backdrop-blur-sm border-border/50"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <motion.nav
      initial={{ x: -280 }}
      animate={{ x: 0 }}
      exit={{ x: -280 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={cn(
        "flex flex-col h-screen bg-card border-r border-border",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!isCollapsed && (
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Mic className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">SiteSpeak</span>
          </div>
        )}
        
        <div className="flex items-center space-x-1">
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          
          {isCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(false)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>


      {/* Navigation Items */}
      <div className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {navigationItems.map((item) => {
            const isActive = location === item.path || 
              (item.path !== '/' && location.startsWith(item.path))
            
            return (
              <Button
                key={item.path}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                onClick={() => handleNavigation(item.path)}
                className={cn(
                  "w-full justify-start relative",
                  isCollapsed && "justify-center px-2"
                )}
                title={isCollapsed ? `${item.label} (${item.shortcut})` : undefined}
              >
                <item.icon className={cn("h-4 w-4", !isCollapsed && "mr-3")} />
                {!isCollapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    <kbd className="text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded">
                      {item.shortcut}
                    </kbd>
                  </>
                )}
                
                {isActive && (
                  <motion.div
                    layoutId="navbar-indicator"
                    className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full"
                    initial={false}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  />
                )}
              </Button>
            )
          })}
        </nav>
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-t border-border space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => dispatch(openModal('createSite'))}
          className={cn(
            "w-full justify-start",
            isCollapsed && "justify-center px-2"
          )}
        >
          <Plus className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
          {!isCollapsed && 'New Site'}
        </Button>
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-border">
        <div className={cn(
          "flex items-center space-x-3",
          isCollapsed && "justify-center"
        )}>
          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
            <span className="text-sm font-medium">U</span>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">User</p>
              <p className="text-xs text-muted-foreground truncate">user@sitespeak.com</p>
            </div>
          )}
        </div>
      </div>
    </motion.nav>
  )
}