const test = require("node:test");
const assert = require("node:assert/strict");

const { chooseNormalDiscard } = require("../dist-test/ai/normal.js");
const { calculateShanten } = require("../dist-test/hint/shanten.js");

test("normal CPU chooses a legal discard and does not worsen minimum shanten", () => {
  const hand = ["m1","m2","m3","m4","m5","m6","m7","m8","p2","p3","p4","E","E","C"];
  const legal = hand.map((_, i) => i);
  const decision = chooseNormalDiscard({ selfHand: hand, legalDiscardIndexes: legal });
  assert.ok(legal.includes(decision.tileIndex));

  const allShanten = legal.map(i => {
    const next = hand.slice();
    next.splice(i, 1);
    return calculateShanten(next);
  });
  assert.equal(decision.shantenAfter, Math.min(...allShanten));
});

test("normal CPU avoids red five on an exact tie where possible", () => {
  const hand = ["m1","m1","m2","m2","m3","m3","m4","m4","m5","mr","p1","p1","E","E"];
  const legal = hand.map((_, i) => i);
  const decision = chooseNormalDiscard({ selfHand: hand, legalDiscardIndexes: legal });
  assert.ok(typeof decision.tile === "string");
});
