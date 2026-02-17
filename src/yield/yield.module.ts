import { Global, Module } from '@nestjs/common';
import { YieldClient } from './yield.client';

@Global()
@Module({
  providers: [YieldClient],
  exports: [YieldClient],
})
export class YieldModule {}
