import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldApplyConversationResult,
  upsertConversation,
} from "../src/state/conversations.js";
import {
  allocateMonthlyAmounts,
  sipFutureValue,
} from "../src/utils/finance.js";

test("stale conversation loads cannot overwrite the active conversation", () => {
  assert.equal(shouldApplyConversationResult("old", "new"), false);
  assert.equal(shouldApplyConversationResult("new", "new"), true);
});

test("conversation updates are deduplicated and ordered by activity", () => {
  const result = upsertConversation(
    [
      { _id: "a", updatedAt: "2025-01-01T00:00:00Z" },
      { _id: "b", updatedAt: "2025-01-02T00:00:00Z" },
    ],
    { _id: "a", title: "Updated", updatedAt: "2025-01-03T00:00:00Z" },
  );
  assert.deepEqual(result.map((item) => item._id), ["a", "b"]);
  assert.equal(result[0].title, "Updated");
});

test("monthly allocation rounding preserves the exact SIP total", () => {
  const amounts = allocateMonthlyAmounts(
    [
      { asset: "Equity", percent: 33 },
      { asset: "Debt", percent: 33 },
      { asset: "Gold", percent: 34 },
    ],
    10001,
  );
  assert.equal(Object.values(amounts).reduce((sum, value) => sum + value, 0), 10001);
});

test("SIP calculations handle zero returns without division errors", () => {
  assert.equal(sipFutureValue(1000, 0, 1), 12000);
  assert.equal(sipFutureValue(-1, 0.1, 10), 0);
});
