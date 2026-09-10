export interface RandomState {
  algorithm: "xorshift32";
  state: number;
}

export class DeterministicRandom {
  private value: number;

  constructor(seed: number | RandomState) {
    const initial = typeof seed === "number" ? seed : seed.state;
    this.value = (initial >>> 0) || 0x9e3779b9;
  }

  nextUint32(): number {
    let x = this.value >>> 0;
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    this.value = x >>> 0;
    return this.value;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x100000000;
  }

  state(): RandomState {
    return { algorithm: "xorshift32", state: this.value >>> 0 };
  }
}

export function shuffleDeterministic<T>(items: readonly T[], rng: DeterministicRandom): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.nextFloat() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
