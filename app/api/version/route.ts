import { ok } from "@/lib/http";
import { BUILD_ID, BUILT_AT } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * GET /api/version — which build this deployment is.
 *
 * A tab that has been open since before the last deploy is still running the
 * old bundle; asking here is how it finds out. No database work, so it stays
 * cheap enough to poll from a phone.
 */
export async function GET() {
  return ok({ build: BUILD_ID, builtAt: BUILT_AT });
}
