import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { ACTION_PROVIDER, ActionProvider } from './action-provider';
import { ShieldService } from '../shield/shield.service';
import { hashBody } from '../common/hash';
import { ErrorCodes } from '../common/errors';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACTION_PROVIDER) private readonly actionProvider: ActionProvider,
    private readonly shield: ShieldService,
  ) {}

  async create(dto: CreateWorkflowDto) {
    const requestHash = hashBody(dto);

    const actionResult = await this.actionProvider.createAction({
      intent: dto.intent,
      yieldId: dto.yieldId,
      address: dto.address,
      arguments: dto.arguments,
      action: dto.action,
      passthrough: dto.passthrough,
    });

    // Run shield validation on each transaction
    const shieldResults = actionResult.transactions.map((tx) => {
      const result = this.shield.validateTx({
        unsignedTransaction: tx.unsignedTransaction,
        yieldId: dto.yieldId,
        userAddress: dto.address,
        args: dto.arguments,
      });
      return { tx, shieldOk: result.ok, shieldReason: result.reason };
    });

    const allShieldOk = shieldResults.every((r) => r.shieldOk);

    const workflow = await this.prisma.workflow.create({
      data: {
        intent: dto.intent,
        yieldId: dto.yieldId,
        address: dto.address,
        status: allShieldOk ? 'validated' : 'failed',
        requestHash,
        steps: {
          create: shieldResults.map((r) => ({
            stepIndex: r.tx.stepIndex,
            network: r.tx.network,
            title: r.tx.title,
            status: allShieldOk ? 'ready' : 'blocked',
            txId: r.tx.id || null,
            unsignedTx: r.tx.unsignedTransaction as any,
            structuredTx: r.tx.structuredTransaction as any,
            annotatedTx: r.tx.annotatedTransaction as any,
            isMessage: r.tx.isMessage ?? false,
            shieldOk: r.shieldOk,
            shieldReason: r.shieldReason || null,
          })),
        },
        events: {
          create: [
            {
              type: 'workflow_created',
              data: {
                intent: dto.intent,
                yieldId: dto.yieldId,
                address: dto.address,
                stepCount: actionResult.transactions.length,
              },
            },
            ...(allShieldOk
              ? [
                  {
                    type: 'yield_action_created',
                    data: {
                      yieldId: actionResult.yieldId,
                      stepCount: actionResult.transactions.length,
                      txIds: actionResult.transactions
                        .map((t) => t.id)
                        .filter((id): id is string => !!id),
                    },
                  },
                ]
              : [
                  {
                    type: 'shield_failed',
                    data: {
                      failures: shieldResults
                        .filter((r) => !r.shieldOk)
                        .map((r) => ({
                          stepIndex: r.tx.stepIndex,
                          reason: r.shieldReason,
                        })),
                    },
                  },
                ]),
          ],
        },
      },
      include: {
        steps: { orderBy: { stepIndex: 'asc' } },
      },
    });

    this.logger.log(
      `Workflow created: ${workflow.id} status=${workflow.status}`,
    );

    if (!allShieldOk) {
      const failures = shieldResults
        .filter((r) => !r.shieldOk)
        .map((r) => ({ stepIndex: r.tx.stepIndex, reason: r.shieldReason }));

      throw new BadRequestException({
        statusCode: 400,
        code: ErrorCodes.SHIELD_INVALID,
        message: 'Shield validation failed for one or more steps',
        details: { workflowId: workflow.id, failures },
      });
    }

    return this.formatResponse(workflow);
  }

  async findById(id: string, includeSigned = false) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepIndex: 'asc' } },
      },
    });

    if (!workflow) {
      throw new NotFoundException({
        statusCode: 404,
        code: ErrorCodes.NOT_FOUND,
        message: `Workflow ${id} not found`,
      });
    }

    return this.formatResponse(workflow, includeSigned);
  }

  async signStep(workflowId: string, stepId: string, signFn: (step: any, workflow: any) => Promise<string>) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { stepIndex: 'asc' } } },
    });

    if (!workflow) {
      throw new NotFoundException({
        statusCode: 404,
        code: ErrorCodes.NOT_FOUND,
        message: `Workflow ${workflowId} not found`,
      });
    }

    const step = workflow.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new NotFoundException({
        statusCode: 404,
        code: ErrorCodes.NOT_FOUND,
        message: `Step ${stepId} not found in workflow ${workflowId}`,
      });
    }

    if (workflow.status === 'failed') {
      throw new ConflictException({
        statusCode: 409,
        code: ErrorCodes.WORKFLOW_FAILED,
        message: 'Workflow has failed and cannot be signed',
      });
    }

    if (step.status === 'signed') {
      return this.formatStepResponse(step);
    }

    if (step.status !== 'ready') {
      throw new ConflictException({
        statusCode: 409,
        code: ErrorCodes.STEP_NOT_READY,
        message: `Step is in status "${step.status}" and cannot be signed`,
      });
    }

    if (!step.shieldOk) {
      throw new BadRequestException({
        statusCode: 400,
        code: ErrorCodes.SHIELD_REQUIRED,
        message: 'Step has not passed Shield validation',
      });
    }

    if (step.isMessage) {
      throw new BadRequestException({
        statusCode: 400,
        code: ErrorCodes.MESSAGE_NOT_SUPPORTED,
        message: 'Message signing is not supported yet',
      });
    }

    const signedPayload = await signFn(step, workflow);

    const updated = await this.prisma.step.update({
      where: { id: stepId },
      data: {
        signedPayload,
        status: 'signed',
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        workflowId,
        type: 'step_signed',
        data: { stepId, stepIndex: step.stepIndex },
      },
    });

    this.logger.log(
      `Step signed: ${stepId} (workflow ${workflowId}, index ${step.stepIndex})`,
    );

    return this.formatStepResponse(updated);
  }

  private formatResponse(workflow: any, includeSigned = false) {
    return {
      workflow: {
        id: workflow.id,
        intent: workflow.intent,
        yieldId: workflow.yieldId,
        address: workflow.address,
        status: workflow.status,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      },
      steps: workflow.steps.map((s: any) => this.formatStepResponse(s, includeSigned)),
    };
  }

  private formatStepResponse(s: any, includeSigned = false) {
    return {
      id: s.id,
      stepIndex: s.stepIndex,
      network: s.network,
      title: s.title,
      status: s.status,
      shieldOk: s.shieldOk,
      shieldReason: s.shieldReason,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      ...(includeSigned && s.signedPayload
        ? { signedPayload: s.signedPayload }
        : {}),
    };
  }
}
