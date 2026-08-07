import { useState } from 'react'
import { ExpeditionSimulator } from './ui/expedition/ExpeditionSimulator.tsx'
import {
  Adventurer,
  BattleResult,
  BattleOutcome,
  Enemy,
} from './core/models/types.ts'
import {
  generateAdventurer,
  generateAdventurers,
} from './core/generators/adventurerGenerator.ts'
import { generateEnemy } from './core/generators/enemyGenerator.ts'
import { generateEncounter } from './core/generators/encounterGenerator.ts'
import { runBattle } from './core/battle/battle.ts'
import {
  runSimulation,
  type SimulationSummary,
} from './core/battle/simulation.ts'
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
  const [simRank, setSimRank] = useState<(typeof RANKS)[number]>('S')
  const [simDifficulty, setSimDifficulty] =
    useState<(typeof DIFFICULTIES)[number]>('normal')
  const [simCount, setSimCount] = useState(1000)
  const [simMode, setSimMode] = useState<'fixed' | 'random'>('random')
  const [simRoleMode, setSimRoleMode] = useState<'fixed' | 'random'>('fixed')
  const [simEnsureHealer, setSimEnsureHealer] = useState(true)
  const [simAllowDuplicate, setSimAllowDuplicate] = useState(false)
  const [simRunning, setSimRunning] = useState(false)
  const [simResult, setSimResult] = useState<SimulationSummary | null>(null)
  const [mode, setMode] = useState<'battle' | 'expedition'>('battle')
  const OUTCOME_LABELS: Record<BattleOutcome, string> = {
    victory: '勝利',
    costlyVictory: '重傷勝利',
    partialVictory: '部分勝利',
    retreat: '撤退',
    defeat: '敗北',
    totalLoss: '全滅',
    stalemate: '膠着',
  }

  return (
    <div className="app">
      <header>
        <h1>AI Battler</h1>
        <p>シード再現性付き自動戦闘シミュレータ</p>
      </header>

      <main>
        <div className="tabs">
          <button
            className={mode === 'battle' ? 'active' : ''}
            onClick={() => setMode('battle')}
          >
            戦闘シミュレーター
          </button>
          <button
            className={mode === 'expedition' ? 'active' : ''}
            onClick={() => setMode('expedition')}
          >
            遠征シミュレーター
          </button>
        </div>
        {mode === 'battle' && (
          <>
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
                      setEnemySpecies(
                        e.target.value as (typeof SPECIES)[number],
                      )
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
                    生存:{' '}
                    {battleResult.survivingAdventurers.join(', ') || 'なし'}
                  </p>
                  <p>
                    戦死者: {battleResult.deadAdventurers.join(', ') || 'なし'}
                  </p>
                  <p>
                    重傷:{' '}
                    {battleResult.incapacitatedAdventurers.join(', ') || 'なし'}
                  </p>
                  <details>
                    <summary>戦闘ログ ({battleResult.logs.length})</summary>
                    <pre>
                      {battleResult.logs.map((l) => l.result).join('\n')}
                    </pre>
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
                <label>
                  モード
                  <select
                    value={simMode}
                    onChange={(e) =>
                      setSimMode(e.target.value as 'fixed' | 'random')
                    }
                  >
                    <option value="fixed">固定マッチアップ検証</option>
                    <option value="random">ランダム総合</option>
                  </select>
                  {simMode === 'fixed' && (
                    <small>
                      同一パーティ・同一敵編成で戦闘乱数のみを変更します。等級全体のバランス比較には使用しません。
                    </small>
                  )}
                </label>
                <label>
                  ロール構成
                  <select
                    value={simRoleMode}
                    onChange={(e) =>
                      setSimRoleMode(e.target.value as 'fixed' | 'random')
                    }
                  >
                    <option value="fixed">固定ロール</option>
                    <option value="random">完全ランダム</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={simEnsureHealer}
                    onChange={(e) => setSimEnsureHealer(e.target.checked)}
                  />
                  治療役必須
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={simAllowDuplicate}
                    onChange={(e) => setSimAllowDuplicate(e.target.checked)}
                  />
                  重複ロール許可
                </label>
                <button
                  disabled={simRunning}
                  onClick={async () => {
                    setSimRunning(true)
                    setTimeout(() => {
                      const summary = runSimulation({
                        rank: simRank,
                        difficulty: simDifficulty,
                        count: simCount,
                        mode: simMode,
                        roleMode: simRoleMode,
                        ensureHealer: simEnsureHealer,
                        allowDuplicateRoles: simAllowDuplicate,
                        seed: `sim-${simRank}-${simDifficulty}`,
                      })
                      setSimResult(summary)
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
                  <div className="outcome-grid">
                    {(
                      [
                        'victory',
                        'costlyVictory',
                        'partialVictory',
                        'retreat',
                        'defeat',
                        'totalLoss',
                        'stalemate',
                      ] as BattleOutcome[]
                    ).map((outcome) => (
                      <p key={outcome}>
                        {OUTCOME_LABELS[outcome]}: {simResult.outcomes[outcome]}{' '}
                        (
                        {(
                          (simResult.outcomes[outcome] / simResult.count) *
                          100
                        ).toFixed(1)}
                        %)
                      </p>
                    ))}
                  </div>
                  <p>平均ラウンド: {simResult.avgRounds.toFixed(1)}</p>
                  <p>平均敵数: {simResult.avgEnemyCount.toFixed(1)}</p>
                  <p>平均敵脅威点: {simResult.avgEnemyThreat.toFixed(1)}</p>
                  <p>
                    平均パーティ脅威点: {simResult.avgPartyThreat.toFixed(1)}
                  </p>
                  <p>脅威比: {simResult.avgThreatRatio.toFixed(2)}</p>
                  <details>
                    <summary>
                      撤退診断 ({' '}
                      {Object.values(simResult.retreatReasons).reduce(
                        (sum, r) => sum + (r?.count ?? 0),
                        0,
                      )}{' '}
                      件)
                    </summary>
                    <div>
                      <p>
                        撤退成功:{' '}
                        {(simResult.retreatSuccessRate * 100).toFixed(1)}%
                      </p>
                      <p>
                        平均撤退ラウンド:{' '}
                        {simResult.avgRetreatRound?.toFixed(1) ?? 'なし'}
                      </p>
                      <p>
                        撤退時平均パーティHP:{' '}
                        {simResult.avgPartyHpOnRetreat !== null
                          ? `${(simResult.avgPartyHpOnRetreat * 100).toFixed(1)}%`
                          : 'なし'}
                      </p>
                      <p>
                        撤退時平均士気:{' '}
                        {simResult.avgMoraleOnRetreat !== null
                          ? simResult.avgMoraleOnRetreat.toFixed(1)
                          : 'なし'}
                      </p>
                      <p>
                        治療役喪失撤退率:{' '}
                        {(simResult.healerIncapRetreatRate * 100).toFixed(1)}%
                      </p>
                      <p>撤退理由:</p>
                      <ul>
                        {Object.entries(simResult.retreatReasons).map(
                          ([reason, data]) => (
                            <li key={reason}>
                              {reason}: {data?.count} (
                              {(data?.percentage
                                ? data.percentage * 100
                                : 0
                              ).toFixed(1)}
                              %)
                            </li>
                          ),
                        )}
                      </ul>
                      <p>個人別撤退提案回数:</p>
                      <ul>
                        {Object.entries(simResult.individualProposalCounts).map(
                          ([id, count]) => (
                            <li key={id}>
                              {id}: {count} 回
                            </li>
                          ),
                        )}
                      </ul>
                      <p>ロール別撤退提案率:</p>
                      <ul>
                        {Object.entries(simResult.roleProposalRates).map(
                          ([role, rate]) => (
                            <li key={role}>
                              {role}: {((rate ?? 0) * 100).toFixed(1)}%
                            </li>
                          ),
                        )}
                      </ul>
                      <p>撤退試行回数別成功率:</p>
                      <ul>
                        {Object.entries(simResult.retreatAttemptsByCount).map(
                          ([attempts, data]) => (
                            <li key={attempts}>
                              {attempts} 回試行: {data.count} 戦 / 成功率{' '}
                              {(data.rate * 100).toFixed(1)}%
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  </details>
                  <details>
                    <summary>接敵結果別勝率</summary>
                    <ul>
                      {Object.entries(simResult.contactResultStats).map(
                        ([type, data]) => (
                          <li key={type}>
                            {type}: {data?.count} 戦 / 勝率{' '}
                            {((data?.winRate ?? 0) * 100).toFixed(1)}%
                          </li>
                        ),
                      )}
                    </ul>
                  </details>
                  <details>
                    <summary>敵編成別勝率</summary>
                    <ul>
                      {Object.entries(simResult.enemyCompositionStats).map(
                        ([comp, data]) => (
                          <li key={comp}>
                            {comp}: {data.count} 戦 / 勝率{' '}
                            {((data.winRate ?? 0) * 100).toFixed(1)}%
                          </li>
                        ),
                      )}
                    </ul>
                  </details>
                  <details>
                    <summary>敵特殊能力別有利結果率</summary>
                    <ul>
                      {Object.entries(simResult.enemyAbilityStats).map(
                        ([ability, data]) => (
                          <li key={ability}>
                            {ability}: {data.count} 戦 / 有利結果率{' '}
                            {((data.winRate ?? 0) * 100).toFixed(1)}%
                          </li>
                        ),
                      )}
                    </ul>
                  </details>
                </div>
              )}
            </section>
          </>
        )}
        {mode === 'expedition' && <ExpeditionSimulator />}
      </main>
    </div>
  )
}
