import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'

import App from './App.tsx'
import { store } from './store/index.ts'
import { VoiceProvider } from './providers/VoiceProvider.tsx'
import { ThemeProvider } from './providers/ThemeProvider.tsx'

import './styles/globals.css'

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors
        if (error?.status >= 400 && error?.status < 500) {
          return false
        }
        return failureCount < 2
      },
    },
    mutations: {
      retry: 1,
    },
  },
})

// Enable React Query DevTools in development
if (import.meta.env.DEV) {
  import('@tanstack/react-query-devtools').then(({ ReactQueryDevtools }) => {
    // DevTools will be added dynamically
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="system" storageKey="sitespeak-theme">
          <DndProvider backend={HTML5Backend}>
            <VoiceProvider>
              <App />
            </VoiceProvider>
          </DndProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>,
)