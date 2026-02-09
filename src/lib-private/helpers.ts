export function sendError(response: any, statusCode: number, error: string | Error) {
  response.status(statusCode).send({
    success: false,
    error: typeof error === 'string' ? error : (error as Error).message,
    ...(Object.prototype.hasOwnProperty.call(error, 'details') && {
      details: (error as any).details,
    }),
  });
}
