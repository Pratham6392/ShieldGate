import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/db/prisma.service';
import { GlobalExceptionFilter } from '../src/common/http-exception.filter';

const API_KEY = process.env.APP_API_KEY || 'change-me';

// Well-known test private key (Hardhat account #0) — NEVER use in production
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_SIGNER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

describe('Workflows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Set test signer key so signing works
    process.env.SIGNER_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.SHIELD_MODE = 'skip';
    process.env.USE_MOCK_PROVIDER = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.step.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.workflow.deleteMany();
  });

  const validBody = {
    intent: 'enter' as const,
    yieldId: 'yield-abc-123',
    address: TEST_SIGNER_ADDRESS,
    arguments: { amount: '1000' },
  };

  // ─── A) Auth required ──────────────────────────────────────────────

  describe('Auth', () => {
    it('POST /v1/workflows without X-Api-Key returns 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/workflows')
        .send(validBody)
        .set('Idempotency-Key', 'auth-test-1');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.traceId).toBeDefined();
    });

    it('POST /v1/workflows with wrong X-Api-Key returns 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/workflows')
        .set('x-api-key', 'wrong-key')
        .set('Idempotency-Key', 'auth-test-2')
        .send(validBody);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── B) Idempotency — same request ────────────────────────────────

  describe('Idempotency - same request', () => {
    it('returns the same workflow id for duplicate requests', async () => {
      const idempotencyKey = 'idem-same-1';

      const res1 = await request(app.getHttpServer())
        .post('/v1/workflows')
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', idempotencyKey)
        .send(validBody);

      expect(res1.status).toBe(201);

      const res2 = await request(app.getHttpServer())
        .post('/v1/workflows')
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', idempotencyKey)
        .send(validBody);

      expect(res2.status).toBe(201);
      expect(res2.body.workflow.id).toBe(res1.body.workflow.id);

      const count = await prisma.workflow.count();
      expect(count).toBe(1);
    });
  });

  // ─── C) Idempotency — conflict ────────────────────────────────────

  describe('Idempotency - conflict', () => {
    it('returns 409 when same key used with different body', async () => {
      const idempotencyKey = 'idem-conflict-1';

      const res1 = await request(app.getHttpServer())
        .post('/v1/workflows')
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', idempotencyKey)
        .send(validBody);

      expect(res1.status).toBe(201);

      const differentBody = { ...validBody, yieldId: 'yield-different' };

      const res2 = await request(app.getHttpServer())
        .post('/v1/workflows')
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', idempotencyKey)
        .send(differentBody);

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  // ─── D) Create workflow stores 2 steps ─────────────────────────────

  describe('Create workflow', () => {
    it('creates workflow with 2 steps and status validated', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/workflows')
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', 'create-steps-1')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.workflow).toBeDefined();
      expect(res.body.workflow.status).toBe('validated');
      expect(res.body.steps).toHaveLength(2);

      const dbSteps = await prisma.step.findMany({
        where: { workflowId: res.body.workflow.id },
        orderBy: { stepIndex: 'asc' },
      });

      expect(dbSteps).toHaveLength(2);
      expect(dbSteps[0].stepIndex).toBe(0);
      expect(dbSteps[1].stepIndex).toBe(1);
      expect(dbSteps[0].status).toBe('ready');
      expect(dbSteps[0].shieldOk).toBe(true);
    });

    it('returns 400 when Idempotency-Key header is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/workflows')
        .set('x-api-key', API_KEY)
        .send(validBody);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
    });
  });

  // ─── E) GET workflow returns same ──────────────────────────────────

  describe('GET /v1/workflows/:id', () => {
    it('returns the created workflow with ordered steps and shield fields', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/v1/workflows')
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', 'get-test-1')
        .send(validBody);

      expect(createRes.status).toBe(201);
      const workflowId = createRes.body.workflow.id;

      const getRes = await request(app.getHttpServer())
        .get(`/v1/workflows/${workflowId}`)
        .set('x-api-key', API_KEY);

      expect(getRes.status).toBe(200);
      expect(getRes.body.workflow.id).toBe(workflowId);
      expect(getRes.body.steps).toHaveLength(2);
      expect(getRes.body.steps[0].stepIndex).toBe(0);
      expect(getRes.body.steps[0].shieldOk).toBe(true);
      // signedPayload should NOT be present by default
      expect(getRes.body.steps[0].signedPayload).toBeUndefined();
    });

    it('returns 404 for non-existent workflow', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/workflows/nonexistent-id')
        .set('x-api-key', API_KEY);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── F) Sign step ──────────────────────────────────────────────────

  describe('POST /v1/workflows/:id/steps/:stepId/sign', () => {
    it('cannot sign without api key', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/workflows/any/steps/any/sign')
        .set('Idempotency-Key', 'sign-noauth');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('cannot sign if shieldOk is false', async () => {
      // Create workflow, then manually set shieldOk=false on a step
      const createRes = await request(app.getHttpServer())
        .post('/v1/workflows')
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', 'sign-shield-test')
        .send(validBody);

      expect(createRes.status).toBe(201);
      const stepId = createRes.body.steps[0].id;
      const workflowId = createRes.body.workflow.id;

      // Force shieldOk to false
      await prisma.step.update({
        where: { id: stepId },
        data: { shieldOk: false },
      });

      const signRes = await request(app.getHttpServer())
        .post(`/v1/workflows/${workflowId}/steps/${stepId}/sign`)
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', 'sign-shield-fail');

      expect(signRes.status).toBe(400);
      expect(signRes.body.error.code).toBe('SHIELD_REQUIRED');
    });

    it('signs step and stores signedPayload', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/v1/workflows')
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', 'sign-ok-test')
        .send(validBody);

      expect(createRes.status).toBe(201);
      const stepId = createRes.body.steps[0].id;
      const workflowId = createRes.body.workflow.id;

      const signRes = await request(app.getHttpServer())
        .post(`/v1/workflows/${workflowId}/steps/${stepId}/sign`)
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', 'sign-step-0');

      expect(signRes.status).toBe(201);
      expect(signRes.body.status).toBe('signed');
      expect(signRes.body.id).toBe(stepId);

      // Verify stored in DB
      const dbStep = await prisma.step.findUnique({ where: { id: stepId } });
      expect(dbStep?.signedPayload).toBeDefined();
      expect(dbStep?.status).toBe('signed');
    });

    it('idempotency returns same signed result for same request', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/v1/workflows')
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', 'sign-idem-create')
        .send(validBody);

      const stepId = createRes.body.steps[0].id;
      const workflowId = createRes.body.workflow.id;

      const signRes1 = await request(app.getHttpServer())
        .post(`/v1/workflows/${workflowId}/steps/${stepId}/sign`)
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', 'sign-idem-1');

      expect(signRes1.status).toBe(201);

      const signRes2 = await request(app.getHttpServer())
        .post(`/v1/workflows/${workflowId}/steps/${stepId}/sign`)
        .set('x-api-key', API_KEY)
        .set('Idempotency-Key', 'sign-idem-1');

      expect(signRes2.status).toBe(201);
      expect(signRes2.body.id).toBe(signRes1.body.id);
    });
  });
});
