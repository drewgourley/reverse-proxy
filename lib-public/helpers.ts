import { Response } from 'express';
import { Socket } from 'net';

/**
 * Send standardized error response
 */
export function sendError(
  response: Response,
  statusCode: number,
  error: string | Error | { message?: string; details?: unknown }
): void {
  const message = typeof error === 'string' ? error : (error?.message ?? 'Unknown error');
  const payload: { success: false; error: string; details?: unknown } = {
    success: false,
    error: message,
  };

  if (error && typeof error === 'object' && 'details' in error && (error as any).details) {
    payload.details = (error as any).details;
  }

  response.status(statusCode).send(payload);
}

/**
 * Get the client's IP address from a socket object
 */
export function extractIpFromSocket(socket: Socket | { remoteAddress?: string } | null | undefined): string {
  let addr = socket?.remoteAddress as string | undefined;
  if (!addr) return 'unknown';
  addr = String(addr).trim();

  // IPv4-mapped IPv6 -> normalise to IPv4
  if (addr.startsWith('::ffff:')) return addr.split('::ffff:')[1];

  // strip IPv6 zone id (fe80::1%eth0)
  const zoneIdx = addr.indexOf('%');
  if (zoneIdx !== -1) addr = addr.slice(0, zoneIdx);

  // If it looks like IPv6 (contains ':'), return as-is (preserve scope/format)
  if (addr.includes(':')) return addr;

  // Fallback: return last colon-separated segment (covers odd platform formats)
  const parts = addr.split(':');
  return parts[parts.length - 1];
}
