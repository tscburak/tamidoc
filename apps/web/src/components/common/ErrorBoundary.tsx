import { Component, type ReactNode } from 'react';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in component tree and displays fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Log to service in production
    if (import.meta.env.PROD) {
      // You can integrate with error tracking service here
      // Example: Sentry, LogRocket, etc.
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Reload the page to reset state
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex items-center justify-center min-h-screen bg-stone-50 dark:bg-stone-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-stone-800 rounded-lg shadow-lg p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <IconAlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>

              <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100 mb-2">
                Something went wrong
              </h1>

              <p className="text-stone-600 dark:text-stone-400 mb-6">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>

              {import.meta.env.DEV && this.state.error && (
                <details className="w-full mb-6 text-left">
                  <summary className="cursor-pointer text-sm font-semibold text-stone-700 dark:text-stone-300 mb-2">
                    Error Details (Development Only)
                  </summary>
                  <div className="mt-2 p-3 bg-stone-100 dark:bg-stone-700 rounded text-xs font-mono text-stone-800 dark:text-stone-200 overflow-auto max-h-40">
                    <div className="font-semibold">{this.state.error.toString()}</div>
                    {this.state.errorInfo && (
                      <pre className="mt-2 whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                </details>
              )}

              <button
                onClick={this.handleReset}
                className="w-full inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                <IconRefresh size={18} />
                Reload Page
              </button>

              <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
                If this problem persists, please contact support.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
