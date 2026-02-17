import { createHash } from 'crypto';
import { stableStringify } from './stable-json';

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hashBody(body: unknown): string {
  return sha256(stableStringify(body));
}
