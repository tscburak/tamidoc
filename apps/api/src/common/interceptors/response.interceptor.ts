import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  data: T;
  message?: string;
  statusCode: number;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  Response<T> | void
> {
  private readonly logger = new Logger(ResponseInterceptor.name);

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T> | void> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    return next.handle().pipe(
      map((data): Response<T> | void => {
        // Handle 204 No Content
        if (response.statusCode === 204 || data === undefined) {
          return;
        }

        const responseObj: Response<T> = {
          success: true,
          data,
          statusCode: response.statusCode,
        };

        // Log successful requests
        this.logger.log(
          `${request.method} ${request.url} - Status: ${response.statusCode}`,
        );

        return responseObj;
      }),
    );
  }
}
