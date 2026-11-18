import "./helpers/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
test("loads payment actions with mocks", async () => {
  const mod = await import("@/lib/creatorPaymentActions");
  assert.equal(typeof mod.recordCreatorPayout, "function");
});
