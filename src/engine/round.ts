import { DeterministicRandom } from "../core/random";
import { TileCode, TileType, tileType, isHonor, tileRank } from "../core/tile";
import {
  CallAction,
  DrawResult,
  LegalAction,
  PlayerId,
  PlayerState,
  RoundState,
  Wind
} from "../core/types";
import {
  createYonmaWall,
  drawFromWall,
  drawRinshanTile,
  remainingLiveTiles,
  revealKanDora
} from "../core/wall";
import {
  SHAPE_ONLY_WIN_VALIDATOR,
  WinValidator,
  forbiddenAfterCall,
  getLegalActionsByPhase,
  isFourKansAbortive,
  isFourRiichiAbortive,
  isFourWindsAbortive,
  nextPlayer,
  seatDistance
} from "../rules/action-rules";
import { calculateShanten, calculateWaits } from "../hint/shanten";

const WINDS: readonly Wind[] = ["E", "S", "W", "N"];
const PLAYER_IDS: readonly PlayerId[] = [0, 1, 2, 3];

function nowOr(now?: number): number {
  return now ?? Date.now();
}

function cancelIppatsu(state: RoundState): void {
  for (const player of state.players) player.ippatsuEligible = false;
}

function removeIndexes(hand: TileCode[], indexes: readonly number[]): TileCode[] {
  const sorted = [...indexes].sort((a, b) => b - a);
  const removed: TileCode[] = [];
  for (const index of sorted) {
    if (index < 0 || index >= hand.length) throw new Error("INVALID_TILE_INDEX");
    removed.push(hand.splice(index, 1)[0]);
  }
  return removed.reverse();
}

function actionFingerprint(action: LegalAction): string {
  const normalized: Record<string, unknown> = { ...action };
  if ("consumeIndexes" in action) normalized.consumeIndexes = [...action.consumeIndexes].sort((a, b) => a - b);
  if ("waits" in action) normalized.waits = [...action.waits].sort();
  return JSON.stringify(normalized);
}

function assertLegalAction(
  state: RoundState,
  playerId: PlayerId,
  action: LegalAction,
  winValidator: WinValidator
): void {
  const legal = getLegalActions(state, playerId, winValidator);
  const target = actionFingerprint(action);
  if (!legal.some((candidate) => actionFingerprint(candidate) === target)) {
    throw new Error(`ILLEGAL_ACTION:${action.type}`);
  }
}

export interface RoundInit {
  seed: number;
  now?: number;
  scores?: readonly number[];
  dealer?: PlayerId;
  roundWind?: Wind;
  handNumber?: 1 | 2 | 3 | 4;
  honba?: number;
  riichiSticks?: number;
  gameId?: string;
}

export function createRound(init: RoundInit): RoundState {
  const now = init.now ?? Date.now();
  const seed = init.seed;
  const wall = createYonmaWall(seed);
  const dealer: PlayerId = init.dealer ?? 0;
  const scores = init.scores ?? [25000, 25000, 25000, 25000];
  if (scores.length !== 4) throw new Error("FOUR_SCORES_REQUIRED");
  const players: PlayerState[] = PLAYER_IDS.map((id) => ({
    id,
    wind: WINDS[(id - dealer + 4) % 4],
    score: scores[id],
    hand: [],
    river: [],
    melds: [],
    riichi: false,
    doubleRiichi: false,
    ippatsuEligible: false,
    temporaryFuriten: false,
    riichiFuriten: false,
    postCallForbiddenTypes: []
  }));

  for (let i = 0; i < 13; i++) {
    for (const player of players) player.hand.push(drawFromWall(wall));
  }

  const dealerDraw = drawFromWall(wall);
  players[dealer].hand.push(dealerDraw);

  const rng = new DeterministicRandom(wall.rng);

  return {
    schemaVersion: 3,
    gameId: init.gameId ?? `round-${seed}-${now}`,
    seed,
    phase: "WAIT_DISCARD",
    roundWind: init.roundWind ?? "E",
    handNumber: init.handNumber ?? 1,
    honba: init.honba ?? 0,
    riichiSticks: init.riichiSticks ?? 0,
    dealer,
    currentPlayer: dealer,
    players,
    wall,
    lastDrawnTile: dealerDraw,
    lastDrawSource: "WALL",
    pendingKanDoraReveal: false,
    callsMade: 0,
    discardSerial: 0,
    rng: rng.state(),
    createdAt: now,
    updatedAt: now
  };
}

