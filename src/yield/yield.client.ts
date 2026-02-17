import { Injectable, HttpException, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { ErrorCodes } from '../common/errors';
import { YieldActionResult } from './yield.types';

@Injectable()
export class YieldClient {
  private readonly logger = new Logger(YieldClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: AppConfigService) {
    this.baseUrl = config.yieldBaseUrl.replace(/\/$/, '');
    this.apiKey = config.yieldApiKey;
  }

  async getYield(yieldId: string): Promise<any> {
    return this.request('GET', `/v1/yields/${yieldId}`);
  }

  async enter(input: {
    yieldId: string;
    address: string;
    arguments: Record<string, unknown>;
  }): Promise<YieldActionResult> {
    return this.request('POST', '/v1/actions/enter', {
      yieldId: input.yieldId,
      address: input.address,
      arguments: input.arguments,
    });
  }

  async exit(input: {
    yieldId: string;
    address: string;
    arguments: Record<string, unknown>;
  }): Promise<YieldActionResult> {
    return this.request('POST', '/v1/actions/exit', {
      yieldId: input.yieldId,
      address: input.address,
      arguments: input.arguments,
    });
  }

  async manage(input: {
    yieldId: string;
    address: string;
    arguments: Record<string, unknown>;
    action?: string;
    passthrough?: Record<string, unknown>;
  }): Promise<YieldActionResult> {
    const body: Record<string, unknown> = {
      yieldId: input.yieldId,
      address: input.address,
      arguments: input.arguments,
    };
    if (input.action) body.action = input.action;
    if (input.passthrough) body.passthrough = input.passthrough;

    return this.request('POST', '/v1/actions/manage', body);
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'content-type': 'application/json',
    };

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        await this.handleUpstreamError(res);
      }

      return await res.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if ((error as any).name === 'AbortError') {
        throw new HttpException(
          { code: ErrorCodes.UPSTREAM_ERROR, message: 'Upstream request timed out' },
          502,
        );
      }
      this.logger.error(`Yield API error: ${(error as Error).message}`);
      throw new HttpException(
        { code: ErrorCodes.UPSTREAM_ERROR, message: 'Upstream request failed' },
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async handleUpstreamError(res: Response): Promise<never> {
    let upstreamMessage: string | undefined;
    try {
      const json = await res.json();
      upstreamMessage = json?.message || json?.error?.message || JSON.stringify(json);
    } catch {
      // body not JSON
    }

    const status = res.status;

    if (status === 429) {
      const retryAfterRaw = res.headers.get('retry-after');
      const retryAfter = retryAfterRaw ? parseInt(retryAfterRaw, 10) : null;

      throw new HttpException(
        {
          code: ErrorCodes.UPSTREAM_RATE_LIMITED,
          message: 'Upstream rate limited',
          details: {
            retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
            rateLimit: {
              limit: res.headers.get('x-ratelimit-limit') || undefined,
              remaining: res.headers.get('x-ratelimit-remaining') || undefined,
              reset: res.headers.get('x-ratelimit-reset') || undefined,
            },
            upstreamMessage,
          },
          retryAfterHeader: retryAfterRaw || undefined,
        },
        429,
      );
    }

    const codeMap: Record<number, { code: string; httpStatus: number }> = {
      401: { code: ErrorCodes.UPSTREAM_UNAUTHORIZED, httpStatus: 502 },
      403: { code: ErrorCodes.UPSTREAM_FORBIDDEN, httpStatus: 403 },
      404: { code: ErrorCodes.UPSTREAM_NOT_FOUND, httpStatus: 404 },
      400: { code: ErrorCodes.UPSTREAM_BAD_REQUEST, httpStatus: 400 },
    };

    const mapped = codeMap[status] || {
      code: ErrorCodes.UPSTREAM_ERROR,
      httpStatus: 502,
    };

    throw new HttpException(
      {
        code: mapped.code,
        message: upstreamMessage || `Upstream returned ${status}`,
      },
      mapped.httpStatus,
    );
  }
}
