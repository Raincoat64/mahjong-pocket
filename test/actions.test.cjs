const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createInitialRound,
  getLegalActions,
  discardTile,
  drawTile,
  submitCallResponse,
  applyAction,
  submitKanRonResponse,
  forceExhaustiveDrawForTest
} = require("../dist-test/engine/round.js");

const alwaysRon = {
  canTsumo() { return false; },
  canRon() { return true; }
};
const neverWin = {
  canTsumo() { return false; },
  canRon() { return false; }
};

function setHand(state, id, tiles) {
  state.players[id].hand = tiles.slice();
}

function passAllDiscardResponses(state, validator = neverWin, now = 2000) {
  const discarder = state.pendingDiscard.discarder;
  for (const id of [0,1,2,3]) {
    if (id === discarder) continue;
    submitCallResponse(state, id, { type: "PASS" }, now++, validator);
  }
}

test("pon has priority over chi regardless of response submission order", () => {
  const state = createInitialRound(100, 1000);
  setHand(state, 0, ["m1","m1","m2","m2","p1","p2","p3","s1","s2","s3","E","S","W","m3"]);
  setHand(state, 1, ["m1","m2","m4","m5","m6","p1","p2","p3","s1","s2","s3","E","C"]);
  setHand(state, 2, ["m3","m3","p1","p2","p3","p4","p5","p6","s1","s2","s3","E","C"]);
  setHand(state, 3, ["m7","m8","m9","p1","p2","p3","p7","p8","p9","s1","s2","E","C"]);
  state.lastDrawnTile = "m3";

  discardTile(state, 0, 13, 1001, false, neverWin);
  const chi = getLegalActions(state, 1, neverWin).find(a => a.type === "CHI");
  const pon = getLegalActions(state, 2, neverWin).find(a => a.type === "PON");
  assert.ok(chi);
  assert.ok(pon);

  submitCallResponse(state, 1, chi, 1002, neverWin);
  submitCallResponse(state, 3, { type: "PASS" }, 1003, neverWin);
  submitCallResponse(state, 2, pon, 1004, neverWin);

  assert.equal(state.phase, "WAIT_DISCARD");
  assert.equal(state.currentPlayer, 2);
  assert.equal(state.players[2].melds.at(-1).type, "pon");
  assert.equal(state.players[1].melds.length, 0);
  assert.equal(state.players[0].river[0].calledBy, 2);
});

test("chi applies no-kuikae including suji kuikae", () => {
  const state = createInitialRound(101, 1000);
  setHand(state, 0, ["p1","p2","p3","p4","p5","p6","s1","s2","s3","E","S","W","C","m3"]);
  setHand(state, 1, ["m4","m5","m6","p1","p2","p3","p7","p8","p9","s1","s2","E","C"]);
  setHand(state, 2, ["m7","m8","p1","p2","p4","p5","p7","p8","s1","s2","E","F","C"]);
  setHand(state, 3, ["m7","m8","p1","p2","p4","p5","p7","p8","s1","s2","S","F","C"]);
  state.lastDrawnTile = "m3";

  discardTile(state, 0, 13, 1001, false, neverWin);
  const chi = getLegalActions(state, 1, neverWin)
    .find(a => a.type === "CHI" && a.tiles.map(x => x === "mr" ? "m5" : x).join(",") === "m3,m4,m5");
  assert.ok(chi);

  submitCallResponse(state, 1, chi, 1002, neverWin);
  submitCallResponse(state, 2, { type: "PASS" }, 1003, neverWin);
  submitCallResponse(state, 3, { type: "PASS" }, 1004, neverWin);

  assert.equal(state.currentPlayer, 1);
  assert.deepEqual(state.players[1].postCallForbiddenTypes.sort(), ["m3","m6"]);
  const discards = getLegalActions(state, 1, neverWin).filter(a => a.type === "DISCARD");
  assert.ok(!discards.some(a => a.tile === "m6"));
});

test("riichi deposit is paid only after the declaration discard survives ron", () => {
  const state = createInitialRound(102, 1000);
  setHand(state, 0, ["m1","m2","m3","m4","m5","m6","m7","m8","m9","p1","p2","p3","E","C"]);
  state.lastDrawnTile = "C";

  const riichi = getLegalActions(state, 0, neverWin).find(a => a.type === "RIICHI" && a.tile === "C");
  assert.ok(riichi);
  applyAction(state, 0, riichi, 1001, neverWin);

  assert.equal(state.phase, "WAIT_CALL");
  assert.equal(state.players[0].riichi, false);
  assert.equal(state.players[0].score, 25000);
  assert.equal(state.riichiSticks, 0);
  assert.equal(state.players[0].river.at(-1).riichi, true);

  passAllDiscardResponses(state, neverWin, 1002);
  assert.equal(state.players[0].riichi, true);
  assert.equal(state.players[0].score, 24000);
  assert.equal(state.riichiSticks, 1);
});

