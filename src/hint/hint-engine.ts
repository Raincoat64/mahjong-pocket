import { Meld } from "../core/types";
import { TileCode, TileType, TILE_TYPES, tileType } from "../core/tile";
import { calculateImprovingTiles, calculateShanten, calculateWaits } from "./shanten";

export interface PublicTiles {
  rivers?: readonly (readonly TileCode[])[];
  melds?: readonly (readonly Meld[])[];
  doraIndicators?: readonly TileCode[];
}

export interface DiscardToTenpaiCandidate {
  discardIndex: number;
  discard: TileCode;
  waits: TileType[];
}

export interface HintSnapshot {
  shanten: number;
  improvingTiles: TileType[];
  waits: TileType[];
  discardToTenpai: DiscardToTenpaiCandidate[];
}

export function visibleRemainingByType(
  ownHand: readonly TileCode[],
  publicTiles: PublicTiles
): Map<TileType, number> {
  const seen = new Map<TileType, number>();
  for (const type of TILE_TYPES) seen.set(type, 0);

  const add = (tile: TileCode) => {
    const type = tileType(tile);
    seen.set(type, (seen.get(type) ?? 0) + 1);
  };

  ownHand.forEach(add);
  publicTiles.rivers?.forEach((river) => river.forEach(add));
  publicTiles.melds?.forEach((playerMelds) => {
    playerMelds.forEach((meld) => meld.tiles.forEach(add));
  });
  publicTiles.doraIndicators?.forEach(add);

  const remaining = new Map<TileType, number>();
  for (const type of TILE_TYPES) remaining.set(type, Math.max(0, 4 - (seen.get(type) ?? 0)));
  return remaining;
}

export function findDiscardToTenpai(hand: readonly TileCode[], openMelds = 0): DiscardToTenpaiCandidate[] {
  if (hand.length % 3 !== 2) return [];
  const out: DiscardToTenpaiCandidate[] = [];
  const seenCodes = new Set<string>();

  hand.forEach((discard, discardIndex) => {
    // Red five and regular five are intentionally separate discard choices.
    if (seenCodes.has(discard)) return;
    seenCodes.add(discard);

    const next = hand.slice();
    next.splice(discardIndex, 1);
    if (calculateShanten(next, openMelds) === 0) {
      out.push({ discardIndex, discard, waits: calculateWaits(next, openMelds) });
    }
  });
  return out;
}

export function buildHintSnapshot(hand: readonly TileCode[], openMelds = 0): HintSnapshot {
  const shanten = calculateShanten(hand, openMelds);
  return {
    shanten,
    improvingTiles: calculateImprovingTiles(hand, openMelds),
    waits: shanten === 0 ? calculateWaits(hand, openMelds) : [],
    discardToTenpai: findDiscardToTenpai(hand, openMelds)
  };
}
