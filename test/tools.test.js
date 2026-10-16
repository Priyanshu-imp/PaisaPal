import test from "node:test";
import assert from "node:assert/strict";
import { parseDate, monthRange } from "../src/dates.js";

test("monthRange returns start-inclusive and next-month exclusive boundaries", () => {
  assert.deepEqual(monthRange("2026-10"), { start: "2026-10-01", end: "2026-11-01" });
});

test("parseDate resolves an explicit ISO date", () => {
  assert.equal(parseDate("2026-01-12", new Date("2026-10-16T12:00:00Z")), "2026-01-12");
});