export function createInitialRound(seed: number, now = Date.now()): RoundState {
  return createRound({ seed, now });
}

export function getLegalActions(
  state: RoundState,
  playerId: PlayerId,
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): LegalAction[] {
  return getLegalActionsByPhase(state, playerId, winValidator);
}

function finalizeRiichiDeclaration(state: RoundState): void {
  const pending = state.pendingDiscard;
  if (!pending?.riichiDeclaration) return;
  const player = state.players[pending.discarder];
  if (player.riichi) return;
  if (player.score < 1000) throw new Error("INSUFFICIENT_SCORE_FOR_RIICHI");
  player.score -= 1000;
  state.riichiSticks++;
  player.riichi = true;
  player.doubleRiichi = pending.riverIndex === 0 && state.callsMade === 0;
  player.riichiTurn = pending.riverIndex;
  player.ippatsuEligible = true;
}

export function discardTile(
  state: RoundState,
  playerId: PlayerId,
  tileIndex: number,
  now = Date.now(),
  declareRiichi = false,
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): TileCode {
  if (state.phase !== "WAIT_DISCARD") throw new Error("NOT_WAITING_FOR_DISCARD");
  if (state.currentPlayer !== playerId) throw new Error("NOT_CURRENT_PLAYER");

  const player = state.players[playerId];
  if (tileIndex < 0 || tileIndex >= player.hand.length) throw new Error("INVALID_TILE_INDEX");

  const action: LegalAction = declareRiichi
    ? (() => {
        const found = getLegalActions(state, playerId, winValidator)
          .find((a): a is Extract<LegalAction, { type: "RIICHI" }> =>
            a.type === "RIICHI" && a.tileIndex === tileIndex && a.tile === player.hand[tileIndex]);
        if (!found) throw new Error("ILLEGAL_RIICHI");
        return found;
      })()
    : { type: "DISCARD", tileIndex, tile: player.hand[tileIndex] };

  assertLegalAction(state, playerId, action, winValidator);

  const wasRiichi = player.riichi;
  const tsumogiri = state.lastDrawnTile !== undefined && tileIndex === player.hand.length - 1;
  const [tile] = player.hand.splice(tileIndex, 1);
  const riverIndex = player.river.length;
  const discardDrawSource = state.lastDrawSource ?? (player.postCallForbiddenTypes.length ? "CALL" : undefined);
  const fallbackSerial = state.players.reduce((sum, p) => sum + p.river.length, 0);
  const sequence = (state.discardSerial ?? fallbackSerial) + 1;
  state.discardSerial = sequence;
  player.river.push({ tile, tsumogiri, riichi: declareRiichi, sequence });

  if (wasRiichi && !declareRiichi) player.ippatsuEligible = false;
  player.postCallForbiddenTypes = [];

  if (state.pendingKanDoraReveal) {
    revealKanDora(state.wall);
    state.pendingKanDoraReveal = false;
  }

  state.pendingDiscard = {
    discarder: playerId,
    tile,
    riverIndex,
    riichiDeclaration: declareRiichi,
    drawSource: discardDrawSource,
    responses: {}
  };
  state.lastDrawnTile = undefined;
  state.lastDrawSource = undefined;
  state.phase = "WAIT_CALL";
  state.updatedAt = now;
  return tile;
}

export function drawTile(state: RoundState, playerId: PlayerId, now = Date.now()): TileCode {
  if (state.phase !== "DRAW") throw new Error("NOT_WAITING_FOR_DRAW");
  if (state.currentPlayer !== playerId) throw new Error("NOT_CURRENT_PLAYER");

  const tile = drawFromWall(state.wall);
  const player = state.players[playerId];
  player.hand.push(tile);
  player.temporaryFuriten = false;
  player.postCallForbiddenTypes = [];
  state.lastDrawnTile = tile;
  state.lastDrawSource = "WALL";
  state.phase = "WAIT_DISCARD";
  state.updatedAt = now;
  return tile;
}

function setDrawResult(state: RoundState, result: DrawResult, now = Date.now()): void {
  state.drawResult = result;
  state.phase = "DRAW_RESOLUTION";
  state.pendingDiscard = undefined;
  state.pendingKan = undefined;
  state.lastDrawnTile = undefined;
  state.lastDrawSource = undefined;
  state.updatedAt = now;
}

