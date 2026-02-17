-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "yieldId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "network" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "txId" TEXT,
    "unsignedTx" JSONB NOT NULL,
    "structuredTx" JSONB,
    "annotatedTx" JSONB,
    "isMessage" BOOLEAN NOT NULL DEFAULT false,
    "shieldOk" BOOLEAN NOT NULL DEFAULT false,
    "shieldReason" TEXT,
    "signedPayload" TEXT,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workflow_yieldId_idx" ON "Workflow"("yieldId");

-- CreateIndex
CREATE INDEX "Workflow_address_idx" ON "Workflow"("address");

-- CreateIndex
CREATE INDEX "Workflow_status_idx" ON "Workflow"("status");

-- CreateIndex
CREATE INDEX "Step_workflowId_idx" ON "Step"("workflowId");

-- CreateIndex
CREATE INDEX "Step_status_idx" ON "Step"("status");

-- CreateIndex
CREATE INDEX "Step_txHash_idx" ON "Step"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "Step_workflowId_stepIndex_key" ON "Step"("workflowId", "stepIndex");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- CreateIndex
CREATE INDEX "AuditEvent_workflowId_idx" ON "AuditEvent"("workflowId");

-- CreateIndex
CREATE INDEX "AuditEvent_type_idx" ON "AuditEvent"("type");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
