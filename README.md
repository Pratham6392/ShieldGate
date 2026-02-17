# ShieldGate

ShieldGate is a production-style backend service that safely orchestrates Yield.xyz yield actions using a **zero-trust** model.

It sits between:

Partner App → ShieldGate → Yield.xyz Actions API → Blockchain

ShieldGate’s job is to:
- request unsigned transactions from Yield.xyz
- validate each transaction with Shield (zero-trust validation)
- sign only validated steps (EVM only, LocalSigner)
- enforce idempotency, track state, and keep an audit trail

## What’s implemented

- **Auth**: `x-api-key` required for all `/v1/workflows` routes
- **Idempotency**: every write endpoint requires `idempotency-key` and is safe for retries
- **Request tracing**: `x-request-id` is generated/propagated and returned in responses
- **Standard errors**: consistent `{ error: { code, message, details?, traceId } }` envelope
- **Workflow orchestration**:
  - `POST /v1/workflows` creates a workflow + steps (1..N)
  - `GET /v1/workflows/:id` returns workflow + ordered steps
- **Yield integration** (real mode): `enter`, `exit`, `manage`
- **Shield validation**: per-step `shieldOk` / `shieldReason` stored in DB
- **Signing** (EVM only):
  - `POST /v1/workflows/:id/steps/:stepId/sign`
  - step state checks (ready, shieldOk, not message)
  - signer safety checks (workflow address must match signer wallet)
- **Audit trail**: persisted audit events (workflow_created, yield_action_created, shield_failed, step_signed)
- **Rate limiting**: upstream 429 mapped to `UPSTREAM_RATE_LIMITED` and forwards `Retry-After` header
- **Tests**: e2e coverage for auth, idempotency, workflow creation, signing

## What’s intentionally not implemented yet (roadmap)

- broadcasting signed transactions to the blockchain
- confirmation tracking / polling
- enforcing step dependencies like “step 1 can only run after step 0 confirms”
- background workers (BullMQ) for submit/track queues

## Prerequisites

- Node.js 20+
- Docker Desktop (or Docker Engine) + Docker Compose

## Quickstart (local dev)

From the repo root:

```bash
docker compose up -d
cp .env.example .env
npm install
npm run db:migrate
npm run start:dev
```

Open:
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/v1/health`

## Environment variables

Copy `.env.example` → `.env`.

- **APP_API_KEY**: ShieldGate auth for clients (used as `x-api-key`)
- **DATABASE_URL**: Postgres connection (Prisma)
- **REDIS_URL**: Redis connection (reserved for later queues)
- **USE_MOCK_PROVIDER**:
  - `true`: use deterministic mock transactions (best for demos/tests)
  - `false`: call real Yield.xyz Actions API
- **SHIELD_MODE**:
  - `enforce`: run real Shield validation
  - `skip`: always pass validation (useful for tests and isolated demos)
- **NODE_ENV**:
  - In dev (`NODE_ENV!=production`), ShieldGate can use a shared Yield key automatically if `YIELD_API_KEY` is blank
  - In production, you should always set `YIELD_API_KEY` explicitly
- **SIGNER_PRIVATE_KEY**: enables signing (EVM only). If missing, signing fails with `SIGNER_NOT_CONFIGURED`.
- **YIELD_BASE_URL**: defaults to `https://api.yield.xyz`
- **YIELD_API_KEY**: optional in dev, required in production for real mode

## Core API usage (demo-ready)

### Headers you must send

- **`x-api-key`**: use your `.env` `APP_API_KEY` (default `change-me`)
- **`idempotency-key`**: any unique string (UUID recommended) for each write request
- **`x-request-id`**: optional; if omitted, ShieldGate generates one and returns it

### Create workflow (mock mode – reliable demo)

Ensure `.env`:
- `USE_MOCK_PROVIDER=true`
- `SHIELD_MODE=skip` (or enforce if you want)

