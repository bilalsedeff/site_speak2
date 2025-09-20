import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/embed.ts'),
      name: 'SiteSpeakEmbed',
      formats: ['es', 'umd'],
      fileName: (format) => `embed.${format === 'es' ? 'es.js' : 'js'}`,
    },
    rollupOptions: {
      // Bundle everything for standalone embed script
      external: [],
      output: {
        // For UMD build, ensure global name
        name: 'SiteSpeakEmbed',
        globals: {},
        // Inline all dependencies for standalone script
        inlineDynamicImports: true,
        // Generate minimized standalone script
        compact: true,
      },
    },
    // Minify for production embed
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: {
        reserved: ['initSiteSpeak', 'SiteSpeak'],
      },
    },
    // No sourcemap for embed (keep size minimal)
    sourcemap: false,
    // Target browsers that support modern voice APIs
    target: ['es2020', 'chrome80', 'firefox78', 'safari14'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // Optimize for embed script size
  esbuild: {
    treeShaking: true,
    legalComments: 'none',
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env['npm_package_version'] || '1.0.0'),
    // Ensure production mode for embed
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})