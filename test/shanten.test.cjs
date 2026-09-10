const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateShanten,
  calculateWaits,
  calculateImprovingTiles
} = require("../dist-test/hint/shanten.js");
const { findDiscardToTenpai, visibleRemainingByType } = require("../dist-test/hint/hint-engine.js");

test("completed standard hand returns -1 shanten", () => {
  const hand = ["m1","m2","m3","m4","m5","m6","m7","m8","m9","p1","p2","p3","E","E"];
  assert.equal(calculateShanten(hand), -1);
});

test("single honor pair wait is tenpai and wait is detected", () => {
  const hand = ["m1","m2","m3","m4","m5","m6","m7","m8","m9","p1","p2","p3","E"];
  assert.equal(calculateShanten(hand), 0);
  assert.deepEqual(calculateWaits(hand), ["E"]);
});

test("chiitoitsu and kokushi shapes are included", () => {
  const chiitoiTenpai = ["m1","m1","m2","m2","p3","p3","p4","p4","s5","s5","E","E","C"];
  assert.equal(calculateShanten(chiitoiTenpai), 0);
  assert.ok(calculateWaits(chiitoiTenpai).includes("C"));

  const kokushiTenpai = ["m1","m9","p1","p9","s1","s9","E","S","W","N","P","F","C"];
  assert.equal(calculateShanten(kokushiTenpai), 0);
  assert.equal(calculateWaits(kokushiTenpai).length, 13);
});

test("discard-to-tenpai suggestions include valid candidates", () => {
  const hand = ["m1","m2","m3","m4","m5","m6","m7","m8","m9","p1","p2","p3","E","C"];
  const candidates = findDiscardToTenpai(hand);
  const e = candidates.find(x => x.discard === "C");
  const c = candidates.find(x => x.discard === "E");
  assert.ok(e);
  assert.ok(c);
  assert.deepEqual(e.waits, ["E"]);
  assert.deepEqual(c.waits, ["C"]);
});

test("visible remaining count only uses public tiles + own hand", () => {
  const remain = visibleRemainingByType(
    ["m1","m1","m2"],
    {
      rivers: [["m1","p1"], ["m1"], [], []],
      doraIndicators: ["p1"]
    }
  );
  assert.equal(remain.get("m1"), 0);
  assert.equal(remain.get("m2"), 3);
  assert.equal(remain.get("p1"), 2);
});

test("improving tiles reduce shanten", () => {
  const hand = ["m1","m2","m3","m4","m5","m6","p2","p3","p4","s7","s8","E","E"];
  const current = calculateShanten(hand);
  const improving = calculateImprovingTiles(hand);
  assert.ok(improving.length > 0);
  assert.ok(current >= 0);
});