```bash
curl -X POST "http://localhost:3000/v1/workflows" ^
  -H "x-api-key: change-me" ^
  -H "idempotency-key: demo-create-1" ^
  -H "content-type: application/json" ^
  -d "{ \"intent\": \"enter\", \"yieldId\": \"yield-demo-1\", \"address\": \"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\", \"arguments\": { \"amount\": \"1000\" } }"
```

What you should see:
- `workflow.status = validated` (if Shield passes)
- `steps.length = 2` (approve + enter)
- each step has `shieldOk` and `status`

### Create workflow (real mode – calls Yield.xyz)

Ensure `.env`:
- `USE_MOCK_PROVIDER=false`
- `SHIELD_MODE=enforce`
- `NODE_ENV=development`
- `YIELD_API_KEY=` (can be blank in dev)

Use a Shield-supported `yieldId` (EVM example):

```bash
curl -X POST "http://localhost:3000/v1/workflows" ^
  -H "x-api-key: change-me" ^
  -H "idempotency-key: demo-real-1" ^
  -H "content-type: application/json" ^
  -d "{ \"intent\": \"enter\", \"yieldId\": \"ethereum-eth-lido-staking\", \"address\": \"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\", \"arguments\": { \"amount\": \"0.01\" } }"
```

If Yield rate-limits you, you may see:
- HTTP 429
- `error.code = UPSTREAM_RATE_LIMITED`
- `Retry-After` response header when available

### Idempotency demo (proves “safe retries”)

Run the same request twice with the same `idempotency-key`.
- The second call returns the same `workflow.id`
- No duplicate workflow is created

If you reuse the same `idempotency-key` with a different request body:
- you get `IDEMPOTENCY_CONFLICT` (409)

### Get workflow

```bash
curl -X GET "http://localhost:3000/v1/workflows/<WORKFLOW_ID>" ^
  -H "x-api-key: change-me"
```

By default, signed payloads are hidden.

To include signed payloads:

```bash
curl -X GET "http://localhost:3000/v1/workflows/<WORKFLOW_ID>?includeSigned=true" ^
  -H "x-api-key: change-me"
```

### Sign a step (EVM only)

Set `.env`:
- `SIGNER_PRIVATE_KEY=<your key>`

Important:
- The signer address derived from `SIGNER_PRIVATE_KEY` must match `workflow.address`
- The step must have `status=ready` and `shieldOk=true`

```bash
curl -X POST "http://localhost:3000/v1/workflows/<WORKFLOW_ID>/steps/<STEP_ID>/sign" ^
  -H "x-api-key: change-me" ^
  -H "idempotency-key: demo-sign-1"
```

## Error format (stable, production-style)

All errors return:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "human readable",
    "details": {},
    "traceId": "..."
  }
}
```

The `traceId` matches the request `x-request-id`.

## Database

Prisma + Postgres. Core models:
- `Workflow`
- `Step`
- `IdempotencyKey`
- `AuditEvent`

Commands:

```bash
npm run db:migrate
npm run db:generate
npm run db:studio
```

## Testing

E2E tests require Postgres running:

```bash
docker compose up -d
npm run db:migrate
npm run test:e2e
```

The test suite uses:
- `USE_MOCK_PROVIDER=true`
- `SHIELD_MODE=skip`
- a known test signer private key

## Troubleshooting

### Prisma can’t reach database (P1001)

If you see: `Can't reach database server at localhost:5434`

```bash
docker compose up -d
docker compose ps
```

Then confirm `.env` `DATABASE_URL` port matches the port mapping in `docker-compose.yml`.

### Port conflicts

- If Redis `6379` is already used on your machine, update compose port mapping and `REDIS_URL`.
- If Postgres `5432` is used by a local Postgres service, map docker Postgres to a different host port and update `DATABASE_URL`.

## Hiring-manager demo script (5–7 minutes)

1. Start infra + API:
   - `docker compose up -d`
   - `npm run db:migrate`
   - `npm run start:dev`
2. Open Swagger: `http://localhost:3000/docs`
3. Create workflow (mock mode): show 2 steps + validated status
4. Re-run same request with same `idempotency-key`: show same workflow id
5. Sign step 0: show step becomes signed (and audit trail exists)
6. Run `npm run test:e2e`: show green test suite
