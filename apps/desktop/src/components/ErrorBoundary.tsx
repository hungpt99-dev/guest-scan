import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "../lib/logger";
import Button from "./common/Button";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, retry: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

const initialState: ErrorBoundaryState = {
  hasError: false,
  error: null,
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = initialState;
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const safeContext: Record<string, unknown> = {
      componentStack: errorInfo.componentStack
        ? errorInfo.componentStack.split("\n").slice(0, 6).join("\n")
        : undefined,
      errorName: error.name,
    };

    logger.error("ErrorBoundary caught an error", { error: error.message, ...safeContext });

    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.props.resetOnPropsChange && this.state.hasError && prevProps.children !== this.props.children) {
      this.setState(initialState);
    }
  }

  private handleRetry(): void {
    this.setState(initialState);
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error!, this.handleRetry);
      }
      return this.props.fallback;
    }

    return (
      <div className="flex flex-col items-center justify-center p-8 text-center" role="alert">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
        <p className="mt-2 text-sm text-gray-500">
          An unexpected error occurred. Please try again or restart the application.
        </p>
        <div className="mt-6">
          <Button variant="primary" onClick={this.handleRetry}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }
}

export function withErrorBoundary<P extends object>(
  Component_: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, "children">,
): React.FC<P> {
  const displayName = Component_.displayName || Component_.name || "Component";

  const Wrapped = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component_ {...props} />
    </ErrorBoundary>
  );

  Wrapped.displayName = `withErrorBoundary(${displayName})`;

  return Wrapped;
}
