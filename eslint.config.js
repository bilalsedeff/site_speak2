import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-plugin-prettier';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      prettier,
    },
    rules: {
      // TypeScript rules
  '@typescript-eslint/no-unused-vars': 'off',
      // Transition phase: start as warn, move to error after cleanup
  '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/ban-ts-comment': 'off',

      // React rules
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react-refresh/only-export-components': 'off',

      // General rules
  'no-console': 'off',
  'prefer-const': 'off',
  'no-var': 'off',
  eqeqeq: 'off',
      curly: ['error', 'all'],
      'no-duplicate-imports': 'error',
      'no-undef': 'off', // TypeScript handles this
      'no-unused-vars': 'off',
  'no-useless-escape': 'off', // Allow escapes in regex patterns
  'no-control-regex': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  // Prettier integration
  {
    rules: {
  'prettier/prettier': 'off',
    },
  },
  {
    ignores: [
      'dist/**',
  'server/dist/**',
      'node_modules/**',
      'build/**',
      'client/dist/**',
      'uploads/**',
      'published-sites/**',
      'temp/**',
      'migrations/**',
      'demo-restaurant-site/**',
      'project_definitions/**',
      'scripts/**',
  'codacy-analysis-cli-master/**',
      'todo-highlevel/**',
      'server/services/crawler/**',
      'server/types/**',
      'server/test-db-connection.js',
      '*.config.js',
      '*.config.ts',
      '.eslintrc.js',
    ],
  },
];
