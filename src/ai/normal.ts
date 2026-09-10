import { TileCode, TileType, TILE_TYPES, tileType } from "../core/tile";
import { calculateImprovingTiles, calculateShanten } from "../hint/shanten";

export interface CpuObservation {
  selfHand: readonly TileCode[];
  openMelds?: number;
  visibleRemaining?: ReadonlyMap<TileType, number>;
  legalDiscardIndexes: readonly number[];
}

export interface CpuDecision {
  tileIndex: number;
  tile: TileCode;
  shantenAfter: number;
  ukeire: number;
}

function defaultRemaining(hand: readonly TileCode[]): Map<TileType, number> {
  const m = new Map<TileType, number>();
  for (const type of TILE_TYPES) m.set(type, 4);
  for (const tile of hand) {
    const type = tileType(tile);
    m.set(type, Math.max(0, (m.get(type) ?? 4) - 1));
  }
  return m;
}

export function chooseNormalDiscard(observation: CpuObservation): CpuDecision {
  if (!observation.legalDiscardIndexes.length) throw new Error("NO_LEGAL_DISCARD");
  const remaining = observation.visibleRemaining ?? defaultRemaining(observation.selfHand);

  const candidates = observation.legalDiscardIndexes.map((tileIndex) => {
    const next = observation.selfHand.slice();
    const [tile] = next.splice(tileIndex, 1);
    const shantenAfter = calculateShanten(next, observation.openMelds ?? 0);
    const improving = calculateImprovingTiles(next, observation.openMelds ?? 0);
    const ukeire = improving.reduce((sum, type) => sum + (remaining.get(type) ?? 0), 0);
    return { tileIndex, tile, shantenAfter, ukeire };
  });

  candidates.sort((a, b) => {
    if (a.shantenAfter !== b.shantenAfter) return a.shantenAfter - b.shantenAfter;
    if (a.ukeire !== b.ukeire) return b.ukeire - a.ukeire;
    // Avoid discarding red fives on an otherwise exact tie.
    const aRed = a.tile === "mr" || a.tile === "pr" || a.tile === "sr";
    const bRed = b.tile === "mr" || b.tile === "pr" || b.tile === "sr";
    if (aRed !== bRed) return aRed ? 1 : -1;
    return a.tileIndex - b.tileIndex;
  });

  return candidates[0];
}
