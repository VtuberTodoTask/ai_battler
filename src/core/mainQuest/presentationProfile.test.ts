import { describe, expect, it } from 'vitest'
import {
  resolveMotifRuntimeElements,
  resolveUniqueMonsterAnimationProfile,
} from './presentationProfile.ts'
import { MAIN_QUEST_THREAT_DEFINITIONS } from './threats.ts'

describe('Phase 9.8.2 resolveUniqueMonsterAnimationProfile', () => {
  it('is pure/deterministic: identical visualProfile always yields an identical plan', () => {
    const alden = MAIN_QUEST_THREAT_DEFINITIONS.find((d) => d.id === 'alden')!
      .uniqueMonster.visualProfile
    const first = resolveUniqueMonsterAnimationProfile(alden)
    const second = resolveUniqueMonsterAnimationProfile(alden)
    expect(second).toEqual(first)
  })

  it('every real Threat boss (including Nosferatu) gets a genuinely distinct full idle/attack/hitReaction plan', () => {
    const plans = MAIN_QUEST_THREAT_DEFINITIONS.map((d) => ({
      id: d.id,
      plan: resolveUniqueMonsterAnimationProfile(d.uniqueMonster.visualProfile),
    }))
    const idleKeys = plans.map((p) => JSON.stringify(p.plan.idle))
    const attackKeys = plans.map((p) => JSON.stringify(p.plan.attack))
    const hitReactionKeys = plans.map((p) => JSON.stringify(p.plan.hitReaction))
    expect(new Set(idleKeys).size).toBe(plans.length)
    expect(new Set(attackKeys).size).toBe(plans.length)
    expect(new Set(hitReactionKeys).size).toBe(plans.length)
    // At least 4 distinct idle *categories* across the 8 real bosses (item
    // 2's floor), and none of the 8 falls through to the generic fallback.
    const idleCategories = new Set(plans.map((p) => p.plan.idle.category))
    expect(idleCategories.size).toBeGreaterThanOrEqual(4)
    for (const p of plans) {
      expect(p.plan.attack.category).not.toBe('generic')
      expect(p.plan.hitReaction.category).not.toBe('generic')
    }
  })

  it("Nosferatu's still-composed-idle never bobs vertically, unlike every other boss", () => {
    const nosferatu = MAIN_QUEST_THREAT_DEFINITIONS.find(
      (d) => d.id === 'nosferatu',
    )!.uniqueMonster.visualProfile
    const plan = resolveUniqueMonsterAnimationProfile(nosferatu)
    expect(plan.idle.bobAmplitude).toBe(0)

    for (const definition of MAIN_QUEST_THREAT_DEFINITIONS) {
      if (definition.id === 'nosferatu') continue
      const otherPlan = resolveUniqueMonsterAnimationProfile(
        definition.uniqueMonster.visualProfile,
      )
      expect(otherPlan.idle.bobAmplitude).toBeGreaterThan(0)
    }
  })

  it("Nosferatu's silent-strike is a small, low-shake motion, unlike a showy boss like Kared's hammer-swing", () => {
    const nosferatu = MAIN_QUEST_THREAT_DEFINITIONS.find(
      (d) => d.id === 'nosferatu',
    )!.uniqueMonster.visualProfile
    const kared = MAIN_QUEST_THREAT_DEFINITIONS.find((d) => d.id === 'kared')!
      .uniqueMonster.visualProfile
    const nosferatuPlan = resolveUniqueMonsterAnimationProfile(nosferatu)
    const karedPlan = resolveUniqueMonsterAnimationProfile(kared)

    expect(nosferatuPlan.attack.alphaFadeTo).toBeDefined()
    expect(karedPlan.attack.alphaFadeTo).toBeUndefined()
    expect(nosferatuPlan.attack.screenShakeMagnitude).toBeLessThan(
      karedPlan.attack.screenShakeMagnitude,
    )
    expect(nosferatuPlan.attack.lungeDistance).toBeLessThan(
      karedPlan.attack.lungeDistance,
    )
  })

  it("Nosferatu's unmoved-glance hit reaction barely moves, unlike Alden's stagger-heavy", () => {
    const nosferatu = MAIN_QUEST_THREAT_DEFINITIONS.find(
      (d) => d.id === 'nosferatu',
    )!.uniqueMonster.visualProfile
    const alden = MAIN_QUEST_THREAT_DEFINITIONS.find((d) => d.id === 'alden')!
      .uniqueMonster.visualProfile
    const nosferatuPlan = resolveUniqueMonsterAnimationProfile(nosferatu)
    const aldenPlan = resolveUniqueMonsterAnimationProfile(alden)

    expect(nosferatuPlan.hitReaction.recoilDistance).toBeLessThan(
      aldenPlan.hitReaction.recoilDistance,
    )
    expect(nosferatuPlan.hitReaction.flashIntensity).toBeLessThan(
      aldenPlan.hitReaction.flashIntensity,
    )
  })

  it('every real Threat boss resolves at least one non-fallback motif token', () => {
    for (const definition of MAIN_QUEST_THREAT_DEFINITIONS) {
      const plan = resolveUniqueMonsterAnimationProfile(
        definition.uniqueMonster.visualProfile,
      )
      expect(plan.motifTokens.length).toBeGreaterThan(0)
    }
  })

  it('falls back to safe generic plans for an unrecognized motion string, never throwing', () => {
    const plan = resolveUniqueMonsterAnimationProfile({
      assetKey: 'unknown',
      scale: 1,
      idleMotion: 'totally-unknown-idle',
      hitReaction: 'totally-unknown-hit',
      attackMotion: 'totally-unknown-attack',
      presentationMotifs: [],
    })
    expect(plan.idle.category).toBe('breathing')
    expect(plan.attack.category).toBe('generic')
    expect(plan.hitReaction.category).toBe('generic')
    expect(plan.motifTokens).toEqual(['ambient'])
  })
})

