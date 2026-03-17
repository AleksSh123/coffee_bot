export function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
