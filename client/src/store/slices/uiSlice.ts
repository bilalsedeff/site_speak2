import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface UIState {
  // Modals
  modals: {
    createSite: boolean
    settings: boolean
    help: boolean
    shortcuts: boolean
    templates: boolean
    publish: boolean
    analytics: boolean
  }
  
  // Sidebars and panels
  sidebar: {
    isOpen: boolean
    activeTab: 'sites' | 'templates' | 'analytics'
  }
  
  // Notifications
  notifications: Array<{
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    title: string
    message?: string
    duration?: number
    action?: {
      label: string
      onClick: () => void
    }
  }>
  
  // Loading states
  loading: {
    global: boolean
    publishing: boolean
    saving: boolean
  }
  
  // Layout
  layout: {
    headerHeight: number
    footerHeight: number
    sidebarWidth: number
    isFullscreen: boolean
  }
  
  // Preferences
  preferences: {
    theme: 'light' | 'dark' | 'system'
    language: string
    autoSave: boolean
    autoSaveInterval: number // in seconds
    showWelcome: boolean
    showTips: boolean
    compactMode: boolean
  }
  
  // Tutorial/onboarding
  onboarding: {
    isActive: boolean
    currentStep: number
    completedSteps: number[]
    skipped: boolean
  }
  
  // Search
  search: {
    isOpen: boolean
    query: string
    results: any[]
    isSearching: boolean
  }
  
  // Command palette
  commandPalette: {
    isOpen: boolean
    query: string
  }
}

const initialState: UIState = {
  modals: {
    createSite: false,
    settings: false,
    help: false,
    shortcuts: false,
    templates: false,
    publish: false,
    analytics: false,
  },
  
  sidebar: {
    isOpen: true,
    activeTab: 'sites',
  },
  
  notifications: [],
  
  loading: {
    global: false,
    publishing: false,
    saving: false,
  },
  
  layout: {
    headerHeight: 60,
    footerHeight: 0,
    sidebarWidth: 280,
    isFullscreen: false,
  },
  
  preferences: {
    theme: 'system',
    language: 'en',
    autoSave: true,
    autoSaveInterval: 30,
    showWelcome: true,
    showTips: true,
    compactMode: false,
  },
  
  onboarding: {
    isActive: false,
    currentStep: 0,
    completedSteps: [],
    skipped: false,
  },
  
  search: {
    isOpen: false,
    query: '',
    results: [],
    isSearching: false,
  },
  
  commandPalette: {
    isOpen: false,
    query: '',
  },
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Modal management
    openModal: (state, action: PayloadAction<keyof UIState['modals']>) => {
      state.modals[action.payload] = true
    },
    
    closeModal: (state, action: PayloadAction<keyof UIState['modals']>) => {
      state.modals[action.payload] = false
    },
    
    closeAllModals: (state) => {
      Object.keys(state.modals).forEach(modal => {
        state.modals[modal as keyof UIState['modals']] = false
      })
    },
    
    // Sidebar
    toggleSidebar: (state) => {
      state.sidebar.isOpen = !state.sidebar.isOpen
    },
    
    setSidebarTab: (state, action: PayloadAction<UIState['sidebar']['activeTab']>) => {
      state.sidebar.activeTab = action.payload
      state.sidebar.isOpen = true
    },
    
    // Notifications
    addNotification: (state, action: PayloadAction<Omit<UIState['notifications'][0], 'id'>>) => {
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 11)
      state.notifications.push({
        id,
        duration: 5000, // Default 5 seconds
        ...action.payload,
      })
    },
    
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload)
    },
    
    clearNotifications: (state) => {
      state.notifications = []
    },
    
    // Loading states
    setGlobalLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.global = action.payload
    },
    
    setPublishingLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.publishing = action.payload
    },
    
    setSavingLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.saving = action.payload
    },
    
    // Layout
    setHeaderHeight: (state, action: PayloadAction<number>) => {
      state.layout.headerHeight = action.payload
    },
    
    setSidebarWidth: (state, action: PayloadAction<number>) => {
      state.layout.sidebarWidth = Math.max(200, Math.min(400, action.payload))
    },
    
    toggleFullscreen: (state) => {
      state.layout.isFullscreen = !state.layout.isFullscreen
    },
    
    // Preferences
    setTheme: (state, action: PayloadAction<UIState['preferences']['theme']>) => {
      state.preferences.theme = action.payload
    },
    
    setLanguage: (state, action: PayloadAction<string>) => {
      state.preferences.language = action.payload
    },
    
    toggleAutoSave: (state) => {
      state.preferences.autoSave = !state.preferences.autoSave
    },
    
    setAutoSaveInterval: (state, action: PayloadAction<number>) => {
      state.preferences.autoSaveInterval = Math.max(5, Math.min(300, action.payload))
    },
    
    setShowWelcome: (state, action: PayloadAction<boolean>) => {
      state.preferences.showWelcome = action.payload
    },
    
    setShowTips: (state, action: PayloadAction<boolean>) => {
      state.preferences.showTips = action.payload
    },
    
    toggleCompactMode: (state) => {
      state.preferences.compactMode = !state.preferences.compactMode
    },
    
    // Onboarding
    startOnboarding: (state) => {
      state.onboarding.isActive = true
      state.onboarding.currentStep = 0
      state.onboarding.skipped = false
    },
    
    nextOnboardingStep: (state) => {
      if (state.onboarding.isActive) {
        state.onboarding.completedSteps.push(state.onboarding.currentStep)
        state.onboarding.currentStep += 1
      }
    },
    
    skipOnboarding: (state) => {
      state.onboarding.isActive = false
      state.onboarding.skipped = true
    },
    
    completeOnboarding: (state) => {
      state.onboarding.isActive = false
      state.onboarding.completedSteps.push(state.onboarding.currentStep)
    },
    
    // Search
    openSearch: (state) => {
      state.search.isOpen = true
    },
    
    closeSearch: (state) => {
      state.search.isOpen = false
      state.search.query = ''
      state.search.results = []
    },
    
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.search.query = action.payload
    },
    
    setSearchResults: (state, action: PayloadAction<any[]>) => {
      state.search.results = action.payload
      state.search.isSearching = false
    },
    
    setSearching: (state, action: PayloadAction<boolean>) => {
      state.search.isSearching = action.payload
    },
    
    // Command palette
    openCommandPalette: (state) => {
      state.commandPalette.isOpen = true
    },
    
    closeCommandPalette: (state) => {
      state.commandPalette.isOpen = false
      state.commandPalette.query = ''
    },
    
    setCommandPaletteQuery: (state, action: PayloadAction<string>) => {
      state.commandPalette.query = action.payload
    },
  },
})

export const {
  openModal,
  closeModal,
  closeAllModals,
  toggleSidebar,
  setSidebarTab,
  addNotification,
  removeNotification,
  clearNotifications,
  setGlobalLoading,
  setPublishingLoading,
  setSavingLoading,
  setHeaderHeight,
  setSidebarWidth,
  toggleFullscreen,
  setTheme,
  setLanguage,
  toggleAutoSave,
  setAutoSaveInterval,
  setShowWelcome,
  setShowTips,
  toggleCompactMode,
  startOnboarding,
  nextOnboardingStep,
  skipOnboarding,
  completeOnboarding,
  openSearch,
  closeSearch,
  setSearchQuery,
  setSearchResults,
  setSearching,
  openCommandPalette,
  closeCommandPalette,
  setCommandPaletteQuery,
} = uiSlice.actions

export default uiSlice.reducer