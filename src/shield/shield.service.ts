import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

let ShieldClass: any = null;

@Injectable()
export class ShieldService {
  private readonly logger = new Logger(ShieldService.name);
  private shield: any = null;
  private readonly skipMode: boolean;

  constructor(private readonly config: AppConfigService) {
    this.skipMode = config.shieldMode === 'skip';

    if (!this.skipMode) {
      try {
        // Dynamic import to avoid hard crash if package not installed
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('@yieldxyz/shield');
        ShieldClass = mod.Shield || mod.default;
        if (ShieldClass) {
          this.shield = new ShieldClass();
          this.logger.log('Shield initialized');
        }
      } catch {
        this.logger.warn(
          'Shield package not available — validation will always pass',
        );
      }
    } else {
      this.logger.log('Shield running in skip mode');
    }
  }

  validateTx(input: {
    unsignedTransaction: any;
    yieldId: string;
    userAddress: string;
    args?: any;
  }): { ok: boolean; reason?: string; details?: any } {
    if (this.skipMode || !this.shield) {
      return { ok: true };
    }

    try {
      const result = this.shield.validate({
        unsignedTransaction: input.unsignedTransaction,
        yieldId: input.yieldId,
        userAddress: input.userAddress,
        args: input.args,
      });

      if (result.isValid) {
        return { ok: true };
      }

      return {
        ok: false,
        reason: result.reason || 'Shield validation failed',
        details: result.details,
      };
    } catch (error) {
      this.logger.error(
        `Shield validation error: ${(error as Error).message}`,
      );
      return {
        ok: false,
        reason: `Shield error: ${(error as Error).message}`,
      };
    }
  }

  isSupported(yieldId: string): boolean {
    if (this.skipMode || !this.shield) {
      return true;
    }

    try {
      return this.shield.isSupported(yieldId);
    } catch {
      return false;
    }
  }
}
