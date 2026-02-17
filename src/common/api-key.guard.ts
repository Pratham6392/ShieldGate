import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey || apiKey !== this.config.appApiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
