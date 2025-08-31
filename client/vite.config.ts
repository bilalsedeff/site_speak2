import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },

  server: {
    port: parseInt(process.env.VITE_PORT || '3000'),
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['framer-motion', 'lucide-react'],
          'vendor-state': ['@reduxjs/toolkit', 'react-redux', 'zustand'],
          'vendor-query': ['@tanstack/react-query', 'axios'],
          'vendor-dnd': ['react-dnd', 'react-dnd-html5-backend'],
        },
      },
    },
    // Optimize chunks for performance
    chunkSizeWarningLimit: 1000,
  },

  define: {
    // Define environment variables
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
    __VOICE_ENABLED__: JSON.stringify(process.env.VITE_VOICE_ENABLED !== 'false'),
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'wouter',
      '@reduxjs/toolkit',
      'react-redux',
      'zustand',
      'socket.io-client',
    ],
  },

  css: {
    postcss: './postcss.config.js',
  },
})