import { Injectable, Logger } from '@nestjs/common';

const YIELD_AGENT_SHARED_KEY = 'b40dd85f-d89e-48da-a2b3-ec04fae106dc';

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  readonly nodeEnv: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly appApiKey: string;
  readonly yieldBaseUrl: string;
  readonly yieldApiKey: string;
  readonly signerPrivateKey: string;
  readonly evmRpcUrl: string;
  readonly useMockProvider: boolean;
  readonly shieldMode: string;

  constructor() {
    this.nodeEnv = process.env.NODE_ENV || 'development';
    this.port = parseInt(process.env.PORT || '3000', 10);
    this.databaseUrl = process.env.DATABASE_URL || '';
    this.redisUrl = process.env.REDIS_URL || '';
    this.appApiKey = process.env.APP_API_KEY || '';
    this.yieldBaseUrl = process.env.YIELD_BASE_URL || 'https://api.yield.xyz';
    this.signerPrivateKey = process.env.SIGNER_PRIVATE_KEY || '';
    this.evmRpcUrl = process.env.EVM_RPC_URL || '';
    this.useMockProvider = process.env.USE_MOCK_PROVIDER === 'true';
    this.shieldMode = process.env.SHIELD_MODE || 'enforce';

    // Resolve yield API key: env > dev fallback > error in prod
    const envYieldKey = process.env.YIELD_API_KEY || '';
    if (envYieldKey) {
      this.yieldApiKey = envYieldKey;
    } else if (this.nodeEnv !== 'production') {
      this.yieldApiKey = YIELD_AGENT_SHARED_KEY;
    } else if (!this.useMockProvider) {
      throw new Error(
        'YIELD_API_KEY is required in production when USE_MOCK_PROVIDER=false',
      );
    } else {
      this.yieldApiKey = '';
    }

    this.validate();
  }

  private validate(): void {
    const required: Record<string, string> = {
      PORT: String(this.port),
      DATABASE_URL: this.databaseUrl,
      REDIS_URL: this.redisUrl,
      APP_API_KEY: this.appApiKey,
    };

    const missing: string[] = [];

    for (const [key, value] of Object.entries(required)) {
      if (!value || value.trim() === '') {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      const message = `Missing required env vars: ${missing.join(', ')}`;
      this.logger.error(message);
      throw new Error(message);
    }

    this.logger.log('Configuration validated successfully');
  }
}
