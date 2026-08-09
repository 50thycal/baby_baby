import { fail, ok } from "@/lib/http";
import { captureSnapshot, listSnapshots } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await listSnapshots());
  } catch (err) {
    return fail(err);
  }
}

/** Take one on demand — useful right before letting someone loose on the app. */
export async function POST() {
  try {
    const id = await captureSnapshot("manual");
    return ok({ id }, 201);
  } catch (err) {
    return fail(err);
  }
}
