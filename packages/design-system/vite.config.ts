import { defineConfig } from 'vite';
import path from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'designSystem',
      fileName: (format) => `index.${format}.js`,
      formats: ['es', 'cjs']
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['react', 'react-dom', 'framer-motion'],
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && /use client/.test(warning.message)) {return;}
        defaultHandler(warning);
      },
      output: {
        globals: { 
          react: 'React', 
          'react-dom': 'ReactDOM',
          'framer-motion': 'FramerMotion'
        }
      }
    }
  },
  plugins: [dts({ insertTypesEntry: true })]
});