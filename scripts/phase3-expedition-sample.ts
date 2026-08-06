import { runExpedition } from '../src/core/expedition/expedition.ts'
import type { ExpeditionRequest } from '../src/core/expedition/types.ts'
import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import type { Adventurer, AdventurerRole } from '../src/core/models/types.ts'
import { writeFileSync } from 'node:fs'

function makeRequest(
  seed: string,
  overrides: Partial<ExpeditionRequest> = {},
): ExpeditionRequest {
  return {
    id: `phase3-sample-${seed}`,
    seed,
    rank: 'C',
    difficulty: 'normal',
    objectiveType: 'investigation',
    environment: 'forest',
    distance: 4,
    features: ['traps', 'poorVisibility'],
    knownInformation: [],
    hiddenInformation: [
      {
        id: 'info-1',
        name: '敵の痕跡',
        description: '敵が近くにいる証拠',
        difficulty: 10,
      },
      {
        id: 'info-2',
        name: '古い地図',
        description: '遺跡の配置がわかる',
        difficulty: 10,
      },
      {
        id: 'info-3',
        name: '魔力の残滓',
        description: '魔法の気配',
        difficulty: 10,
      },
    ],
    ...overrides,
  }
}

function makeParty(roles: AdventurerRole[], seedBase: string): Adventurer[] {
  return roles.map((role, i) =>
    generateAdventurer({
      seed: `${seedBase}-${role}-${i}`,
      rank: 'C',
      role,
    }),
  )
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function summarize(result: ReturnType<typeof runExpedition>): string {
  const { outcome, state } = result
  const hpValues = Object.values(state.partyHp)
  const moraleValues = Object.values(state.partyMorale)
  const infoCount = state.information.length
  const discoveredThreats = state.discoveredThreats.join(', ') || 'なし'
  const avoidedThreats = state.avoidedThreats.join(', ') || 'なし'
  const keyFacts = state.logs
    .filter((l) => l.facts.length > 0)
    .slice(-3)
    .flatMap((l) => l.facts)

  return [
    `結果: ${outcome}`,
    `目的達成: ${state.objectiveCompleted ? 'はい' : 'いいえ'}（進捗=${state.objectiveProgress.toFixed(1)}%）`,
    `経過時間: ${state.elapsedTime.toFixed(1)}`,
    `残存物資: food=${state.supplies.food}, medicine=${state.supplies.medicine}, tools=${state.supplies.tools}`,
    `平均HP: ${average(hpValues).toFixed(1)}`,
    `平均士気: ${average(moraleValues).toFixed(1)}`,
    `負傷数: ${state.injuries.length}（重傷=${state.injuries.filter((i) => i.type === 'serious').length}）`,
    `犠牲者: ${state.casualties.join(', ') || 'なし'}`,
    `発見情報: ${infoCount}件`,
    `発見した脅威: ${discoveredThreats}`,
    `回避した脅威: ${avoidedThreats}`,
    `重要ログ:`,
    ...keyFacts.map((f) => `  - ${f}`),
  ].join('\n')
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body}\n`
}

const scenarios = [
  {
    title: '森林の調査（標準編成）',
    roles: ['vanguard', 'guardian', 'mage', 'healer'] as AdventurerRole[],
    request: makeRequest('forest-standard', {
      environment: 'forest',
      features: ['traps', 'poorVisibility'],
    }),
    seed: 'forest-standard-party',
  },
  {
    title: '森林の調査（Scout投入）',
    roles: ['vanguard', 'scout', 'mage', 'healer'] as AdventurerRole[],
    request: makeRequest('forest-scout', {
      environment: 'forest',
      features: ['traps', 'poorVisibility'],
    }),
    seed: 'forest-scout-party',
  },
  {
    title: '山岳の調査（不安定地形）',
    roles: ['vanguard', 'guardian', 'mage', 'healer'] as AdventurerRole[],
    request: makeRequest('mountain-standard', {
      environment: 'mountain',
      features: ['unstableTerrain', 'navigationDifficulty'],
    }),
    seed: 'mountain-standard-party',
  },
  {
    title: '魔法遺跡の調査（Mage重視）',
    roles: ['vanguard', 'mage', 'healer', 'support'] as AdventurerRole[],
    request: makeRequest('ruins-mage', {
      environment: 'ruins',
      features: ['poorVisibility'],
    }),
    seed: 'ruins-mage-party',
  },
]

let md = '# Phase 3.0 遠征シミュレーター サンプル出力\n\n'
md += 'investigation 依頼の決定論的シミュレーション結果。\n\n'

for (const scenario of scenarios) {
  const party = makeParty(scenario.roles, scenario.seed)
  const result = runExpedition(scenario.request, party)
  const summary = summarize(result)
  const roleLine = scenario.roles.join(' / ')
  md += section(`${scenario.title}（${roleLine}）`, summary)
  md += '\n'
}

const outputPath = 'PHASE3_EXPEDITION_SAMPLE.md'
writeFileSync(outputPath, md, 'utf-8')
console.log(`サンプル出力を ${outputPath} に保存しました`)
