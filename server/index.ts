/**
 * Simple entry point for development that points to the main server
 */
console.log('📁 Loading server/index.ts...');

// Import and start the server
import('./src/index.ts').then((module) => {
  console.log('✅ Server module loaded, starting...');
  // The server will start automatically when imported
}).catch((error) => {
  console.error('❌ Failed to load server module:', error);
  process.exit(1);
});