function resolveExhaustiveDraw(state: RoundState, now = Date.now()): void {
  const tenpaiPlayers = state.players
    .filter((player) =>
      calculateShanten(player.hand, player.melds.length) === 0
      && calculateWaits(player.hand, player.melds.length).length > 0)
    .map((player) => player.id);

  const pointChanges = [0, 0, 0, 0];
  // Match the selected majiang-core rule: nagashi is a draw settlement.
  // No honba/deposit award or noten payment; multiple qualifiers all settle.
  const nagashiPlayers = state.players.filter(player => player.river.length > 0
    && player.river.every(d => d.calledBy == null && (isHonor(d.tile) || tileRank(d.tile) === 1 || tileRank(d.tile) === 9)))
    .map(player => player.id);
  if (nagashiPlayers.length) {
    for (const winner of nagashiPlayers) {
      for (const payer of state.players) {
        if (payer.id === winner) continue;
        const amount = winner === state.dealer || payer.id === state.dealer ? 4000 : 2000;
        pointChanges[payer.id] -= amount;
        pointChanges[winner] += amount;
      }
    }
    for (const player of state.players) player.score += pointChanges[player.id];
    setDrawResult(state, {reason: 'NAGASHI_MANGAN', nagashiPlayers, tenpaiPlayers, pointChanges}, now);
    return;
  }
  const n = tenpaiPlayers.length;
  if (n > 0 && n < 4) {
    const tenpaiGain = 3000 / n;
    const notenLoss = 3000 / (4 - n);
    for (const player of state.players) {
      pointChanges[player.id] = tenpaiPlayers.includes(player.id) ? tenpaiGain : -notenLoss;
      player.score += pointChanges[player.id];
    }
  }

  setDrawResult(state, { reason: "EXHAUSTIVE", tenpaiPlayers, pointChanges }, now);
}

function markCalledDiscard(state: RoundState, caller: PlayerId): void {
  const pending = state.pendingDiscard;
  if (!pending) throw new Error("NO_PENDING_DISCARD");
  const discard = state.players[pending.discarder].river[pending.riverIndex];
  if (!discard) throw new Error("PENDING_DISCARD_NOT_FOUND");
  discard.calledBy = caller;
}

function completeOpenCall(
  state: RoundState,
  caller: PlayerId,
  action: Extract<CallAction, { type: "CHI" | "PON" | "DAIMINKAN" }>,
  now = Date.now()
): void {
  const pending = state.pendingDiscard;
  if (!pending) throw new Error("NO_PENDING_DISCARD");
  const player = state.players[caller];

  removeIndexes(player.hand, action.consumeIndexes);
  markCalledDiscard(state, caller);
  player.melds.push({
    type: action.type === "CHI" ? "chi" : action.type === "PON" ? "pon" : "daiminkan",
    tiles: action.tiles.slice(),
    calledFrom: pending.discarder,
    calledTile: action.calledTile
  });

  state.callsMade++;
  cancelIppatsu(state);
  state.pendingDiscard = undefined;
  state.currentPlayer = caller;

  if (action.type === "CHI" || action.type === "PON") {
    player.postCallForbiddenTypes = forbiddenAfterCall(action);
    state.lastDrawnTile = undefined;
    state.lastDrawSource = undefined;
    state.phase = "WAIT_DISCARD";
  }
  else {
    const rinshan = drawRinshanTile(state.wall);
    player.hand.push(rinshan);
    player.temporaryFuriten = false;
    player.postCallForbiddenTypes = [];
    state.lastDrawnTile = rinshan;
    state.lastDrawSource = "RINSHAN";
    state.pendingKanDoraReveal = true;
    state.phase = "WAIT_DISCARD";
  }
  state.updatedAt = now;
}

