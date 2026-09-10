import {
  CallAction,
  LegalAction,
  Meld,
  PlayerId,
  PlayerState,
  RoundState
} from "../core/types";
import {
  TileCode,
  TileType,
  isHonor,
  isTerminalOrHonor,
  tileRank,
  tileSuit,
  tileType
} from "../core/tile";
import { remainingLiveTiles } from "../core/wall";
import { calculateShanten, calculateWaits } from "../hint/shanten";

export type WinContext = "DISCARD" | "CHANKAN";

/**
 * Win legality is deliberately injectable. The production implementation will
 * be backed by @kobalab/majiang-core so yaku/fu/score legality is authoritative.
 * The default below validates hand shape only and is used by dependency-free
 * core tests in this milestone.
 */
export interface WinValidator {
  canTsumo(state: RoundState, playerId: PlayerId): boolean;
  canRon(
    state: RoundState,
    playerId: PlayerId,
    tile: TileCode,
    fromPlayer: PlayerId,
    context: WinContext
  ): boolean;
}

function openMeldCount(player: PlayerState): number {
  return player.melds.length;
}

export const SHAPE_ONLY_WIN_VALIDATOR: WinValidator = {
  canTsumo(state, playerId) {
    const player = state.players[playerId];
    return calculateShanten(player.hand, openMeldCount(player)) === -1;
  },
  canRon(state, playerId, tile) {
    const player = state.players[playerId];
    return calculateShanten([...player.hand, tile], openMeldCount(player)) === -1;
  }
};

export function nextPlayer(id: PlayerId): PlayerId {
  return ((id + 1) % 4) as PlayerId;
}

export function seatDistance(from: PlayerId, to: PlayerId): number {
  return (to - from + 4) % 4;
}

export function isMenzen(player: PlayerState): boolean {
  return player.melds.every((m) => m.type === "ankan");
}

export function totalKanCount(state: RoundState): number {
  return state.players.reduce(
    (sum, p) => sum + p.melds.filter((m) => ["daiminkan", "ankan", "kakan"].includes(m.type)).length,
    0
  );
}

function indexesOfType(hand: readonly TileCode[], type: TileType): number[] {
  const out: number[] = [];
  hand.forEach((tile, index) => {
    if (tileType(tile) === type) out.push(index);
  });
  return out;
}

function combinations<T>(items: readonly T[], count: number): T[][] {
  const out: T[][] = [];
  const visit = (start: number, acc: T[]) => {
    if (acc.length === count) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i <= items.length - (count - acc.length); i++) {
      acc.push(items[i]);
      visit(i + 1, acc);
      acc.pop();
    }
  };
  visit(0, []);
  return out;
}

function sameWaitSet(a: readonly TileType[], b: readonly TileType[]): boolean {
  if (a.length !== b.length) return false;
  const aa = [...a].sort();
  const bb = [...b].sort();
  return aa.every((v, i) => v === bb[i]);
}

export function isRiverFuriten(state: RoundState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  const waits = calculateWaits(player.hand, openMeldCount(player));
  if (!waits.length) return false;
  const discarded = new Set(player.river.map((d) => tileType(d.tile)));
  return waits.some((w) => discarded.has(w));
}

export function isRonFuriten(state: RoundState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return player.temporaryFuriten || player.riichiFuriten || isRiverFuriten(state, playerId);
}

function legalDiscardActions(state: RoundState, playerId: PlayerId): LegalAction[] {
  const player = state.players[playerId];
  const forbidden = new Set(player.postCallForbiddenTypes);

  if (player.riichi) {
    const index = player.hand.length - 1;
    if (index < 0) return [];
    const tile = player.hand[index];
    return forbidden.has(tileType(tile)) ? [] : [{ type: "DISCARD", tileIndex: index, tile }];
  }

  return player.hand.flatMap((tile, tileIndex) =>
    forbidden.has(tileType(tile)) ? [] : [{ type: "DISCARD" as const, tileIndex, tile }]
  );
}

function legalRiichiActions(state: RoundState, playerId: PlayerId): LegalAction[] {
  const player = state.players[playerId];
  if (player.riichi || !isMenzen(player) || player.score < 1000) return [];
  if (remainingLiveTiles(state.wall) < 4) return [];

  const out: LegalAction[] = [];
  for (const action of legalDiscardActions(state, playerId)) {
    if (action.type !== "DISCARD") continue;
    const next = player.hand.slice();
    next.splice(action.tileIndex, 1);
    if (calculateShanten(next, player.melds.length) !== 0) continue;
    const waits = calculateWaits(next, player.melds.length);
    if (!waits.length) continue;
    out.push({
      type: "RIICHI",
      tileIndex: action.tileIndex,
      tile: action.tile,
      waits
    });
  }
  return out;
}

