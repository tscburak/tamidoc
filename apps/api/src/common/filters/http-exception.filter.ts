import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: string[] | null = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj.message as string) || message;
        errors = Array.isArray(responseObj.message)
          ? (responseObj.message as string[])
          : null;
        // Domain exceptions carry structured issue lists (e.g. block validation
        // `{ instanceId, path, message, fix }`) under `errors`.
        if (!errors && Array.isArray(responseObj.errors)) {
          errors = (responseObj.errors as unknown[]).map((e) =>
            typeof e === 'string'
              ? e
              : `${(e as { instanceId?: string })?.instanceId ?? ''}: ${(e as { message?: string })?.message ?? ''}`.trim(),
          );
        }

        if (responseObj.error) {
          message = responseObj.error as string;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Log error details
    this.logger.error(
      `${request.method} ${request.url} - Status: ${status} - Message: ${message}`,
      exception instanceof Error ? exception.stack : '',
    );

    // ValidationPipe failures arrive as an array of constraint messages —
    // log them so payload-level rejections are debuggable from the server log.
    if (errors && errors.length) {
      this.logger.error(
        `${request.method} ${request.url} - Validation errors: ${errors.join(' | ')}`,
      );
    }

    response.status(status).json({
      success: false,
      message,
      errors,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
