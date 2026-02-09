import { Response } from 'express';
import { IncomingMessage } from 'http';
import { Socket } from 'net';

/**
 * Send standardized error response
 * @param response - Express response object
 * @param statusCode - HTTP status code
 * @param error - Error message or Error object
 */
export function sendError(
  response: Response,
  statusCode: number,
  error: string | (Error & { details?: any }),
) {
  const payload: any = {
    success: false,
    error: typeof error === 'string' ? error : error.message,
  };
  if ((error as any)?.details) payload.details = (error as any).details;
  response.status(statusCode).send(payload);
}

/**
 * Handle WebSocket upgrade requests for proxied services
 * @param config - Configuration object
 * @param req - Incoming HTTP request
 * @param socket - Network socket
 * @param head - Head buffer
 */
export function handleWebSocketUpgrade(
  config: any,
  req: IncomingMessage,
  socket: any,
  head: Buffer,
) {
  const websockets = Object.keys(config.services).filter(
    (name: string) => config.services[name].subdomain?.proxy?.socket,
  );
  let found = false;
  websockets.forEach((name: string) => {
    if (req.headers.host === `${name}.${config.domain}`) {
      // Proxy library expects the original request/socket/head
      config.services[name].subdomain.proxy.websocket.upgrade(req, socket, head);
      found = true;
    }
  });
  if (!found) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }
}
