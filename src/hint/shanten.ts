/*
 * Shanten calculation adapted from @kobalab/majiang-core v1.4.1 (MIT).
 * Upstream: https://github.com/kobalab/majiang-core/blob/v1.4.1/lib/xiangting.js
 * Copyright (C) 2021 Satoshi Kobayashi.
 *
 * This port operates on Mahjong Pocket's serializable TileCode model instead
 * of Majiang.Shoupai, preserving the upstream algorithmic structure.
 */
import { TileCode, TileType, TILE_TYPES, isHonor, tileType } from "../core/tile";

type SuitCounts = number[];

interface HandCounts {
  m: SuitCounts;
  p: SuitCounts;
  s: SuitCounts;
  z: SuitCounts;
}

function makeCounts(hand: readonly TileCode[]): HandCounts {
  const c: HandCounts = {
    m: Array(10).fill(0),
    p: Array(10).fill(0),
    s: Array(10).fill(0),
    z: Array(8).fill(0)
  };
  const honorMap: Record<string, number> = { E:1, S:2, W:3, N:4, P:5, F:6, C:7 };
  for (const tile of hand) {
    const type = tileType(tile);
    if (isHonor(type)) c.z[honorMap[type]]++;
    else {
      const s = type[0] as "m" | "p" | "s";
      const n = Number(type[1]);
      c[s][n]++;
    }
  }
  return c;
}

function baseShanten(m: number, d: number, g: number, pair: boolean): number {
  let n = pair ? 4 : 5;
  if (m > 4) { d += m - 4; m = 4; }
  if (m + d > 4) { g += m + d - 4; d = 4 - m; }
  if (m + d + g > n) g = n - m - d;
  if (pair) d++;
  return 13 - m * 3 - d * 2 - g;
}

interface MDG {
  a: [number, number, number];
  b: [number, number, number];
}

function taatsu(counts: number[]): MDG {
  let nPai = 0;
  let nTaatsu = 0;
  let nIsolated = 0;
  for (let n = 1; n <= 9; n++) {
    nPai += counts[n];
    if (n <= 7 && counts[n + 1] === 0 && counts[n + 2] === 0) {
      nTaatsu += nPai >> 1;
      nIsolated += nPai % 2;
      nPai = 0;
    }
  }
  nTaatsu += nPai >> 1;
  nIsolated += nPai % 2;
  return { a: [0, nTaatsu, nIsolated], b: [0, nTaatsu, nIsolated] };
}

function melds(counts: number[], n = 1): MDG {
  if (n > 9) return taatsu(counts);
  const max = melds(counts, n + 1);

  if (n <= 7 && counts[n] > 0 && counts[n + 1] > 0 && counts[n + 2] > 0) {
    counts[n]--; counts[n + 1]--; counts[n + 2]--;
    const r = melds(counts, n);
    counts[n]++; counts[n + 1]++; counts[n + 2]++;
    r.a[0]++; r.b[0]++;
    if (r.a[2] < max.a[2] || (r.a[2] === max.a[2] && r.a[1] < max.a[1])) max.a = r.a;
    if (r.b[0] > max.b[0] || (r.b[0] === max.b[0] && r.b[1] > max.b[1])) max.b = r.b;
  }

  if (counts[n] >= 3) {
    counts[n] -= 3;
    const r = melds(counts, n + 1);
    counts[n] += 3;
    r.a[0]++; r.b[0]++;
    if (r.a[2] < max.a[2] || (r.a[2] === max.a[2] && r.a[1] < max.a[1])) max.a = r.a;
    if (r.b[0] > max.b[0] || (r.b[0] === max.b[0] && r.b[1] > max.b[1])) max.b = r.b;
  }

  return max;
}

function allMelds(c: HandCounts, pair: boolean, openMelds: number): number {
  const r = {
    m: melds(c.m),
    p: melds(c.p),
    s: melds(c.s)
  };

  const z: [number, number, number] = [0, 0, 0];
  for (let n = 1; n <= 7; n++) {
    if (c.z[n] >= 3) z[0]++;
    else if (c.z[n] === 2) z[1]++;
    else if (c.z[n] === 1) z[2]++;
  }

  let min = 13;
  for (const m of [r.m.a, r.m.b]) {
    for (const p of [r.p.a, r.p.b]) {
      for (const s of [r.s.a, r.s.b]) {
        const x = [openMelds, 0, 0];
        for (let i = 0; i < 3; i++) x[i] += m[i] + p[i] + s[i] + z[i];
        min = Math.min(min, baseShanten(x[0], x[1], x[2], pair));
      }
    }
  }
  return min;
}

function normalShanten(c: HandCounts, openMelds: number): number {
  let min = allMelds(c, false, openMelds);
  for (const suit of ["m","p","s","z"] as const) {
    const counts = c[suit];
    for (let n = 1; n < counts.length; n++) {
      if (counts[n] >= 2) {
        counts[n] -= 2;
        min = Math.min(min, allMelds(c, true, openMelds));
        counts[n] += 2;
      }
    }
  }
  return min;
}

function kokushiShanten(c: HandCounts, openMelds: number): number {
  if (openMelds > 0) return Infinity;
  let terminalsHonors = 0;
  let pair = 0;
  for (const [suit, ns] of [
    ["m", [1,9]], ["p", [1,9]], ["s", [1,9]], ["z", [1,2,3,4,5,6,7]]
  ] as const) {
    const counts = c[suit];
    for (const n of ns) {
      if (counts[n] >= 1) terminalsHonors++;
      if (counts[n] >= 2) pair++;
    }
  }
  return pair ? 12 - terminalsHonors : 13 - terminalsHonors;
}

function chiitoitsuShanten(c: HandCounts, openMelds: number): number {
  if (openMelds > 0) return Infinity;
  let pairs = 0;
  let singles = 0;
  for (const suit of ["m","p","s","z"] as const) {
    const counts = c[suit];
    for (let n = 1; n < counts.length; n++) {
      if (counts[n] >= 2) pairs++;
      else if (counts[n] === 1) singles++;
    }
  }
  if (pairs > 7) pairs = 7;
  if (pairs + singles > 7) singles = 7 - pairs;
  return 13 - pairs * 2 - singles;
}

export function calculateShanten(hand: readonly TileCode[], openMelds = 0): number {
  const counts = makeCounts(hand);
  return Math.min(
    normalShanten(counts, openMelds),
    kokushiShanten(counts, openMelds),
    chiitoitsuShanten(counts, openMelds)
  );
}

function handTypeCount(hand: readonly TileCode[], type: TileType): number {
  let count = 0;
  for (const tile of hand) if (tileType(tile) === type) count++;
  return count;
}

export function calculateImprovingTiles(hand: readonly TileCode[], openMelds = 0): TileType[] {
  const current = calculateShanten(hand, openMelds);
  const result: TileType[] = [];
  for (const type of TILE_TYPES) {
    if (handTypeCount(hand, type) >= 4) continue;
    if (calculateShanten([...hand, type as TileCode], openMelds) < current) result.push(type);
  }
  return result;
}

export function calculateWaits(hand: readonly TileCode[], openMelds = 0): TileType[] {
  if (calculateShanten(hand, openMelds) !== 0) return [];
  return TILE_TYPES.filter((type) => {
    if (handTypeCount(hand, type) >= 4) return false;
    return calculateShanten([...hand, type as TileCode], openMelds) === -1;
  });
}
