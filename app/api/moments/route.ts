import { db } from "@/lib/db";
import { BadRequest, fail, ok, parseTimestamp, readJson } from "@/lib/http";
import { MOMENT_KINDS, type Moment, type MomentKind } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseKind(value: unknown): MomentKind {
  if (typeof value !== "string" || !MOMENT_KINDS.includes(value as MomentKind)) {
    throw new BadRequest(`kind must be one of: ${MOMENT_KINDS.join(", ")}`);
  }
  return value as MomentKind;
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const kind = parseKind(body.kind);
    const ts = parseTimestamp(body.ts);

    const sql = await db();
    const rows = (await sql`
      INSERT INTO moments (kind, ts) VALUES (${kind}, ${ts.toISOString()})
      RETURNING *`) as Moment[];

    return ok(rows[0], 201);
  } catch (err) {
    return fail(err);
  }
}
