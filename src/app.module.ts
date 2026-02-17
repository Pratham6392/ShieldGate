import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './db/prisma.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { YieldModule } from './yield/yield.module';
import { ShieldModule } from './shield/shield.module';
import { SignerModule } from './signer/signer.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { RequestIdMiddleware } from './common/request-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    PrismaModule,
    YieldModule,
    ShieldModule,
    SignerModule,
    HealthModule,
    IdempotencyModule,
    WorkflowsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
