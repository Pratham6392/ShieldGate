import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { ApiKeyGuard } from '../common/api-key.guard';
import { WorkflowsService } from './workflows.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { LocalSignerService } from '../signer/local-signer.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';

@ApiTags('Workflows')
@UseGuards(ApiKeyGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly idempotencyService: IdempotencyService,
    private readonly signer: LocalSignerService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new workflow' })
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  async create(@Body() dto: CreateWorkflowDto, @Req() req: Request) {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const path = req.route?.path
      ? `/v1${req.route.path}`
      : req.originalUrl.split('?')[0];

    return this.idempotencyService.run({
      method: req.method,
      path,
      idempotencyKey,
      body: dto,
      handler: () => this.workflowsService.create(dto),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiQuery({ name: 'includeSigned', required: false, type: Boolean })
  async findOne(
    @Param('id') id: string,
    @Query('includeSigned') includeSigned?: string,
  ) {
    return this.workflowsService.findById(id, includeSigned === 'true');
  }

  @Post(':id/steps/:stepId/sign')
  @ApiOperation({ summary: 'Sign a workflow step' })
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  async signStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Req() req: Request,
  ) {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const path = req.originalUrl.split('?')[0];

    return this.idempotencyService.run({
      method: req.method,
      path,
      idempotencyKey,
      body: { workflowId: id, stepId },
      handler: () =>
        this.workflowsService.signStep(id, stepId, async (step, workflow) => {
          return this.signer.signTransaction(
            step.unsignedTx,
            workflow.address,
          );
        }),
    });
  }
}
