export class CitadelError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function asCitadelError(err: unknown): CitadelError {
  if (err instanceof CitadelError) return err;
  if (err instanceof Error) return new CitadelError("INTERNAL_ERROR", err.message, 500);
  return new CitadelError("INTERNAL_ERROR", "Unknown error", 500);
}

