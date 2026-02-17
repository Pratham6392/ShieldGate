import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { hashBody } from '../common/hash';
import { ErrorCodes } from '../common/errors';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(opts: {
    method: string;
    path: string;
    idempotencyKey: string | undefined;
    body: unknown;
    handler: () => Promise<T>;
  }): Promise<T> {
    const { method, path, idempotencyKey, body, handler } = opts;

    if (!idempotencyKey) {
      throw new BadRequestException({
        statusCode: 400,
        code: ErrorCodes.MISSING_IDEMPOTENCY_KEY,
        message: 'Idempotency-Key header is required for write operations',
      });
    }

    const scope = `${method}:${path}`;
    const requestHash = hashBody(body);

    // Check if key already exists
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { scope_key: { scope, key: idempotencyKey } },
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException({
          statusCode: 409,
          code: ErrorCodes.IDEMPOTENCY_CONFLICT,
          message:
            'Idempotency-Key has already been used with a different request body',
        });
      }
      this.logger.log(`Idempotency hit for ${scope} key=${idempotencyKey}`);
      return existing.responseBody as T;
    }

    // Execute handler
    const result = await handler();

    // Store result — handle race condition
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          scope,
          key: idempotencyKey,
          requestHash,
          responseBody: result as any,
        },
      });
    } catch (error: any) {
      // Unique constraint violation — another request won the race
      if (error.code === 'P2002') {
        const raced = await this.prisma.idempotencyKey.findUnique({
          where: { scope_key: { scope, key: idempotencyKey } },
        });
        if (raced) {
          if (raced.requestHash !== requestHash) {
            throw new ConflictException({
              statusCode: 409,
              code: ErrorCodes.IDEMPOTENCY_CONFLICT,
              message:
                'Idempotency-Key has already been used with a different request body',
            });
          }
          return raced.responseBody as T;
        }
      }
      throw error;
    }

    return result;
  }
}
