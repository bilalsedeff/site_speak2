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
      },
    },
    root: path.resolve(import.meta.dirname, 'client'),
    build: {
      outDir: path.resolve(import.meta.dirname, 'dist/public'),
      emptyOutDir: true,
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
  };
});
