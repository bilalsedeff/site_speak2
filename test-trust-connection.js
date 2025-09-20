// Test connection with trust authentication (no password)
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

console.log('🔍 Testing database connection with trust authentication...');

// Connect without password for trust auth
const connectionUrl = 'postgresql://postgres@127.0.0.1:5433/sitespeak_dev_db';
console.log('Connection URL:', connectionUrl);

const client = postgres(connectionUrl, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: false,
  ssl: false,
  transform: {
    undefined: null
  }
});

try {
  console.log('⏳ Attempting to connect...');
  const result = await client`SELECT current_database(), current_user, version()`;
  console.log('✅ CONNECTION SUCCESSFUL!');
  console.log('📊 Database Info:', result[0]);

  // Test creating pgvector extension
  await client`CREATE EXTENSION IF NOT EXISTS vector`;
  await client`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
  await client`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  console.log('✅ PostgreSQL extensions installed successfully');

  await client.end();
  console.log('🎉 Trust authentication working! Database is ready for SiteSpeak.');
  process.exit(0);
} catch (error) {
  console.error('❌ CONNECTION FAILED:', error.message);
  console.error('🔍 Error details:', {
    name: error.name,
    code: error.code,
    severity: error.severity,
  });
  await client.end();
  process.exit(1);
}