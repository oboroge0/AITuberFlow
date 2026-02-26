import { toast } from '@/stores/toastStore';

/**
 * Extract a human-readable message from an unknown error value.
 *
 * Handles Error instances, objects with a `message` property, plain strings,
 * and anything else by falling back to a default message.
 */
export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

/**
 * Handle an error that should be shown to the user.
 *
 * Shows a toast notification and logs to console for debugging.
 */
export function handleError(error: unknown, context?: string): void {
  const message = getErrorMessage(error);
  const displayMessage = context ? `${context}: ${message}` : message;
  toast.error(displayMessage);
  console.error(context ?? 'Error', error);
}

/**
 * Handle an error that is only relevant for debugging.
 *
 * Logs to console but does not show a toast notification. Use this for
 * non-critical errors that do not require user attention (e.g. background
 * data fetches that fail silently, audio playback issues, etc.).
 */
export function handleSilentError(error: unknown, context?: string): void {
  console.error(context ?? 'Error', error);
}
