import { DeterministicRandom, RandomState, shuffleDeterministic } from "./random";
import { TileCode, createYonmaTileSet } from "./tile";

const DEAD_WALL_SIZE = 14;
const RINSHAN_COUNT = 4;
const DORA_OFFSETS = [4, 6, 8, 10, 12] as const;
const URA_OFFSETS = [5, 7, 9, 11, 13] as const;

export interface WallState {
  tiles: TileCode[];
  drawIndex: number;
  deadWallStart: number;
  rinshanDrawCount: number;
  revealedDoraCount: number;
  rng: RandomState;
}

export function createYonmaWall(seed: number): WallState {
  const rng = new DeterministicRandom(seed);
  const tiles = shuffleDeterministic(createYonmaTileSet(), rng);
  return {
    tiles,
    drawIndex: 0,
    deadWallStart: tiles.length - DEAD_WALL_SIZE,
    rinshanDrawCount: 0,
    revealedDoraCount: 1,
    rng: rng.state()
  };
}

export function remainingLiveTiles(wall: WallState): number {
  return Math.max(0, wall.deadWallStart - wall.drawIndex - wall.rinshanDrawCount);
}

export function drawFromWall(wall: WallState): TileCode {
  if (remainingLiveTiles(wall) <= 0) throw new Error("LIVE_WALL_EXHAUSTED");
  return wall.tiles[wall.drawIndex++];
}

export function drawRinshanTile(wall: WallState): TileCode {
  if (wall.rinshanDrawCount >= RINSHAN_COUNT) throw new Error("RINSHAN_EXHAUSTED");
  if (remainingLiveTiles(wall) <= 0) throw new Error("LIVE_WALL_EXHAUSTED");
  const tile = wall.tiles[wall.deadWallStart + wall.rinshanDrawCount];
  wall.rinshanDrawCount++;
  return tile;
}

export function revealKanDora(wall: WallState): void {
  wall.revealedDoraCount = Math.min(5, wall.revealedDoraCount + 1);
}

export function getDoraIndicators(wall: WallState): TileCode[] {
  return DORA_OFFSETS.slice(0, wall.revealedDoraCount)
    .map((offset) => wall.tiles[wall.deadWallStart + offset]);
}

export function getUraDoraIndicators(wall: WallState): TileCode[] {
  return URA_OFFSETS.slice(0, wall.revealedDoraCount)
    .map((offset) => wall.tiles[wall.deadWallStart + offset]);
}
