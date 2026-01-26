# Deployment Guide

This guide explains how to deploy the ERP-Lite application using Docker Compose.

## Prerequisites

- Docker
- Docker Compose

## Structure

- `docker-compose.yml`: Defines the services (web app and database).
- `web/`: Contains the source code for the Next.js application.
- `uploads/`: Directory created on the host to store uploaded files (mapped to container).

## Quick Start

1.  **Start the services**:
    ```bash
    docker-compose up -d --build
    ```

2.  **Access the application**:
    Open your browser and navigate to `http://localhost:3000`.

## Configuration

### Environment Variables

You can modify the environment variables in `docker-compose.yml` directly or use a `.env` file.

- `DATABASE_URL`: Connection string for the PostgreSQL database.
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`: A secret key for encrypting server action data. **Change this for production.**
- `SEED_DB`: Set to `true` to run seed scripts (create admin user, etc.) on startup.

### Persistence

- **Database**: Data is persisted in the named Docker volume `db_data`.
- **Uploads**: Uploaded files (images, screenshots) are persisted in the `./uploads` directory on the host machine.

## Maintenance

### View Logs

```bash
docker-compose logs -f
```

### Update Application

1.  Pull latest code changes (if using git).
2.  Rebuild and restart:
    ```bash
    docker-compose up -d --build
    ```

### Database Management

To access the database shell:

```bash
docker-compose exec db psql -U postgres -d erp_lite
```

## Troubleshooting

- **Image Uploads**: If images are not showing, ensure the `./uploads` directory has write permissions and that `unoptimized` prop is used in Next.js Image components (already configured in code).
- **Database Connection**: Ensure the `web` service can reach the `db` service. The hostname for the database is `db` (service name).
- **Prisma Error P1012/P3019**: 
  - The application is configured to automatically switch the Prisma provider from `sqlite` to `postgresql` when a PostgreSQL `DATABASE_URL` is detected in the environment variables (via `docker-entrypoint.sh`).
  - **Note**: When deploying with PostgreSQL (e.g., in production), the entrypoint script uses `prisma db push` instead of `prisma migrate deploy` to avoid cross-provider migration lock issues (P3019). This ensures the database schema is synchronized without requiring a separate migration history for PostgreSQL.
  - If you encounter provider mismatch errors locally, ensure your `DATABASE_URL` starts with `file:` for SQLite, or `postgresql://` for PostgreSQL.
