import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../db/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    const time = new Date().toISOString();
    let dbOk = false;
    let dbError: string | undefined;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (error) {
      dbError =
        error instanceof Error ? error.message : 'Unknown database error';
    }

    return {
      ok: dbOk,
      time,
      db: {
        ok: dbOk,
        ...(dbError ? { error: dbError } : {}),
      },
    };
  }
}
