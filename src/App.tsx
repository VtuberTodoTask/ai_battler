import { useState } from 'react'
import { Adventurer, BattleResult, Enemy } from './core/models/types.ts'
import {
  generateAdventurer,
  generateAdventurers,
} from './core/generators/adventurerGenerator.ts'
import { generateEnemy } from './core/generators/enemyGenerator.ts'
import {
  calculatePartyThreat,
  generateEncounter,
} from './core/generators/encounterGenerator.ts'
import { runBattle } from './core/battle/battle.ts'
import './App.css'

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const
const ROLES = [
  'vanguard',
  'ranger',
  'mage',
  'healer',
  'support',
  'scout',
  'guardian',
] as const
const SPECIES = [
  'humanoid',
  'beast',
  'undead',
  'construct',
  'aberration',
  'insect',
] as const
const TIERS = ['minion', 'standard', 'elite', 'boss'] as const
const DIFFICULTIES = ['easy', 'normal', 'hard', 'deadly'] as const

function formatStats(stats: Record<string, number>) {
  return Object.entries(stats)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')
}

export default function App() {
  // Adventurer
  const [advRank, setAdvRank] = useState<(typeof RANKS)[number]>('C')
  const [advRole, setAdvRole] = useState<(typeof ROLES)[number]>('vanguard')
  const [advSeed, setAdvSeed] = useState('adv-001')
  const [adventurer, setAdventurer] = useState<Adventurer | null>(null)

  // Party
  const [partySeed, setPartySeed] = useState('party-001')
  const [party, setParty] = useState<Adventurer[]>([])

  // Enemy
  const [enemyRank, setEnemyRank] = useState<(typeof RANKS)[number]>('C')
  const [enemySpecies, setEnemySpecies] =
    useState<(typeof SPECIES)[number]>('beast')
  const [enemyTier, setEnemyTier] = useState<(typeof TIERS)[number]>('standard')
  const [enemySeed, setEnemySeed] = useState('enemy-001')
  const [enemy, setEnemy] = useState<Enemy | null>(null)

  // Encounter
  const [encPartyThreat, setEncPartyThreat] = useState(16)
  const [encDifficulty, setEncDifficulty] =
    useState<(typeof DIFFICULTIES)[number]>('normal')
  const [encSeed, setEncSeed] = useState('enc-001')
  const [encounter, setEncounter] = useState<Enemy[]>([])

  // Battle
  const [battleSeed, setBattleSeed] = useState('battle-001')
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null)

  // Simulation
  const [simRank, setSimRank] = useState<(typeof RANKS)[number]>('C')
  const [simDifficulty, setSimDifficulty] =
    useState<(typeof DIFFICULTIES)[number]>('normal')
  const [simCount, setSimCount] = useState(100)
  const [simRunning, setSimRunning] = useState(false)
  const [simResult, setSimResult] = useState<{
    wins: number
    retreats: number
    defeats: number
    others: number
    avgRounds: number
  } | null>(null)

  return (
    <div className="app">
      <header>
        <h1>AI Battler</h1>
        <p>シード再現性付き自動戦闘シミュレータ</p>
      </header>

      <main>
        <section>
          <h2>冒険者生成</h2>
          <div className="controls">
            <label>
              等級
              <select
                value={advRank}
                onChange={(e) =>
                  setAdvRank(e.target.value as (typeof RANKS)[number])
                }
              >
                {RANKS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              役割
              <select
                value={advRole}
                onChange={(e) =>
                  setAdvRole(e.target.value as (typeof ROLES)[number])
                }
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              シード
              <input
                value={advSeed}
                onChange={(e) => setAdvSeed(e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                setAdventurer(
                  generateAdventurer({
                    seed: advSeed,
                    rank: advRank,
                    role: advRole,
                  }),
                )
              }
            >
              生成
            </button>
          </div>
          {adventurer && (
            <pre className="card">
              {JSON.stringify(
                {
                  name: adventurer.name,
                  rank: adventurer.rank,
                  role: adventurer.role,
                  stats: adventurer.stats,
                  skills: adventurer.skills,
                  maxHp: adventurer.maxHp,
                  maxMp: adventurer.maxMp,
                  morale: adventurer.morale,
                  traits: adventurer.traits.map((t) => t.name),
                  equipment: `${adventurer.equipment.weapon.name} / ${adventurer.equipment.armor.name}`,
                },
                null,
                2,
              )}
            </pre>
          )}
        </section>

        <section>
          <h2>パーティ生成</h2>
          <div className="controls">
            <label>
              シード
              <input
                value={partySeed}
                onChange={(e) => setPartySeed(e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                setParty(generateAdventurers({ seed: partySeed, count: 4 }))
              }
            >
              4人パーティ生成
            </button>
          </div>
          {party.length > 0 && (
            <div className="list">
              {party.map((a) => (
                <pre key={a.id} className="card">
                  {`${a.rank} ${a.role} ${a.name} HP${a.maxHp} MP${a.maxMp} morale${a.morale}\n${formatStats(a.stats as unknown as Record<string, number>)}`}
                </pre>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2>敵生成</h2>
          <div className="controls">
            <label>
              等級
              <select
                value={enemyRank}
                onChange={(e) =>
                  setEnemyRank(e.target.value as (typeof RANKS)[number])
                }
              >
                {RANKS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              種族
              <select
                value={enemySpecies}
                onChange={(e) =>
                  setEnemySpecies(e.target.value as (typeof SPECIES)[number])
                }
              >
                {SPECIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ティア
              <select
                value={enemyTier}
                onChange={(e) =>
                  setEnemyTier(e.target.value as (typeof TIERS)[number])
                }
              >
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              シード
              <input
                value={enemySeed}
                onChange={(e) => setEnemySeed(e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                setEnemy(
                  generateEnemy(enemySeed, {
                    rank: enemyRank,
                    species: enemySpecies,
                    tier: enemyTier,
                  }),
                )
              }
            >
              生成
            </button>
          </div>
          {enemy && (
            <pre className="card">
              {JSON.stringify(
                {
                  name: enemy.name,
                  rank: enemy.rank,
                  tier: enemy.tier,
                  species: enemy.species,
                  stats: enemy.stats,
                  threatCost: enemy.threatCost,
                  abilities: enemy.abilities.map((a) => a.name),
                  weaknesses: enemy.weaknesses.map((w) => w.name),
                },
                null,
                2,
              )}
            </pre>
          )}
        </section>

        <section>
          <h2>遭遇生成</h2>
          <div className="controls">
            <label>
              パーティ脅威点
              <input
                type="number"
                min={1}
                value={encPartyThreat}
                onChange={(e) => setEncPartyThreat(Number(e.target.value))}
              />
            </label>
            <label>
              難易度
              <select
                value={encDifficulty}
                onChange={(e) =>
                  setEncDifficulty(
                    e.target.value as (typeof DIFFICULTIES)[number],
                  )
                }
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              シード
              <input
                value={encSeed}
                onChange={(e) => setEncSeed(e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                setEncounter(
                  generateEncounter({
                    seed: encSeed,
                    partyThreat: encPartyThreat,
                    difficulty: encDifficulty,
                  }),
                )
              }
            >
              生成
            </button>
          </div>
          {encounter.length > 0 && (
            <div className="list">
              {encounter.map((e) => (
                <pre key={e.id} className="card">
                  {`${e.rank} ${e.tier} ${e.name} HP${e.maxHp} thr${e.threatCost}\n${formatStats(e.stats as unknown as Record<string, number>)}`}
                </pre>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2>自動戦闘</h2>
          <div className="controls">
            <label>
              シード
              <input
                value={battleSeed}
                onChange={(e) => setBattleSeed(e.target.value)}
              />
            </label>
            <button
              disabled={party.length === 0 || encounter.length === 0}
              onClick={() => {
                setBattleResult(runBattle(battleSeed, party, encounter))
              }}
            >
              戦闘実行
            </button>
          </div>
          {battleResult && (
            <div className="card">
              <p>
                <strong>結果:</strong> {battleResult.outcome} /{' '}
                {battleResult.rounds}ラウンド
              </p>
              <p>
                与ダメージ: {Math.round(battleResult.partyDamageDealt)} /
                被ダメージ: {Math.round(battleResult.enemyDamageDealt)}
              </p>
              <p>
                生存: {battleResult.survivingAdventurers.join(', ') || 'なし'}
              </p>
              <p>戦死者: {battleResult.deadAdventurers.join(', ') || 'なし'}</p>
              <p>
                重傷:{' '}
                {battleResult.incapacitatedAdventurers.join(', ') || 'なし'}
              </p>
              <details>
                <summary>戦闘ログ ({battleResult.logs.length})</summary>
                <pre>{battleResult.logs.map((l) => l.result).join('\n')}</pre>
              </details>
            </div>
          )}
        </section>

        <section>
          <h2>シミュレーション</h2>
          <div className="controls">
            <label>
              パーティ等級
              <select
                value={simRank}
                onChange={(e) =>
                  setSimRank(e.target.value as (typeof RANKS)[number])
                }
              >
                {RANKS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              難易度
              <select
                value={simDifficulty}
                onChange={(e) =>
                  setSimDifficulty(
                    e.target.value as (typeof DIFFICULTIES)[number],
                  )
                }
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              回数
              <input
                type="number"
                min={10}
                max={1000}
                value={simCount}
                onChange={(e) => setSimCount(Number(e.target.value))}
              />
            </label>
            <button
              disabled={simRunning}
              onClick={async () => {
                setSimRunning(true)
                setTimeout(() => {
                  let wins = 0
                  let retreats = 0
                  let defeats = 0
                  let others = 0
                  let totalRounds = 0
                  const roles: ('vanguard' | 'ranger' | 'mage' | 'healer')[] = [
                    'vanguard',
                    'ranger',
                    'mage',
                    'healer',
                  ]
                  const simParty = roles.map((role, i) =>
                    generateAdventurer({
                      seed: `sim-${simRank}-${role}-${i}`,
                      rank: simRank,
                      role,
                    }),
                  )
                  const enemies = generateEncounter({
                    seed: `sim-enc-${simRank}-${simDifficulty}`,
                    partyThreat: calculatePartyThreat(simParty),
                    difficulty: simDifficulty,
                  })
                  for (let i = 0; i < simCount; i++) {
                    const result = runBattle(
                      `sim-battle-${i}`,
                      simParty,
                      enemies,
                    )
                    totalRounds += result.rounds
                    if (
                      result.outcome === 'victory' ||
                      result.outcome === 'costlyVictory'
                    )
                      wins++
                    else if (result.outcome === 'retreat') retreats++
                    else if (
                      result.outcome === 'defeat' ||
                      result.outcome === 'totalLoss'
                    )
                      defeats++
                    else others++
                  }
                  setSimResult({
                    wins,
                    retreats,
                    defeats,
                    others,
                    avgRounds: totalRounds / simCount,
                  })
                  setSimRunning(false)
                }, 10)
              }}
            >
              実行
            </button>
          </div>
          {simRunning && <p>計算中…</p>}
          {simResult && (
            <div className="card">
              <p>
                勝利: {simResult.wins} (
                {((simResult.wins / simCount) * 100).toFixed(1)}%)
              </p>
              <p>
                撤退: {simResult.retreats} (
                {((simResult.retreats / simCount) * 100).toFixed(1)}%)
              </p>
              <p>
                敗北: {simResult.defeats} (
                {((simResult.defeats / simCount) * 100).toFixed(1)}%)
              </p>
              <p>その他: {simResult.others}</p>
              <p>平均ラウンド: {simResult.avgRounds.toFixed(1)}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
