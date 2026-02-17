import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes } from './errors';

const STATUS_TO_CODE: Record<number, string> = {
  400: ErrorCodes.BAD_REQUEST,
  401: ErrorCodes.UNAUTHORIZED,
  404: ErrorCodes.NOT_FOUND,
  409: ErrorCodes.CONFLICT,
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const traceId = (req as any).traceId || 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCodes.INTERNAL_ERROR;
    let message = 'Internal server error';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_TO_CODE[status] || ErrorCodes.INTERNAL_ERROR;

      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        // Support custom code override from our services
        if (resp.code && typeof resp.code === 'string') {
          code = resp.code;
        }
        message = (resp.message as string) || message;
        // class-validator returns message as array
        if (Array.isArray(resp.message)) {
          message = 'Validation failed';
          details = resp.message;
        }
        if (resp.details !== undefined) {
          details = resp.details;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
      // Check for Prisma known errors
      if ((exception as any).code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = ErrorCodes.NOT_FOUND;
        message = 'Record not found';
      }
    } else {
      this.logger.error('Unknown exception', exception);
    }

    // Forward Retry-After header for rate-limited responses
    if (exception instanceof HttpException) {
      const exResp = exception.getResponse();
      if (typeof exResp === 'object' && exResp !== null) {
        const retryHeader = (exResp as any).retryAfterHeader;
        if (retryHeader) {
          res.setHeader('Retry-After', retryHeader);
        }
      }
    }

    const body = {
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
        traceId,
      },
    };

    res.status(status).json(body);
  }
}