function chooseCall(
  state: RoundState,
  responses: Array<{ playerId: PlayerId; action: CallAction }>
): { playerId: PlayerId; action: Extract<CallAction, { type: "CHI" | "PON" | "DAIMINKAN" }> } | undefined {
  const pending = state.pendingDiscard;
  if (!pending) return undefined;
  const calls = responses.filter((r): r is { playerId: PlayerId; action: Extract<CallAction, { type: "CHI" | "PON" | "DAIMINKAN" }> } =>
    ["CHI", "PON", "DAIMINKAN"].includes(r.action.type));
  if (!calls.length) return undefined;

  calls.sort((a, b) => {
    const priority = (action: CallAction) => action.type === "DAIMINKAN" || action.type === "PON" ? 2 : 1;
    const p = priority(b.action) - priority(a.action);
    if (p) return p;
    return seatDistance(pending.discarder, a.playerId) - seatDistance(pending.discarder, b.playerId);
  });
  return calls[0];
}

function registerMissedRon(
  state: RoundState,
  playerId: PlayerId,
  legalActions: readonly LegalAction[],
  chosen: LegalAction
): void {
  const hadRon = legalActions.some((a) => a.type === "RON");
  if (!hadRon || chosen.type === "RON") return;
  const player = state.players[playerId];
  if (player.riichi) player.riichiFuriten = true;
  else player.temporaryFuriten = true;
}

export function submitCallResponse(
  state: RoundState,
  playerId: PlayerId,
  action: CallAction,
  now = Date.now(),
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): void {
  if (state.phase !== "WAIT_CALL" || !state.pendingDiscard) throw new Error("NOT_WAITING_FOR_CALL");
  const legal = getLegalActions(state, playerId, winValidator);
  assertLegalAction(state, playerId, action, winValidator);
  registerMissedRon(state, playerId, legal, action);
  state.pendingDiscard.responses[playerId] = action;
  state.updatedAt = now;

  const expected = PLAYER_IDS.filter((id) => id !== state.pendingDiscard!.discarder);
  if (expected.every((id) => state.pendingDiscard!.responses[id])) {
    resolveCallWindow(state, now, winValidator);
  }
}

export function resolveCallWindow(
  state: RoundState,
  now = Date.now(),
  _winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): void {
  const pending = state.pendingDiscard;
  if (state.phase !== "WAIT_CALL" || !pending) throw new Error("NO_CALL_WINDOW");
  const expected = PLAYER_IDS.filter((id) => id !== pending.discarder);
  if (!expected.every((id) => pending.responses[id])) throw new Error("CALL_RESPONSES_INCOMPLETE");

  const responses = expected.map((playerId) => ({ playerId, action: pending.responses[playerId]! }));
  const ronWinners = responses
    .filter((r) => r.action.type === "RON")
    .map((r) => r.playerId)
    .sort((a, b) => seatDistance(pending.discarder, a) - seatDistance(pending.discarder, b));

  if (ronWinners.length === 3) {
    setDrawResult(state, { reason: "TRIPLE_RON" }, now);
    return;
  }
  if (ronWinners.length > 0) {
    state.winResult = {
      type: "RON",
      winners: ronWinners,
      loser: pending.discarder,
      winningTile: pending.tile,
      context: "DISCARD",
      discardDrawSource: pending.drawSource
    };
    state.phase = "WIN_RESOLUTION";
    state.pendingDiscard = undefined;
    state.updatedAt = now;
    return;
  }

  // A riichi declaration is established only after its discard survives ron.
  finalizeRiichiDeclaration(state);

  if (isFourRiichiAbortive(state)) {
    setDrawResult(state, { reason: "FOUR_RIICHI" }, now);
    return;
  }
  if (isFourWindsAbortive(state)) {
    setDrawResult(state, { reason: "FOUR_WINDS" }, now);
    return;
  }
  if (isFourKansAbortive(state)) {
    setDrawResult(state, { reason: "FOUR_KANS" }, now);
    return;
  }
  if (remainingLiveTiles(state.wall) <= 0) {
    resolveExhaustiveDraw(state, now);
    return;
  }

  const call = chooseCall(state, responses);
  if (call) {
    completeOpenCall(state, call.playerId, call.action, now);
    return;
  }

  state.pendingDiscard = undefined;
  state.currentPlayer = nextPlayer(pending.discarder);
  state.phase = "DRAW";
  state.updatedAt = now;
}

