interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-red-800">{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="ml-4 text-sm font-medium text-red-600 hover:text-red-500">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