describe('Phase 9.8.3 resolveMotifRuntimeElements', () => {
  it('is pure/deterministic: identical motifTokens always yields an identical element list', () => {
    const first = resolveMotifRuntimeElements(['sparks', 'forge_glow'])
    const second = resolveMotifRuntimeElements(['sparks', 'forge_glow'])
    expect(second).toEqual(first)
  })

  it("黒炉の巨獣 (Kared)'s motifTokens produce sparks and forge_glow runtime elements", () => {
    const kared = MAIN_QUEST_THREAT_DEFINITIONS.find((d) => d.id === 'kared')!
    const plan = resolveUniqueMonsterAnimationProfile(
      kared.uniqueMonster.visualProfile,
    )
    const elements = resolveMotifRuntimeElements(plan.motifTokens)
    const kinds = new Set(elements.map((e) => e.kind))
    expect(kinds.has('sparks')).toBe(true)
    expect(kinds.has('forge_glow')).toBe(true)
  })

  it("Nosferatu's motifTokens produce shadow and red_glow runtime elements", () => {
    const nosferatu = MAIN_QUEST_THREAT_DEFINITIONS.find(
      (d) => d.id === 'nosferatu',
    )!
    const plan = resolveUniqueMonsterAnimationProfile(
      nosferatu.uniqueMonster.visualProfile,
    )
    const elements = resolveMotifRuntimeElements(plan.motifTokens)
    const kinds = new Set(elements.map((e) => e.kind))
    expect(kinds.has('shadow')).toBe(true)
    expect(kinds.has('red_glow')).toBe(true)
  })

  it('every real Threat boss resolves at least one runtime element (never silently empty)', () => {
    for (const definition of MAIN_QUEST_THREAT_DEFINITIONS) {
      const plan = resolveUniqueMonsterAnimationProfile(
        definition.uniqueMonster.visualProfile,
      )
      const elements = resolveMotifRuntimeElements(plan.motifTokens)
      expect(elements.length).toBeGreaterThan(0)
    }
  })

  it('stays lightweight: never more than a few elements per runtime kind, deduplicated across repeated tokens', () => {
    const elements = resolveMotifRuntimeElements([
      'sparks',
      'sparks',
      'forge_glow',
      'sparks',
    ])
    const sparkElements = elements.filter((e) => e.kind === 'sparks')
    const forgeElements = elements.filter((e) => e.kind === 'forge_glow')
    expect(sparkElements.length).toBeGreaterThan(0)
    expect(sparkElements.length).toBeLessThanOrEqual(6)
    expect(forgeElements.length).toBe(1)
    // Deduped: repeating 'sparks' 3x in the input must not triple its count.
    expect(elements.length).toBe(sparkElements.length + forgeElements.length)
  })

  it('falls back to the ambient kind for an unrecognized token, never throwing or producing nothing', () => {
    const elements = resolveMotifRuntimeElements(['totally-unknown-token'])
    expect(elements.length).toBeGreaterThan(0)
    expect(elements.every((e) => e.kind === 'ambient')).toBe(true)
  })
})
