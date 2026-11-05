import type { ErrorRequestHandler } from "express";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error: { code: string; message: string; issues?: unknown };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    if (err.issues !== undefined) body.error.issues = err.issues;
    res.status(err.status).json(body);
    return;
  }
  const bodyParser = err as { type?: string; status?: number; message?: string };
  if (bodyParser.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "invalid-json", message: "Request body is not valid JSON" } } satisfies ErrorBody);
    return;
  }
  if (bodyParser.type === "entity.too.large") {
    res.status(413).json({ error: { code: "too-large", message: "Request body is too large" } } satisfies ErrorBody);
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal", message: "Internal error" } } satisfies ErrorBody);
};
