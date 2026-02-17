import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { ACTION_PROVIDER } from './action-provider';
import { MockActionProvider } from './mock-action.provider';
import { YieldActionProvider } from './providers/yield-action.provider';
import { AppConfigService } from '../config/config.service';

@Module({
  imports: [IdempotencyModule],
  controllers: [WorkflowsController],
  providers: [
    WorkflowsService,
    MockActionProvider,
    YieldActionProvider,
    {
      provide: ACTION_PROVIDER,
      useFactory: (
        config: AppConfigService,
        mock: MockActionProvider,
        real: YieldActionProvider,
      ) => {
        return config.useMockProvider ? mock : real;
      },
      inject: [AppConfigService, MockActionProvider, YieldActionProvider],
    },
  ],
})
export class WorkflowsModule {}