export function declareTsumo(
  state: RoundState,
  playerId: PlayerId,
  now = Date.now(),
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): void {
  const action = getLegalActions(state, playerId, winValidator)
    .find((a): a is Extract<LegalAction, { type: "TSUMO" }> => a.type === "TSUMO");
  if (!action) throw new Error("ILLEGAL_TSUMO");
  state.winResult = {
    type: "TSUMO",
    winners: [playerId],
    winningTile: action.tile,
    context: state.lastDrawSource === "RINSHAN" ? "RINSHAN" : undefined
  };
  state.phase = "WIN_RESOLUTION";
  state.updatedAt = now;
}

export function declareKyuushuKyuuhai(
  state: RoundState,
  playerId: PlayerId,
  now = Date.now(),
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): void {
  const legal = getLegalActions(state, playerId, winValidator);
  if (!legal.some((a) => a.type === "KYUUSHU_KYUUHAI")) throw new Error("ILLEGAL_KYUUSHU_KYUUHAI");
  setDrawResult(state, { reason: "KYUUSHU_KYUUHAI" }, now);
}

export function declareAnkan(
  state: RoundState,
  playerId: PlayerId,
  action: Extract<LegalAction, { type: "ANKAN" }>,
  now = Date.now(),
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): void {
  assertLegalAction(state, playerId, action, winValidator);
  const player = state.players[playerId];
  const tiles = removeIndexes(player.hand, action.consumeIndexes);
  player.melds.push({ type: "ankan", tiles });
  state.callsMade++;
  cancelIppatsu(state);
  revealKanDora(state.wall); // Tenhou-style: ankan dora is immediate.
  const rinshan = drawRinshanTile(state.wall);
  player.hand.push(rinshan);
  player.temporaryFuriten = false;
  state.currentPlayer = playerId;
  state.lastDrawnTile = rinshan;
  state.lastDrawSource = "RINSHAN";
  state.phase = "WAIT_DISCARD";
  state.updatedAt = now;
}

export function declareKakan(
  state: RoundState,
  playerId: PlayerId,
  action: Extract<LegalAction, { type: "KAKAN" }>,
  now = Date.now(),
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): void {
  assertLegalAction(state, playerId, action, winValidator);
  state.pendingKan = {
    playerId,
    meldIndex: action.meldIndex,
    tileIndex: action.tileIndex,
    tile: action.tile,
    responses: {}
  };
  state.phase = "WAIT_KAN_RON";
  state.updatedAt = now;
}

function finalizeKakan(state: RoundState, now = Date.now()): void {
  const pending = state.pendingKan;
  if (!pending) throw new Error("NO_PENDING_KAN");
  const player = state.players[pending.playerId];
  const meld = player.melds[pending.meldIndex];
  if (!meld || meld.type !== "pon") throw new Error("KAKAN_SOURCE_PON_NOT_FOUND");
  if (pending.tileIndex < 0 || pending.tileIndex >= player.hand.length) throw new Error("KAKAN_TILE_NOT_FOUND");

  const [tile] = player.hand.splice(pending.tileIndex, 1);
  meld.type = "kakan";
  meld.tiles.push(tile);
  state.callsMade++;
  cancelIppatsu(state);
  state.pendingKan = undefined;
  state.currentPlayer = pending.playerId;

  const rinshan = drawRinshanTile(state.wall);
  player.hand.push(rinshan);
  player.temporaryFuriten = false;
  player.postCallForbiddenTypes = [];
  state.lastDrawnTile = rinshan;
  state.lastDrawSource = "RINSHAN";
  state.pendingKanDoraReveal = true; // Kakan dora is revealed after the subsequent discard.
  state.phase = "WAIT_DISCARD";
  state.updatedAt = now;
}

export function submitKanRonResponse(
  state: RoundState,
  playerId: PlayerId,
  action: Extract<LegalAction, { type: "PASS" | "RON" }>,
  now = Date.now(),
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): void {
  if (state.phase !== "WAIT_KAN_RON" || !state.pendingKan) throw new Error("NOT_WAITING_FOR_KAN_RON");
  const legal = getLegalActions(state, playerId, winValidator);
  assertLegalAction(state, playerId, action, winValidator);
  registerMissedRon(state, playerId, legal, action);
  state.pendingKan.responses[playerId] = action;
  state.updatedAt = now;

  const expected = PLAYER_IDS.filter((id) => id !== state.pendingKan!.playerId);
  if (expected.every((id) => state.pendingKan!.responses[id])) resolveKanRonWindow(state, now);
}

