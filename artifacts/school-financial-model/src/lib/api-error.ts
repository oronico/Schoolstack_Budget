interface ApiErrorShape {
  name: string;
  data?: { error?: string } | null;
  message?: string;
}

function isApiError(err: unknown): err is ApiErrorShape {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as Record<string, unknown>).name === "ApiError"
  );
}

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    const serverMessage =
      typeof err.data === "object" && err.data !== null
        ? err.data.error
        : undefined;
    return serverMessage || fallback;
  }
  if (err instanceof Error) {
    return err.message || fallback;
  }
  return fallback;
}
