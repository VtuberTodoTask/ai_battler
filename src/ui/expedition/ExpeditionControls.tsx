import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
} from '../../core/models/types.ts'
import {
  ALL_ROLES,
  EXPEDITION_PRESETS,
  isValidRank,
  isValidRole,
} from './presets.ts'
import { OBJECTIVE_LABELS } from './labels.ts'

export interface ExpeditionConfig {
  presetId: string
  rank: AdventurerRank
  expeditionSeed: string
  partySeed: string
  battleEnabled: boolean
  partyRoles: AdventurerRole[]
}

interface ExpeditionControlsProps {
  config: ExpeditionConfig
  partyPreview: Adventurer[]
  onChange: (config: ExpeditionConfig) => void
  onStart: () => void
  onNewSeeds: () => void
  disabled?: boolean
}

export function ExpeditionControls({
  config,
  partyPreview,
  onChange,
  onStart,
  onNewSeeds,
  disabled,
}: ExpeditionControlsProps) {
  const preset =
    EXPEDITION_PRESETS.find((p) => p.id === config.presetId) ??
    EXPEDITION_PRESETS[0]

  function updatePreset(id: string) {
    const next = EXPEDITION_PRESETS.find((p) => p.id === id) ?? preset
    onChange({
      ...config,
      presetId: next.id,
      rank: next.defaultRank,
      battleEnabled: next.defaultBattleEnabled,
      partyRoles: [...next.defaultPartyRoles],
    })
  }

  function updateRole(index: number, role: string) {
    if (!isValidRole(role)) return
    const nextRoles = [...config.partyRoles]
    nextRoles[index] = role
    onChange({ ...config, partyRoles: nextRoles })
  }

  function updateRank(rank: string) {
    if (!isValidRank(rank)) return
    onChange({ ...config, rank })
  }

  return (
    <section className="card">
      <h2>遠征設定</h2>
      <div className="expedition-header">
        <label>
          依頼
          <select
            value={config.presetId}
            onChange={(e) => updatePreset(e.target.value)}
          >
            {EXPEDITION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {OBJECTIVE_LABELS[p.objectiveType]}：{p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          依頼ランク
          <select
            value={config.rank}
            onChange={(e) => updateRank(e.target.value)}
          >
            {['E', 'D', 'C', 'B', 'A', 'S'].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          遠征Seed
          <input
            value={config.expeditionSeed}
            onChange={(e) =>
              onChange({ ...config, expeditionSeed: e.target.value })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.battleEnabled}
            disabled={preset.objectiveType === 'elimination'}
            onChange={(e) =>
              onChange({ ...config, battleEnabled: e.target.checked })
            }
          />
          戦闘あり
        </label>
        <label>
          Party Seed
          <input
            value={config.partySeed}
            onChange={(e) => onChange({ ...config, partySeed: e.target.value })}
          />
        </label>
        <button onClick={onNewSeeds} disabled={disabled}>
          Seedを変更して再実行
        </button>
      </div>

      <div className="party-config">
        {[0, 1, 2, 3].map((slotIndex) => (
          <label key={slotIndex}>
            Slot {slotIndex + 1}
            <select
              value={config.partyRoles[slotIndex] ?? 'vanguard'}
              onChange={(e) => updateRole(slotIndex, e.target.value)}
            >
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <button
        onClick={onStart}
        disabled={disabled || partyPreview.length !== 4}
      >
        遠征開始
      </button>

      {partyPreview.length === 4 && (
        <div className="party-preview">
          {partyPreview.map((a) => (
            <div key={a.id} className="adventurer-card">
              <h4>
                {a.name}{' '}
                <span className="role">
                  {a.rank} / {a.role}
                </span>
              </h4>
              <p>
                HP {a.currentHp}/{a.maxHp} | MP {a.currentMp}/{a.maxMp} | Morale{' '}
                {a.morale}
              </p>
              <p>
                STR {a.stats.str} / CON {a.stats.con} / DEX {a.stats.dex} / INT{' '}
                {a.stats.int} / PER {a.stats.per} / WIL {a.stats.wil} / SOC{' '}
                {a.stats.soc}
              </p>
              <details>
                <summary>skills</summary>
                <p>
                  {Object.entries(a.skills)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(', ')}
                </p>
              </details>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