function legalAnkanActions(state: RoundState, playerId: PlayerId): LegalAction[] {
  const player = state.players[playerId];
  if (remainingLiveTiles(state.wall) <= 0 || totalKanCount(state) >= 4) return [];

  const byType = new Map<TileType, number[]>();
  player.hand.forEach((tile, index) => {
    const type = tileType(tile);
    const list = byType.get(type) ?? [];
    list.push(index);
    byType.set(type, list);
  });

  const out: LegalAction[] = [];
  for (const [type, indexes] of byType) {
    if (indexes.length !== 4) continue;

    if (player.riichi) {
      // No okuri-kan: the drawn tile itself must complete the concealed kan.
      if (!state.lastDrawnTile || tileType(state.lastDrawnTile) !== type) continue;
      if (player.hand.length < 1 || tileType(player.hand[player.hand.length - 1]) !== type) continue;

      const baseline = player.hand.slice(0, -1);
      const waitsBefore = calculateWaits(baseline, player.melds.length);
      const after = player.hand.filter((_, index) => !indexes.includes(index));
      const waitsAfter = calculateWaits(after, player.melds.length + 1);
      if (!sameWaitSet(waitsBefore, waitsAfter)) continue;
    }

    out.push({ type: "ANKAN", tileType: type, consumeIndexes: indexes.slice() });
  }
  return out;
}

function legalKakanActions(state: RoundState, playerId: PlayerId): LegalAction[] {
  const player = state.players[playerId];
  if (player.riichi || remainingLiveTiles(state.wall) <= 0 || totalKanCount(state) >= 4) return [];
  const out: LegalAction[] = [];

  player.melds.forEach((meld, meldIndex) => {
    if (meld.type !== "pon") return;
    const type = tileType(meld.calledTile ?? meld.tiles[0]);
    player.hand.forEach((tile, tileIndex) => {
      if (tileType(tile) === type) out.push({ type: "KAKAN", meldIndex, tileIndex, tile });
    });
  });
  return out;
}

function canKyuushuKyuuhai(state: RoundState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (state.callsMade !== 0 || player.river.length !== 0 || !state.lastDrawnTile) return false;
  const distinct = new Set<TileType>();
  player.hand.forEach((tile) => {
    if (isTerminalOrHonor(tile)) distinct.add(tileType(tile));
  });
  return distinct.size >= 9;
}

export function getSelfTurnActions(
  state: RoundState,
  playerId: PlayerId,
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): LegalAction[] {
  if (state.phase !== "WAIT_DISCARD" || state.currentPlayer !== playerId) return [];
  const out: LegalAction[] = [];

  if (state.lastDrawnTile && winValidator.canTsumo(state, playerId)) {
    out.push({ type: "TSUMO", tile: state.lastDrawnTile });
  }
  if (canKyuushuKyuuhai(state, playerId)) out.push({ type: "KYUUSHU_KYUUHAI" });

  out.push(...legalAnkanActions(state, playerId));
  out.push(...legalKakanActions(state, playerId));
  out.push(...legalRiichiActions(state, playerId));
  out.push(...legalDiscardActions(state, playerId));
  return out;
}

function calledSequenceForbiddenTypes(calledType: TileType, start: number): TileType[] {
  const suit = tileSuit(calledType);
  if (suit === "z") return [calledType];
  const calledRank = tileRank(calledType);
  const out: TileType[] = [calledType];
  if (calledRank === start && calledRank + 3 <= 9) {
    out.push(`${suit}${calledRank + 3}` as TileType);
  }
  if (calledRank === start + 2 && calledRank - 3 >= 1) {
    out.push(`${suit}${calledRank - 3}` as TileType);
  }
  return [...new Set(out)];
}

export function forbiddenAfterCall(action: Extract<CallAction, { type: "CHI" | "PON" }>): TileType[] {
  if (action.type === "PON") return [tileType(action.calledTile)];
  const ranks = action.tiles.map(tileRank).sort((a, b) => a - b);
  return calledSequenceForbiddenTypes(tileType(action.calledTile), ranks[0]);
}

function hasLegalPostCallDiscard(
  player: PlayerState,
  consumeIndexes: readonly number[],
  forbidden: readonly TileType[]
): boolean {
  const removed = new Set(consumeIndexes);
  const forbiddenSet = new Set(forbidden);
  return player.hand.some((tile, index) => !removed.has(index) && !forbiddenSet.has(tileType(tile)));
}

function getPonActions(player: PlayerState, calledTile: TileCode): CallAction[] {
  const type = tileType(calledTile);
  const indexes = indexesOfType(player.hand, type);
  const out: CallAction[] = [];
  for (const pair of combinations(indexes, 2)) {
    const action: Extract<CallAction, { type: "PON" }> = {
      type: "PON",
      calledTile,
      consumeIndexes: pair,
      tiles: [calledTile, ...pair.map((i) => player.hand[i])]
    };
    if (hasLegalPostCallDiscard(player, pair, forbiddenAfterCall(action))) out.push(action);
  }
  return out;
}

function getDaiminkanActions(player: PlayerState, calledTile: TileCode): CallAction[] {
  const type = tileType(calledTile);
  const indexes = indexesOfType(player.hand, type);
  return combinations(indexes, 3).map((triple) => ({
    type: "DAIMINKAN" as const,
    calledTile,
    consumeIndexes: triple,
    tiles: [calledTile, ...triple.map((i) => player.hand[i])]
  }));
}

