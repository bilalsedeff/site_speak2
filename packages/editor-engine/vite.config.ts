import { defineConfig } from 'vite';
import path from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'editorEngine',
      fileName: (format) => `index.${format}.js`,
      formats: ['es', 'cjs']
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      external: [
        'react', 
        'react-dom', 
        'react-dnd', 
        'react-dnd-html5-backend',
        '@dnd-kit/core',
        '@dnd-kit/sortable',
        '@dnd-kit/utilities',
        'zustand',
        'immer'
      ],
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && /use client/.test(warning.message)) {return;}
        defaultHandler(warning);
      },
      output: {
        globals: { 
          react: 'React', 
          'react-dom': 'ReactDOM',
          'react-dnd': 'ReactDnD',
          'react-dnd-html5-backend': 'ReactDnDHTML5Backend',
          'zustand': 'Zustand'
        }
      }
    }
  },
  resolve: {
    alias: {
      '@sitespeak/design-system': path.resolve(__dirname, '../design-system/src'),
      '@sitespeak/site-contract': path.resolve(__dirname, '../site-contract/src')
    }
  },
  plugins: [dts({ insertTypesEntry: true })]
});