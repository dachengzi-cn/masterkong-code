import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { BusinessException } from '../interfaces/exception.interface';
import { HTTP_STATUS_TO_RESPONSE_CODE_MAP, ResponseCode } from '../constants/api_response_code';
import { ApiErrorResponse } from '../interfaces/api_response.interface';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (response.headersSent) {
      return;
    }

    let errorResponse: Omit<ApiErrorResponse, 'httpStatus'>;
    let httpStatus: HttpStatus;

    if (exception instanceof BusinessException) {
      httpStatus = exception.httpStatus;
      errorResponse = {
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          timestamp: Date.now(),
        },
      };
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus() as HttpStatus;
      const exceptionResponse = exception.getResponse();

      errorResponse = {
        error: {
          code: HTTP_STATUS_TO_RESPONSE_CODE_MAP[httpStatus],
          message: typeof exceptionResponse === 'string' ? exceptionResponse : exception.message,
          details: typeof exceptionResponse === 'object' ? JSON.stringify(exceptionResponse) : undefined,
          timestamp: Date.now(),
        },
      };
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      (exception as { code?: unknown }).code === '22P02'
    ) {
      httpStatus = HttpStatus.NOT_FOUND;
      errorResponse = {
        error: {
          code: ResponseCode.NOT_FOUND,
          message: '资源不存在',
          timestamp: Date.now(),
        },
      };
    } else {
      httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
      const err = exception as Error;
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url || 'unknown'}: ${
          err.message || String(exception)
        }`,
        err.stack || 'no stack',
      );
      errorResponse = {
        error: {
          code: ResponseCode.INTERNAL_ERROR,
          message: err.message || '服务器内部错误',
          stack: err.stack,
          cause: err.cause as string,
          timestamp: Date.now(),
        },
      };
    }

    response.status(httpStatus).json(errorResponse);
  }
}
