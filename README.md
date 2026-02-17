# ShieldGate

Zero-Trust Transaction Orchestrator.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose

## Setup

1. Start Postgres and Redis:

```bash
docker compose up -d
```

2. Copy env file and configure:

```bash
cp .env.example .env
```

3. Install dependencies:

```bash
npm install
```

4. Run database migrations:

```bash
npm run db:migrate
```

5. Start the API (development):

```bash
npm run start:dev
```

## Endpoints

- Health: [http://localhost:3000/v1/health](http://localhost:3000/v1/health)
- Swagger: [http://localhost:3000/docs](http://localhost:3000/docs)

## Database

Prisma is used for database access with PostgreSQL. Useful commands:

- `npm run db:migrate` — run migrations
- `npm run db:generate` — regenerate Prisma client
- `npm run db:studio` — open Prisma Studio GUI

## Yield API Key

In development mode (`NODE_ENV!=production`), ShieldGate automatically uses a shared dev Yield agent key for manual demos. No `YIELD_API_KEY` env var needed in dev.

For production, set `YIELD_API_KEY` explicitly in your environment.

## Rate Limiting

If the upstream Yield API returns HTTP 429, ShieldGate responds with error code `UPSTREAM_RATE_LIMITED` and includes `retryAfter` details in the response. A `Retry-After` header is also forwarded when available.

## Signing

Set `SIGNER_PRIVATE_KEY` in your `.env` to enable EVM transaction signing. The signer address must match the workflow address.

## Testing

```bash
npm test          # unit tests
npm run test:e2e  # e2e tests (requires running Postgres)
```

Tests use `USE_MOCK_PROVIDER=true` and `SHIELD_MODE=skip` to avoid hitting real APIs.
