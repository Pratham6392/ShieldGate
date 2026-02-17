import { Global, Module } from '@nestjs/common';
import { LocalSignerService } from './local-signer.service';

@Global()
@Module({
  providers: [LocalSignerService],
  exports: [LocalSignerService],
})
export class SignerModule {}