test("ron on a riichi declaration tile prevents the 1000-point deposit", () => {
  const state = createInitialRound(103, 1000);
  setHand(state, 0, ["m1","m2","m3","m4","m5","m6","m7","m8","m9","p1","p2","p3","E","C"]);
  state.lastDrawnTile = "C";
  const riichi = getLegalActions(state, 0, alwaysRon).find(a => a.type === "RIICHI" && a.tile === "C");
  assert.ok(riichi);
  applyAction(state, 0, riichi, 1001, alwaysRon);

  submitCallResponse(state, 1, { type: "RON", tile: "C" }, 1002, alwaysRon);
  submitCallResponse(state, 2, { type: "PASS" }, 1003, alwaysRon);
  submitCallResponse(state, 3, { type: "PASS" }, 1004, alwaysRon);

  assert.equal(state.phase, "WIN_RESOLUTION");
  assert.equal(state.winResult.type, "RON");
  assert.deepEqual(state.winResult.winners, [1]);
  assert.equal(state.players[0].riichi, false);
  assert.equal(state.players[0].score, 25000);
  assert.equal(state.riichiSticks, 0);
});

test("passing a valid ron creates temporary furiten until the player's next draw", () => {
  const state = createInitialRound(104, 1000);
  discardTile(state, 0, 0, 1001, false, alwaysRon);

  submitCallResponse(state, 1, { type: "PASS" }, 1002, alwaysRon);
  submitCallResponse(state, 2, { type: "PASS" }, 1003, alwaysRon);
  submitCallResponse(state, 3, { type: "PASS" }, 1004, alwaysRon);

  assert.equal(state.players[1].temporaryFuriten, true);
  assert.equal(state.phase, "DRAW");
  drawTile(state, 1, 1005);
  assert.equal(state.players[1].temporaryFuriten, false);
});

test("passing ron after riichi creates persistent riichi furiten", () => {
  const state = createInitialRound(105, 1000);
  state.players[1].riichi = true;
  discardTile(state, 0, 0, 1001, false, alwaysRon);

  submitCallResponse(state, 1, { type: "PASS" }, 1002, alwaysRon);
  submitCallResponse(state, 2, { type: "PASS" }, 1003, alwaysRon);
  submitCallResponse(state, 3, { type: "PASS" }, 1004, alwaysRon);

  assert.equal(state.players[1].riichiFuriten, true);
  drawTile(state, 1, 1005);
  assert.equal(state.players[1].riichiFuriten, true);
});

test("triple ron resolves as sancha-hou abortive draw", () => {
  const state = createInitialRound(106, 1000);
  discardTile(state, 0, 0, 1001, false, alwaysRon);
  const tile = state.pendingDiscard.tile;
  submitCallResponse(state, 1, { type: "RON", tile }, 1002, alwaysRon);
  submitCallResponse(state, 2, { type: "RON", tile }, 1003, alwaysRon);
  submitCallResponse(state, 3, { type: "RON", tile }, 1004, alwaysRon);
  assert.equal(state.phase, "DRAW_RESOLUTION");
  assert.equal(state.drawResult.reason, "TRIPLE_RON");
});

test("ankan draws from rinshan and reveals kan-dora immediately", () => {
  const state = createInitialRound(107, 1000);
  setHand(state, 0, ["m1","m1","m1","m1","m2","m3","m4","p1","p2","p3","s1","s2","E","C"]);
  state.lastDrawnTile = "C";
  const action = getLegalActions(state, 0, neverWin).find(a => a.type === "ANKAN" && a.tileType === "m1");
  assert.ok(action);
  const liveBefore = state.wall.rinshanDrawCount;
  const doraBefore = state.wall.revealedDoraCount;

  applyAction(state, 0, action, 1001, neverWin);
  assert.equal(state.players[0].melds.at(-1).type, "ankan");
  assert.equal(state.players[0].hand.length, 11);
  assert.equal(state.wall.rinshanDrawCount, liveBefore + 1);
  assert.equal(state.wall.revealedDoraCount, doraBefore + 1);
  assert.equal(state.lastDrawSource, "RINSHAN");
  assert.equal(state.phase, "WAIT_DISCARD");
});

