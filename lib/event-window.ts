import { BadRequest, parseTimestamp } from "./http";
import { HOUR } from "./time";
import { ALL_TIME_FLOOR, RANGES, rangeHours, type RangeKey } from "./types";

/** Explicit windows load old entry context without fetching the entire history. */
export function eventWindow(params: URLSearchParams, now = new Date()) {
  if (params.has("start") || params.has("end")) {
    const start = parseTimestamp(params.get("start"), "start");
    const end = parseTimestamp(params.get("end"), "end");
    if (end <= start || end.getTime() - start.getTime() > 72 * HOUR) {
      throw new BadRequest("Choose a time window greater than zero and at most 72 hours");
    }
    return { start, end };
  }
  const key = params.get("range") ?? "24h";
  const hours = rangeHours((RANGES.some((r) => r.key === key) ? key : "24h") as RangeKey);
  return {
    start: hours === null ? new Date(ALL_TIME_FLOOR) : new Date(now.getTime() - hours * HOUR),
    end: now,
  };
}