function getChiActions(player: PlayerState, calledTile: TileCode): CallAction[] {
  const calledType = tileType(calledTile);
  if (isHonor(calledType)) return [];
  const suit = tileSuit(calledType);
  const n = tileRank(calledType);
  const out: CallAction[] = [];

  for (const start of [n - 2, n - 1, n]) {
    if (start < 1 || start > 7) continue;
    const ranks = [start, start + 1, start + 2];
    const needed = ranks.filter((rank) => rank !== n);
    if (needed.length !== 2) continue;

    const aType = `${suit}${needed[0]}` as TileType;
    const bType = `${suit}${needed[1]}` as TileType;
    const aIndexes = indexesOfType(player.hand, aType);
    const bIndexes = indexesOfType(player.hand, bType);

    for (const ai of aIndexes) {
      for (const bi of bIndexes) {
        if (ai === bi) continue;
        const consumeIndexes = [ai, bi];
        const tileForRank = new Map<number, TileCode>();
        tileForRank.set(n, calledTile);
        tileForRank.set(needed[0], player.hand[ai]);
        tileForRank.set(needed[1], player.hand[bi]);
        const tiles = ranks.map((rank) => tileForRank.get(rank)!) as TileCode[];
        const action: Extract<CallAction, { type: "CHI" }> = {
          type: "CHI",
          calledTile,
          consumeIndexes,
          tiles
        };
        if (hasLegalPostCallDiscard(player, consumeIndexes, forbiddenAfterCall(action))) out.push(action);
      }
    }
  }

  // Red/normal variants can create duplicate structural options. Preserve distinct
  // actual tile consumption but remove exact index duplicates.
  const seen = new Set<string>();
  return out.filter((action) => {
    if (action.type !== "CHI") return true;
    const key = [...action.consumeIndexes].sort((a, b) => a - b).join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getDiscardCallActions(
  state: RoundState,
  playerId: PlayerId,
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): LegalAction[] {
  const pending = state.pendingDiscard;
  if (state.phase !== "WAIT_CALL" || !pending || playerId === pending.discarder) return [];
  if (pending.responses[playerId]) return [];

  const player = state.players[playerId];
  const out: LegalAction[] = [{ type: "PASS" }];

  if (!isRonFuriten(state, playerId)
      && winValidator.canRon(state, playerId, pending.tile, pending.discarder, "DISCARD")) {
    out.push({ type: "RON", tile: pending.tile });
  }

  if (player.riichi || remainingLiveTiles(state.wall) <= 0) return out;

  if (nextPlayer(pending.discarder) === playerId) out.push(...getChiActions(player, pending.tile));
  out.push(...getPonActions(player, pending.tile));
  if (totalKanCount(state) < 4) out.push(...getDaiminkanActions(player, pending.tile));
  return out;
}

export function getKanRonActions(
  state: RoundState,
  playerId: PlayerId,
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): LegalAction[] {
  const pending = state.pendingKan;
  if (state.phase !== "WAIT_KAN_RON" || !pending || playerId === pending.playerId) return [];
  if (pending.responses[playerId]) return [];
  const out: LegalAction[] = [{ type: "PASS" }];
  if (!isRonFuriten(state, playerId)
      && winValidator.canRon(state, playerId, pending.tile, pending.playerId, "CHANKAN")) {
    out.push({ type: "RON", tile: pending.tile });
  }
  return out;
}

export function getLegalActionsByPhase(
  state: RoundState,
  playerId: PlayerId,
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): LegalAction[] {
  if (state.phase === "WAIT_DISCARD") return getSelfTurnActions(state, playerId, winValidator);
  if (state.phase === "DRAW" && state.currentPlayer === playerId && remainingLiveTiles(state.wall) > 0) {
    return [{ type: "DRAW" }];
  }
  if (state.phase === "WAIT_CALL") return getDiscardCallActions(state, playerId, winValidator);
  if (state.phase === "WAIT_KAN_RON") return getKanRonActions(state, playerId, winValidator);
  return [];
}

export function isFourWindsAbortive(state: RoundState): boolean {
  if (state.callsMade !== 0) return false;
  if (!state.players.every((p) => p.river.length === 1)) return false;
  const tiles = state.players.map((p) => p.river[0].tile);
  if (!tiles.every((tile) => ["E", "S", "W", "N"].includes(tile))) return false;
  return tiles.every((tile) => tile === tiles[0]);
}

export function isFourRiichiAbortive(state: RoundState): boolean {
  return state.players.every((p) => p.riichi);
}

export function isFourKansAbortive(state: RoundState): boolean {
  const counts = state.players.map(
    (p) => p.melds.filter((m: Meld) => ["daiminkan", "ankan", "kakan"].includes(m.type)).length
  );
  const total = counts.reduce((a, b) => a + b, 0);
  return total >= 4 && counts.filter((n) => n > 0).length > 1;
}