test("kakan opens a chankan window and reveals kan-dora after the next discard", () => {
  const state = createInitialRound(108, 1000);
  state.players[0].melds = [{ type: "pon", tiles: ["m5","m5","mr"], calledFrom: 3, calledTile: "m5" }];
  setHand(state, 0, ["m5","m1","m2","m3","p1","p2","p3","s1","s2","s3","E"]);
  state.lastDrawnTile = "E";

  const kakan = getLegalActions(state, 0, neverWin).find(a => a.type === "KAKAN" && a.tile === "m5");
  assert.ok(kakan);
  const doraBefore = state.wall.revealedDoraCount;
  applyAction(state, 0, kakan, 1001, neverWin);
  assert.equal(state.phase, "WAIT_KAN_RON");

  for (const id of [1,2,3]) submitKanRonResponse(state, id, { type: "PASS" }, 1001 + id, neverWin);
  assert.equal(state.phase, "WAIT_DISCARD");
  assert.equal(state.players[0].melds[0].type, "kakan");
  assert.equal(state.lastDrawSource, "RINSHAN");
  assert.equal(state.wall.revealedDoraCount, doraBefore);
  assert.equal(state.pendingKanDoraReveal, true);

  const discard = getLegalActions(state, 0, neverWin).find(a => a.type === "DISCARD");
  assert.ok(discard);
  applyAction(state, 0, discard, 1010, neverWin);
  assert.equal(state.wall.revealedDoraCount, doraBefore + 1);
  assert.equal(state.pendingKanDoraReveal, false);
});

test("exhaustive draw applies the 3000-point noten penalty", () => {
  const state = createInitialRound(109, 1000);
  const tenpai = ["m1","m2","m3","m4","m5","m6","m7","m8","m9","p1","p2","p3","E"];
  const noten = ["m1","m1","m4","m7","p1","p4","p7","s1","s4","s7","E","F","C"];
  setHand(state, 0, tenpai);
  setHand(state, 1, tenpai);
  setHand(state, 2, noten);
  setHand(state, 3, noten);
  const before = state.players.map(p => p.score);

  forceExhaustiveDrawForTest(state, 2000);
  assert.equal(state.drawResult.reason, "EXHAUSTIVE");
  assert.deepEqual(state.drawResult.tenpaiPlayers, [0,1]);
  assert.deepEqual(state.drawResult.pointChanges, [1500,1500,-1500,-1500]);
  assert.deepEqual(state.players.map((p,i) => p.score - before[i]), [1500,1500,-1500,-1500]);
});

test("four identical first wind discards resolve as four-winds abortive draw", () => {
  const state = createInitialRound(110, 1000);
  state.callsMade = 0;
  for (const id of [0,1,2]) state.players[id].river = [{ tile: "E", tsumogiri: false, riichi: false }];
  setHand(state, 3, ["m1","m2","m3","m4","m5","m6","p1","p2","p3","s1","s2","s3","C","E"]);
  state.currentPlayer = 3;
  state.phase = "WAIT_DISCARD";
  state.lastDrawnTile = "E";
  discardTile(state, 3, 13, 1001, false, neverWin);
  for (const id of [0,1,2]) submitCallResponse(state, id, { type: "PASS" }, 1002 + id, neverWin);
  assert.equal(state.phase, "DRAW_RESOLUTION");
  assert.equal(state.drawResult.reason, "FOUR_WINDS");
});

test("fourth established riichi resolves as four-riichi abortive draw", () => {
  const state = createInitialRound(111, 1000);
  for (const id of [0,1,2]) {
    state.players[id].riichi = true;
    state.players[id].score = 24000;
  }
  setHand(state, 3, ["m1","m2","m3","m4","m5","m6","m7","m8","m9","p1","p2","p3","E","C"]);
  state.currentPlayer = 3;
  state.phase = "WAIT_DISCARD";
  state.lastDrawnTile = "C";
  const riichi = getLegalActions(state, 3, neverWin).find(a => a.type === "RIICHI" && a.tile === "C");
  assert.ok(riichi);
  applyAction(state, 3, riichi, 1001, neverWin);
  for (const id of [0,1,2]) submitCallResponse(state, id, { type: "PASS" }, 1002 + id, neverWin);
  assert.equal(state.drawResult.reason, "FOUR_RIICHI");
  assert.equal(state.players[3].score, 24000);
  assert.equal(state.riichiSticks, 1);
});

test("four kans by multiple players abort after the subsequent discard survives ron", () => {
  const state = createInitialRound(112, 1000);
  state.players[0].melds = [
    { type: "ankan", tiles: ["m1","m1","m1","m1"] },
    { type: "ankan", tiles: ["p1","p1","p1","p1"] }
  ];
  state.players[1].melds = [
    { type: "ankan", tiles: ["s1","s1","s1","s1"] },
    { type: "daiminkan", tiles: ["E","E","E","E"], calledFrom: 0, calledTile: "E" }
  ];
  setHand(state, 0, ["m2","m3","m4","p2","p3","p4","s2","C"]);
  state.currentPlayer = 0;
  state.phase = "WAIT_DISCARD";
  state.lastDrawnTile = "C";
  discardTile(state, 0, 7, 1001, false, neverWin);
  for (const id of [1,2,3]) submitCallResponse(state, id, { type: "PASS" }, 1002 + id, neverWin);
  assert.equal(state.phase, "DRAW_RESOLUTION");
  assert.equal(state.drawResult.reason, "FOUR_KANS");
});

