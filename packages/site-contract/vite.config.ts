import { defineConfig } from 'vite';
import path from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'siteContract',
      fileName: (format) => `index.${format}.js`,
      formats: ['es', 'cjs']
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      external: [
        'fast-xml-parser', 
        'jsdom',
        'zod'
      ],
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && /use client/.test(warning.message)) {return;}
        defaultHandler(warning);
      },
      output: {
        globals: { 
          'fast-xml-parser': 'FastXMLParser',
          'jsdom': 'JSDOM',
          'zod': 'Zod'
        }
      }
    }
  },
  resolve: {
    alias: {
      '@sitespeak/design-system': path.resolve(__dirname, '../design-system/src')
    }
  },
  plugins: [dts({ insertTypesEntry: true })]
});