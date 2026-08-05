import { SeededRng } from './seededRng.ts'

describe('SeededRng', () => {
  it('同一シードで同一の数列を返す', () => {
    const a = new SeededRng('test-seed-001')
    const b = new SeededRng('test-seed-001')
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('異なるシードで異なる数列を返す', () => {
    const a = new SeededRng('seed-a')
    const b = new SeededRng('seed-b')
    const samples = Array.from({ length: 10 }, () => a.next())
    const other = Array.from({ length: 10 }, () => b.next())
    expect(samples).not.toEqual(other)
  })

  it('d100は1～100の範囲', () => {
    const rng = new SeededRng('d100-test')
    for (let i = 0; i < 100; i++) {
      const r = rng.d100()
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(100)
    }
  })

  it('integerは指定範囲内', () => {
    const rng = new SeededRng('int-test')
    for (let i = 0; i < 100; i++) {
      const r = rng.integer(5, 15)
      expect(r).toBeGreaterThanOrEqual(5)
      expect(r).toBeLessThanOrEqual(15)
      expect(Number.isInteger(r)).toBe(true)
    }
  })

  it('pickは配列から選択する', () => {
    const rng = new SeededRng('pick-test')
    const items = ['a', 'b', 'c']
    expect(items).toContain(rng.pick(items))
  })
})
