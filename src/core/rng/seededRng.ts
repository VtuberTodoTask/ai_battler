function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

export interface SeededRngState {
  seed: string
  callCount: number
  a: number
  b: number
  c: number
  d: number
}

export class SeededRng {
  private readonly seed: string
  private a: number
  private b: number
  private c: number
  private d: number
  private callCount = 0

  constructor(seed: string) {
    this.seed = seed
    const [a, b, c, d] = cyrb128(seed)
    this.a = a
    this.b = b
    this.c = c
    this.d = d
  }

  getSeed(): string {
    return this.seed
  }

  getCallCount(): number {
    return this.callCount
  }

  next(): number {
    let a = this.a >>> 0
    let b = this.b >>> 0
    let c = this.c >>> 0
    let d = this.d >>> 0

    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    d = (d + 1) | 0
    t = (t + d) | 0
    c = (c + t) | 0

    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.callCount++

    return (t >>> 0) / 4294967296
  }

  float(min = 0, max = 1): number {
    return min + this.next() * (max - min)
  }

  integer(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1))
  }

  d100(): number {
    return this.integer(1, 100)
  }

  die(sides: number): number {
    return this.integer(1, sides)
  }

  chance(percent: number): boolean {
    return this.d100() <= Math.max(0, Math.min(100, percent))
  }

  pick<T>(items: readonly T[]): T {
    return items[this.integer(0, items.length - 1)]
  }

  pickIndex<T>(items: readonly T[]): number {
    return this.integer(0, items.length - 1)
  }

  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0)
    let r = this.next() * total
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]
      if (r <= 0) return items[i]
    }
    return items[items.length - 1]
  }

  shuffle<T>(items: T[]): T[] {
    const arr = [...items]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.integer(0, i)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  gaussian(mean = 0, stdDev = 1): number {
    let u = 0
    let v = 0
    while (u === 0) u = this.next()
    while (v === 0) v = this.next()
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    return mean + z * stdDev
  }

  serialize(): SeededRngState {
    return {
      seed: this.seed,
      callCount: this.callCount,
      a: this.a,
      b: this.b,
      c: this.c,
      d: this.d,
    }
  }

  static restore(state: SeededRngState): SeededRng {
    const rng = new SeededRng(state.seed)
    rng.callCount = state.callCount
    rng.a = state.a
    rng.b = state.b
    rng.c = state.c
    rng.d = state.d
    return rng
  }
}
