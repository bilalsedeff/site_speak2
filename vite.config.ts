import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

export default defineConfig(async () => {
  const plugins = [react(), runtimeErrorOverlay()];

  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
  ) {
    const cartographer = await import('@replit/vite-plugin-cartographer');
    plugins.push(cartographer.cartographer());
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'client', 'src'),
        '@shared': path.resolve(import.meta.dirname, 'shared'),
        '@assets': path.resolve(import.meta.dirname, 'attached_assets'),
        '@sitespeak/design-system': path.resolve(import.meta.dirname, 'packages', 'design-system', 'src'),
        '@sitespeak/site-contract': path.resolve(import.meta.dirname, 'packages', 'site-contract', 'src'),
        '@sitespeak/editor-engine': path.resolve(import.meta.dirname, 'packages', 'editor-engine', 'src'),
        '@sitespeak/voice-widget': path.resolve(import.meta.dirname, 'packages', 'voice-widget', 'src'),
      },
    },
    root: path.resolve(import.meta.dirname, 'client'),
    build: {
      outDir: path.resolve(import.meta.dirname, 'dist/public'),
      emptyOutDir: true,
      target: 'es2022',
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
      chunkSizeWarningLimit: 1000,
    },
    server: {
      port: Number(process.env['VITE_PORT']) || 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: process.env['VITE_API_TARGET'] || 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: process.env['VITE_API_TARGET'] || 'http://localhost:5000',
          ws: true,
          changeOrigin: true,
        },
      },
      fs: {
        strict: true,
        deny: ['**/.*'],
      },
    },
    define: {
      __DEV__: JSON.stringify(process.env['NODE_ENV'] === 'development'),
      __VOICE_ENABLED__: JSON.stringify(process.env['VITE_VOICE_ENABLED'] !== 'false'),
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
  };
});
