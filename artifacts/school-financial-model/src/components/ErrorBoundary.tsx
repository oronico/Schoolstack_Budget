import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-100 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[#1E293B] mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-6">
            An unexpected error occurred. Your data has been saved automatically.
          </p>
          {this.state.error && (
            <pre className="mb-6 rounded-lg bg-gray-50 p-3 text-left text-xs text-gray-600 overflow-auto max-h-32">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-[#1E293B] hover:bg-gray-50 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#D97706] text-white hover:bg-[#B45309] transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
