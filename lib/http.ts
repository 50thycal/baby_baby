import { NextResponse } from "next/server";
import { DIAPER_TYPES, type DiaperType } from "./types";

export class BadRequest extends Error {}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function fail(err: unknown) {
  if (err instanceof BadRequest) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  const message = err instanceof Error ? err.message : "Something went wrong";
  console.error("[api]", err);
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Parses an ISO timestamp, rejecting anything absurd. */
export function parseTimestamp(value: unknown, field = "timestamp"): Date {
  if (typeof value !== "string") throw new BadRequest(`${field} is required`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequest(`${field} is not a valid date`);
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) throw new BadRequest(`${field} is out of range`);
  return date;
}

export function parseAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new BadRequest("amount_ml must be a number");
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 1000) throw new BadRequest("amount_ml must be between 0 and 1000");
  return rounded;
}

export function parseDiaperType(value: unknown): DiaperType {
  if (typeof value !== "string" || !DIAPER_TYPES.includes(value as DiaperType)) {
    throw new BadRequest(`type must be one of: ${DIAPER_TYPES.join(", ")}`);
  }
  return value as DiaperType;
}

export function parseCommentText(value: unknown): string {
  if (typeof value !== "string") throw new BadRequest("text is required");
  const trimmed = value.trim();
  if (!trimmed) throw new BadRequest("Comment can't be empty");
  if (trimmed.length > 280) throw new BadRequest("Comment is too long (280 characters max)");
  return trimmed;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new BadRequest("Expected a JSON body");
  }
}
