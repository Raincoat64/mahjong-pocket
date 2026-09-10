export type Suit = "m" | "p" | "s";
export type Honor = "E" | "S" | "W" | "N" | "P" | "F" | "C";

export type NumberTile =
  | "m1" | "m2" | "m3" | "m4" | "m5" | "mr" | "m6" | "m7" | "m8" | "m9"
  | "p1" | "p2" | "p3" | "p4" | "p5" | "pr" | "p6" | "p7" | "p8" | "p9"
  | "s1" | "s2" | "s3" | "s4" | "s5" | "sr" | "s6" | "s7" | "s8" | "s9";

export type TileCode = NumberTile | Honor;

export type TileType =
  | "m1" | "m2" | "m3" | "m4" | "m5" | "m6" | "m7" | "m8" | "m9"
  | "p1" | "p2" | "p3" | "p4" | "p5" | "p6" | "p7" | "p8" | "p9"
  | "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8" | "s9"
  | Honor;

export const HONORS: readonly Honor[] = ["E", "S", "W", "N", "P", "F", "C"];

export const TILE_TYPES: readonly TileType[] = [
  "m1","m2","m3","m4","m5","m6","m7","m8","m9",
  "p1","p2","p3","p4","p5","p6","p7","p8","p9",
  "s1","s2","s3","s4","s5","s6","s7","s8","s9",
  "E","S","W","N","P","F","C"
];

const HONOR_TO_Z: Record<Honor, number> = {
  E: 1, S: 2, W: 3, N: 4, P: 5, F: 6, C: 7
};

export function tileType(tile: TileCode): TileType {
  if (tile === "mr") return "m5";
  if (tile === "pr") return "p5";
  if (tile === "sr") return "s5";
  return tile as TileType;
}

export function isRed(tile: TileCode): boolean {
  return tile === "mr" || tile === "pr" || tile === "sr";
}

export function isHonor(tile: TileCode | TileType): tile is Honor {
  return HONORS.includes(tile as Honor);
}

export function typeToMajiangCode(tile: TileType): string {
  if (isHonor(tile)) return `z${HONOR_TO_Z[tile]}`;
  return tile;
}

export function tileToMajiangCode(tile: TileCode): string {
  if (tile === "mr") return "m0";
  if (tile === "pr") return "p0";
  if (tile === "sr") return "s0";
  return typeToMajiangCode(tileType(tile));
}

export function majiangCodeToType(code: string): TileType {
  if (/^[mps][0-9]$/.test(code)) {
    const suit = code[0];
    const n = code[1] === "0" ? "5" : code[1];
    return `${suit}${n}` as TileType;
  }
  if (/^z[1-7]$/.test(code)) {
    return HONORS[Number(code[1]) - 1];
  }
  throw new Error(`Unsupported Majiang tile code: ${code}`);
}

export function createYonmaTileSet(): TileCode[] {
  const tiles: TileCode[] = [];
  for (const suit of ["m","p","s"] as const) {
    for (let n = 1; n <= 9; n++) {
      if (n === 5) {
        tiles.push(`${suit}5` as TileCode, `${suit}5` as TileCode, `${suit}5` as TileCode);
        tiles.push((suit === "m" ? "mr" : suit === "p" ? "pr" : "sr") as TileCode);
      } else {
        for (let i = 0; i < 4; i++) tiles.push(`${suit}${n}` as TileCode);
      }
    }
  }
  for (const honor of HONORS) {
    for (let i = 0; i < 4; i++) tiles.push(honor);
  }
  return tiles;
}

export function countByType(tiles: readonly TileCode[]): Map<TileType, number> {
  const counts = new Map<TileType, number>();
  for (const type of TILE_TYPES) counts.set(type, 0);
  for (const tile of tiles) {
    const type = tileType(tile);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return counts;
}

export function tileSuit(tile: TileCode | TileType): Suit | "z" {
  const type = tileType(tile as TileCode);
  return isHonor(type) ? "z" : type[0] as Suit;
}

export function tileRank(tile: TileCode | TileType): number {
  const type = tileType(tile as TileCode);
  if (isHonor(type)) return HONORS.indexOf(type) + 1;
  return Number(type[1]);
}

export function isTerminalOrHonor(tile: TileCode | TileType): boolean {
  const type = tileType(tile as TileCode);
  return isHonor(type) || tileRank(type) === 1 || tileRank(type) === 9;
}
