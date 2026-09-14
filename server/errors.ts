export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiErrorDetails = {
  code: string;
  message: string;
  details?: string;
};

export type ApiSuccessBody<T> = {
  success: true;
  data: T;
};

export type ApiErrorBody = {
  success: false;
  error: ApiErrorDetails;
};

export function toApiErrorBody(error: unknown): { status: number; body: ApiErrorBody } {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }
  const message = error instanceof Error ? error.message : 'Unknown internal error';
  return {
    status: 500,
    body: {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error.', details: message },
    },
  };
}

export function toApiSuccessBody<T>(data: T): ApiSuccessBody<T> {
  return { success: true, data };
}