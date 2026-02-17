import { Global, Module } from '@nestjs/common';
import { ShieldService } from './shield.service';

@Global()
@Module({
  providers: [ShieldService],
  exports: [ShieldService],
})
export class ShieldModule {}
