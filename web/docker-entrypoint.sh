#!/bin/sh
set -e

# Run migrations
echo "Running database migrations..."
npx prisma migrate deploy

# Seed data if enabled
if [ "$SEED_DB" = "true" ]; then
  echo "Seeding database..."
  
  # Try to import legacy data if script exists
  if [ -f "scripts/import-data.ts" ]; then
      echo "Running data import script..."
      npx tsx scripts/import-data.ts || echo "Data import script encountered errors, continuing..."
  fi

  # Always ensure basic seed data (admin user) exists
  if [ -f "scripts/seed-basic.ts" ]; then
      echo "Running basic seed..."
      npx tsx scripts/seed-basic.ts
  else
      echo "Warning: No basic seed script found."
  fi
fi

# Start the application
echo "Starting application..."
node server.js
