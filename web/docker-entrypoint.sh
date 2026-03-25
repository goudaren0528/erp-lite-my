#!/bin/sh
set -e

# Adjust Prisma provider based on DATABASE_URL
if echo "$DATABASE_URL" | grep -q "^postgresql://"; then
  echo "PostgreSQL detected. Switching Prisma provider to postgresql..."
  sed -i 's/provider = "sqlite"/provider = "postgresql"/g' prisma/schema.prisma
  
  # For mixed environments (SQLite local, Postgres prod), we must use db push
  # instead of migrate deploy because migrations are provider-specific.
  echo "Running database push with accept-data-loss for cross-provider compatibility..."
  npx prisma db push --accept-data-loss
else
  # Default to standard migrations for SQLite (or matching provider)
  echo "Ensuring data directory exists and has correct permissions..."
  mkdir -p /app/data
  chmod 777 /app/data
  
  echo "Running database migrations..."
  npx prisma migrate deploy
fi

# Run ID migration script to ensure data consistency
if [ -f "scripts/migrate-ids.ts" ]; then
    echo "Running ID migration script..."
    npx tsx scripts/migrate-ids.ts || echo "ID migration script encountered errors (possibly already migrated), continuing..."
fi


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
echo "Ensuring uploads directory exists and has correct permissions..."
mkdir -p ./public/uploads
# Since we run as root, this chmod is guaranteed to work, but we handle failure just in case
set +e
chmod 777 ./public/uploads 2>/dev/null || echo "Warning: Could not chmod ./public/uploads, continuing..."
set -e

echo "Starting application..."
# Start Xvfb virtual display so headful Chrome can run on Linux without a real monitor
if command -v Xvfb > /dev/null 2>&1; then
  if [ -z "$DISPLAY" ]; then
    Xvfb :99 -screen 0 1366x768x24 -ac +extension GLX +render -noreset &
    XVFB_PID=$!
    export DISPLAY=:99
    i=0
    while [ $i -lt 30 ]; do
      if [ -S /tmp/.X11-unix/X99 ]; then
        echo "Xvfb started on DISPLAY=:99 (pid=$XVFB_PID)"
        break
      fi
      i=$((i + 1))
      sleep 0.2
    done
    if [ ! -S /tmp/.X11-unix/X99 ]; then
      echo "Xvfb failed to start (pid=$XVFB_PID). DISPLAY=:99 not available."
      exit 1
    fi
  else
    echo "DISPLAY is already set to $DISPLAY, skipping Xvfb startup."
  fi
else
  echo "Xvfb not found, headful browser mode will not be available"
fi

# Use Next.js built-in start command via npm if standalone fails, or direct node if standalone
if [ -f "server.js" ]; then
  exec node server.js
else
  echo "server.js not found, falling back to npm start..."
  exec npm start
fi
