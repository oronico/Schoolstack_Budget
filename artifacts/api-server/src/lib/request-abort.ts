import type { Request } from "express";

export interface RequestWithAbort extends Request {
  abortSignal?: AbortSignal;
}

export function isRequestAborted(req: Request): boolean {
  const r = req as RequestWithAbort;
  return r.abortSignal?.aborted === true || req.socket?.destroyed === true;
}
