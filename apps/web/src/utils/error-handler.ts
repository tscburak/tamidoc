/**
 * Comprehensive Error Handling System
 * Provides utilities for handling different types of errors with user-friendly messages
 */

export interface AppError {
  message: string;
  type: 'network' | 'validation' | 'auth' | 'server' | 'client' | 'timeout';
  statusCode?: number;
  details?: any;
  userMessage: string;
  action?: string;
}

/**
 * Parse and categorize different types of errors
 */
export function parseError(error: any): AppError {
  // Network errors (no response)
  if (!error.response) {
    if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
      return {
        message: error.message || 'Request timeout',
        type: 'timeout',
        userMessage: 'The request took too long. Please check your connection and try again.',
        action: 'Retry'
      };
    }

    if (error.message?.includes('Network Error') || !error.message) {
      return {
        message: error.message || 'Network error',
        type: 'network',
        userMessage: 'Unable to connect to the server. Please check your internet connection.',
        action: 'Check Connection'
      };
    }

    return {
      message: error.message || 'Unknown error',
      type: 'client',
      userMessage: 'Something went wrong. Please try again.',
      action: 'Retry'
    };
  }

  // Server responded with error status
  const status = error.response?.status;
  const data = error.response?.data;

  switch (status) {
    case 400:
      // Validation error or bad request
      return {
        message: data?.message || 'Invalid request',
        type: 'validation',
        statusCode: status,
        details: data?.errors || data,
        userMessage: data?.message || 'Please check your input and try again.',
        action: 'Fix Input'
      };

    case 401:
      // Unauthorized
      return {
        message: data?.message || 'Authentication required',
        type: 'auth',
        statusCode: status,
        userMessage: 'Please log in to continue.',
        action: 'Login'
      };

    case 403:
      // Forbidden
      return {
        message: data?.message || 'Access denied',
        type: 'auth',
        statusCode: status,
        userMessage: 'You don\'t have permission to perform this action.',
        action: 'Contact Admin'
      };

    case 404:
      // Not found
      return {
        message: data?.message || 'Resource not found',
        type: 'client',
        statusCode: status,
        userMessage: 'The requested resource was not found.',
        action: 'Go Back'
      };

    case 409:
      // Conflict
      return {
        message: data?.message || 'Resource conflict',
        type: 'validation',
        statusCode: status,
        userMessage: data?.message || 'This action conflicts with existing data.',
        action: 'Review Data'
      };

    case 422:
      // Unprocessable entity (validation)
      return {
        message: data?.message || 'Validation failed',
        type: 'validation',
        statusCode: status,
        details: data?.errors || data,
        userMessage: formatValidationErrors(data?.errors || data),
        action: 'Fix Errors'
      };

    case 429:
      // Too many requests
      return {
        message: 'Too many requests',
        type: 'server',
        statusCode: status,
        userMessage: 'You\'re making too many requests. Please wait a moment and try again.',
        action: 'Wait'
      };

    case 500:
    case 502:
    case 503:
    case 504:
      // Server errors
      return {
        message: data?.message || 'Server error',
        type: 'server',
        statusCode: status,
        userMessage: 'The server is experiencing issues. Please try again later.',
        action: 'Retry Later'
      };

    default:
      // Unknown status
      return {
        message: data?.message || error.message || 'Unknown error',
        type: 'server',
        statusCode: status,
        userMessage: 'Something unexpected happened. Please try again.',
        action: 'Retry'
      };
  }
}

/**
 * Format validation errors into user-friendly messages
 */
function formatValidationErrors(errors: any): string {
  if (typeof errors === 'string') {
    return errors;
  }

  if (Array.isArray(errors)) {
    return errors.map(err => typeof err === 'string' ? err : err.message || err).join(', ');
  }

  if (typeof errors === 'object' && errors !== null) {
    const messages = Object.entries(errors)
      .map(([field, error]) => {
        if (Array.isArray(error)) {
          return `${field}: ${error.join(', ')}`;
        }
        if (typeof error === 'string') {
          return `${field}: ${error}`;
        }
        if (typeof error === 'object' && error !== null) {
          return `${field}: ${(error as any).message || JSON.stringify(error)}`;
        }
        return `${field}: ${String(error)}`;
      });

    return messages.join('; ');
  }

  return 'Please check your input and try again.';
}

/**
 * Get toast color based on error type
 */
export function getErrorColor(error: AppError): 'red' | 'orange' | 'yellow' {
  switch (error.type) {
    case 'network':
    case 'timeout':
      return 'orange';
    case 'validation':
      return 'yellow';
    case 'auth':
      return 'orange';
    case 'server':
      return 'red';
    case 'client':
    default:
      return 'red';
  }
}

/**
 * Get toast title based on error type
 */
export function getErrorTitle(error: AppError): string {
  switch (error.type) {
    case 'network':
      return 'Connection Error';
    case 'timeout':
      return 'Request Timeout';
    case 'validation':
      return 'Validation Error';
    case 'auth':
      return 'Authentication Error';
    case 'server':
      return 'Server Error';
    case 'client':
    default:
      return 'Error';
  }
}

/**
 * Handle error and show toast notification
 */
export function handleWithErrorToast(error: any, toast: any, context?: string) {
  const appError = parseError(error);
  const title = context ? `${context}: ${getErrorTitle(appError)}` : getErrorTitle(appError);

  toast.show({
    title,
    message: appError.userMessage,
    color: getErrorColor(appError),
  });

  // Log error for debugging (in development)
  if (import.meta.env.DEV) {
    console.error('Error handled:', {
      original: error,
      parsed: appError,
      context
    });
  }

  return appError;
}

/**
 * Handle error silently (no toast)
 */
export function handleSilentError(error: any): AppError {
  const appError = parseError(error);

  // Log error for debugging (in development)
  if (import.meta.env.DEV) {
    console.error('Silent error:', {
      original: error,
      parsed: appError
    });
  }

  return appError;
}

/**
 * Create a safe error handler that won't throw
 */
export function createSafeHandler<T extends any[]>(
  handler: (...args: T) => Promise<void>,
  onError?: (error: AppError) => void
) {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      const appError = parseError(error);
      if (onError) {
        onError(appError);
      }
      // Don't throw - we've handled it
    }
  };
}