test("kyuushu kyuuhai is available only on an uninterrupted first draw", () => {
  const state = createInitialRound(113, 1000);
  setHand(state, 0, ["m1","m9","p1","p9","s1","s9","E","S","W","N","P","F","C","m2"]);
  state.lastDrawnTile = "m2";
  const action = getLegalActions(state, 0, neverWin).find(a => a.type === "KYUUSHU_KYUUHAI");
  assert.ok(action);
  applyAction(state, 0, action, 1001, neverWin);
  assert.equal(state.phase, "DRAW_RESOLUTION");
  assert.equal(state.drawResult.reason, "KYUUSHU_KYUUHAI");
});

test("double ron keeps both winners in turn-order priority", () => {
  const state = createInitialRound(114, 1000);
  discardTile(state, 0, 0, 1001, false, alwaysRon);
  const tile = state.pendingDiscard.tile;
  submitCallResponse(state, 3, { type: "RON", tile }, 1002, alwaysRon);
  submitCallResponse(state, 2, { type: "PASS" }, 1003, alwaysRon);
  submitCallResponse(state, 1, { type: "RON", tile }, 1004, alwaysRon);
  assert.equal(state.phase, "WIN_RESOLUTION");
  assert.deepEqual(state.winResult.winners, [1,3]);
});

test("chankan ron interrupts kakan before the meld or wall is modified", () => {
  const state = createInitialRound(115, 1000);
  state.players[0].melds = [{ type: "pon", tiles: ["m5","m5","mr"], calledFrom: 3, calledTile: "m5" }];
  setHand(state, 0, ["m5","m1","m2","m3","p1","p2","p3","s1","s2","s3","E"]);
  state.lastDrawnTile = "E";
  const kakan = getLegalActions(state, 0, alwaysRon).find(a => a.type === "KAKAN");
  assert.ok(kakan);
  applyAction(state, 0, kakan, 1001, alwaysRon);
  const rinshanBefore = state.wall.rinshanDrawCount;

  submitKanRonResponse(state, 1, { type: "PASS" }, 1002, alwaysRon);
  submitKanRonResponse(state, 2, { type: "RON", tile: kakan.tile }, 1003, alwaysRon);
  submitKanRonResponse(state, 3, { type: "PASS" }, 1004, alwaysRon);

  assert.equal(state.phase, "WIN_RESOLUTION");
  assert.equal(state.winResult.context, "CHANKAN");
  assert.deepEqual(state.winResult.winners, [2]);
  assert.equal(state.players[0].melds[0].type, "pon");
  assert.equal(state.wall.rinshanDrawCount, rinshanBefore);
});

test("riichi locks normal discards to tsumogiri", () => {
  const state = createInitialRound(116, 1000);
  state.players[0].riichi = true;
  const discards = getLegalActions(state, 0, neverWin).filter(a => a.type === "DISCARD");
  assert.equal(discards.length, 1);
  assert.equal(discards[0].tileIndex, state.players[0].hand.length - 1);
});

test("riichi ankan does not allow okuri-kan when the drawn tile is unrelated", () => {
  const state = createInitialRound(117, 1000);
  setHand(state, 0, ["m1","m1","m1","m1","m2","m3","m4","p1","p2","p3","s1","s2","E","C"]);
  state.players[0].riichi = true;
  state.lastDrawnTile = "C";
  const ankan = getLegalActions(state, 0, neverWin).filter(a => a.type === "ANKAN");
  assert.equal(ankan.length, 0);
});

test("riichi on the player's uninterrupted first discard is recorded as double riichi", () => {
  const state = createInitialRound(116, 1000);
  setHand(state, 0, ["m1","m2","m3","m4","m5","m6","m7","m8","m9","p1","p2","p3","E","C"]);
  state.lastDrawnTile = "C";
  const riichi = getLegalActions(state, 0, neverWin).find(a => a.type === "RIICHI" && a.tile === "C");
  assert.ok(riichi);
  applyAction(state, 0, riichi, 1001, neverWin);
  passAllDiscardResponses(state, neverWin, 1002);
  assert.equal(state.players[0].riichi, true);
  assert.equal(state.players[0].doubleRiichi, true);
});