export function resolveKanRonWindow(state: RoundState, now = Date.now()): void {
  const pending = state.pendingKan;
  if (state.phase !== "WAIT_KAN_RON" || !pending) throw new Error("NO_KAN_RON_WINDOW");
  const expected = PLAYER_IDS.filter((id) => id !== pending.playerId);
  if (!expected.every((id) => pending.responses[id])) throw new Error("KAN_RON_RESPONSES_INCOMPLETE");

  const winners = expected
    .filter((id) => pending.responses[id]!.type === "RON")
    .sort((a, b) => seatDistance(pending.playerId, a) - seatDistance(pending.playerId, b));

  if (winners.length === 3) {
    setDrawResult(state, { reason: "TRIPLE_RON" }, now);
    return;
  }
  if (winners.length > 0) {
    state.winResult = {
      type: "RON",
      winners,
      loser: pending.playerId,
      winningTile: pending.tile,
      context: "CHANKAN"
    };
    state.phase = "WIN_RESOLUTION";
    state.pendingKan = undefined;
    state.updatedAt = now;
    return;
  }
  finalizeKakan(state, now);
}

export function applyAction(
  state: RoundState,
  playerId: PlayerId,
  action: LegalAction,
  now = Date.now(),
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): void {
  switch (action.type) {
    case "DRAW":
      assertLegalAction(state, playerId, action, winValidator);
      drawTile(state, playerId, now);
      return;
    case "DISCARD":
      discardTile(state, playerId, action.tileIndex, now, false, winValidator);
      return;
    case "RIICHI":
      discardTile(state, playerId, action.tileIndex, now, true, winValidator);
      return;
    case "TSUMO":
      declareTsumo(state, playerId, now, winValidator);
      return;
    case "KYUUSHU_KYUUHAI":
      declareKyuushuKyuuhai(state, playerId, now, winValidator);
      return;
    case "ANKAN":
      declareAnkan(state, playerId, action, now, winValidator);
      return;
    case "KAKAN":
      declareKakan(state, playerId, action, now, winValidator);
      return;
    case "PASS":
    case "RON":
      if (state.phase === "WAIT_KAN_RON") {
        submitKanRonResponse(state, playerId, action, now, winValidator);
      }
      else {
        submitCallResponse(state, playerId, action, now, winValidator);
      }
      return;
    case "CHI":
    case "PON":
    case "DAIMINKAN":
      submitCallResponse(state, playerId, action, now, winValidator);
      return;
  }
}

export function cloneRoundState(state: RoundState): RoundState {
  return JSON.parse(JSON.stringify(state)) as RoundState;
}

export function serializeRoundState(state: RoundState): string {
  return JSON.stringify(state);
}

function migrateV1(raw: any): any {
  raw.schemaVersion = 2;
  raw.players = raw.players.map((player: any) => ({
    ...player,
    ippatsuEligible: false,
    temporaryFuriten: false,
    riichiFuriten: false,
    postCallForbiddenTypes: []
  }));
  raw.wall = {
    ...raw.wall,
    rinshanDrawCount: raw.wall.rinshanDrawCount ?? 0,
    revealedDoraCount: raw.wall.revealedDoraCount ?? 1
  };
  raw.pendingKanDoraReveal = false;
  raw.callsMade = raw.players.reduce((sum: number, player: any) => sum + (player.melds?.length ?? 0), 0);
  return raw;
}

function migrateV2(raw: any): RoundState {
  raw.schemaVersion = 3;
  raw.players = raw.players.map((player: any) => ({
    ...player,
    doubleRiichi: player.doubleRiichi ?? false
  }));
  if (raw.pendingDiscard && !("drawSource" in raw.pendingDiscard)) raw.pendingDiscard.drawSource = undefined;
  return raw as RoundState;
}

export function restoreRoundState(serialized: string): RoundState {
  let parsed = JSON.parse(serialized) as any;
  if (parsed.schemaVersion === 1) parsed = migrateV1(parsed);
  if (parsed.schemaVersion === 2) return migrateV2(parsed);
  if (parsed.schemaVersion !== 3) throw new Error("UNSUPPORTED_SCHEMA_VERSION");
  return parsed as RoundState;
}

export function forceExhaustiveDrawForTest(state: RoundState, now = Date.now()): void {
  resolveExhaustiveDraw(state, now);
}
