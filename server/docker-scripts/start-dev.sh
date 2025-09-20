#!/bin/bash

# SiteSpeak Development Startup Script
set -e

echo "🚀 Starting SiteSpeak development environment..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
until nc -z sitespeak-postgres-dev 5432; do
  echo "Database not ready yet..."
  sleep 2
done
echo "✅ Database is ready!"

# Wait for Redis to be ready
echo "⏳ Waiting for Redis connection..."
until nc -z sitespeak-redis-dev 6379; do
  echo "Redis not ready yet..."
  sleep 2
done
echo "✅ Redis is ready!"

# Start the application based on process type
if [ "$PROCESS_TYPE" = "worker" ]; then
  echo "🔨 Starting worker process..."
  cd /app && npm run dev:worker
elif [ "$PROCESS_TYPE" = "web" ]; then
  echo "🌐 Starting web process..."
  cd /app && npm run dev
else
  echo "🔄 Starting default development server..."
  cd /app && npm run dev
fi