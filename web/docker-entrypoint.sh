#!/bin/sh
set -e

# Run migrations
echo "Running database migrations..."
npx prisma migrate deploy

# Seed data if enabled
if [ "$SEED_DB" = "true" ]; then
  echo "Seeding database..."
  if [ -f "scripts/import-data.ts" ]; then
      npx tsx scripts/import-data.ts
  else
      echo "Warning: scripts/import-data.ts not found. Skipping seed."
  fi
fi

# Start the application
echo "Starting application..."
node server.js
