/**
 * DEPRECATED LEGACY ENTRY POINT
 *
 * ⚠️  WARNING: This entry point is deprecated!
 *
 * Use proper 12-Factor App process separation instead:
 *
 * FOR WEB PROCESS (HTTP/WebSocket):
 *   npm run dev:web
 *
 * FOR WORKER PROCESS (Background jobs):
 *   npm run dev:worker
 *
 * FOR DEVELOPMENT (Both processes):
 *   npm run dev
 *
 * This file will be removed in a future version.
 * Update your scripts to use the proper entry points.
 */

console.log('🚨 DEPRECATION WARNING: server/index.ts is deprecated!');
console.log('📚 Use npm run dev:web for web process');
console.log('⚙️  Use npm run dev:worker for worker process');
console.log('🔄 Use npm run dev for both processes');
console.log('');
console.log('🕐 Starting legacy mode in 3 seconds...');

setTimeout(() => {
  console.log('📁 Loading legacy server entry point...');

  // Import and start the legacy server
  import('./src/index.ts').then((_module) => {
    console.log('✅ Legacy server module loaded');
    console.log('⚠️  Migrate to proper process separation!');
  }).catch((error) => {
    console.error('❌ Failed to load legacy server module:', error);
    process.exit(1);
  });
}, 3000);