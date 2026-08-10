export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function deepClone<T>(obj: T): T {
  return structuredClone(obj) as T
}

export function round(value: number): number {
  return Math.round(value)
}

export function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0)
}

export function average(numbers: number[]): number {
  return numbers.length === 0 ? 0 : sum(numbers) / numbers.length
}

export function countBy<T>(
  items: T[],
  predicate: (item: T) => boolean,
): number {
  return items.filter(predicate).length
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}
