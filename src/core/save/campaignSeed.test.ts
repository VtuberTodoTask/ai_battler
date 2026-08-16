import { generateCampaignSeed } from './seed.ts'

describe('generateCampaignSeed', () => {
  it('16バイトのhex文字列を生成する', () => {
    const seed = generateCampaignSeed()
    expect(seed).toMatch(/^[0-9A-F]{32}$/)
  })

  it('連続して異なるシードを返す', () => {
    const a = generateCampaignSeed()
    const b = generateCampaignSeed()
    expect(a).not.toBe(b)
  })
})
