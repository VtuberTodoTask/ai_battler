import { useCallback, useEffect, useMemo, useState } from 'react'
import { runExpedition } from '../../core/expedition/expedition.ts'
import type { ExpeditionResult } from '../../core/expedition/types.ts'
import { buildParty, EXPEDITION_PRESETS, makeRandomSeed } from './presets.ts'
import type { ExpeditionConfig } from './ExpeditionControls.tsx'
import { ExpeditionControls } from './ExpeditionControls.tsx'
import { ExpeditionTimeline } from './ExpeditionTimeline.tsx'
import { ExpeditionEventDetail } from './ExpeditionEventDetail.tsx'
import { ExpeditionPartyPanel } from './ExpeditionPartyPanel.tsx'
import { ExpeditionObjectivePanel } from './ExpeditionObjectivePanel.tsx'
import { ExpeditionBattlePanel } from './ExpeditionBattlePanel.tsx'
import { ExpeditionResultSummary } from './ExpeditionResultSummary.tsx'
import { RawJsonPanel } from './RawJsonPanel.tsx'
import { buildReplayItems, type ReplayItem } from './replay.ts'
import './expeditionSimulator.css'

const AUTOPLAY_INTERVAL_MS = 1000

function initialConfig(): ExpeditionConfig {
  const preset = EXPEDITION_PRESETS[0]
  return {
    presetId: preset.id,
    rank: preset.defaultRank,
    expeditionSeed: makeRandomSeed(),
    partySeed: makeRandomSeed(),
    battleEnabled: preset.defaultBattleEnabled,
    partyRoles: [...preset.defaultPartyRoles],
  }
}

export function ExpeditionSimulator() {
  const [config, setConfig] = useState<ExpeditionConfig>(initialConfig)
  const [result, setResult] = useState<ExpeditionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [running, setRunning] = useState(false)

  const partyPreview = useMemo(() => {
    try {
      return buildParty(config.partyRoles, config.partySeed, config.rank)
    } catch {
      return []
    }
  }, [config.partyRoles, config.partySeed, config.rank])

  const replayItems = useMemo<ReplayItem[]>(() => {
    if (!result) return []
    return buildReplayItems(result)
  }, [result])

  useEffect(() => {
    if (!playing || currentIndex >= replayItems.length - 1) return
    const timer = window.setTimeout(() => {
      const next = currentIndex + 1
      setCurrentIndex(next)
      if (next >= replayItems.length - 1) {
        setPlaying(false)
      }
    }, AUTOPLAY_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [playing, currentIndex, replayItems.length])

  const start = useCallback(() => {
    setRunning(true)
    setError(null)
    setResult(null)
    setCurrentIndex(0)
    setPlaying(false)
    try {
      const preset = EXPEDITION_PRESETS.find((p) => p.id === config.presetId)
      if (!preset) throw new Error('Preset not found')
      const request = preset.buildRequest(
        config.expeditionSeed,
        config.rank,
        preset.objectiveType === 'elimination' ? true : config.battleEnabled,
      )
      const party = buildParty(config.partyRoles, config.partySeed, config.rank)
      const expeditionResult = runExpedition(request, party)
      setResult(expeditionResult)
    } catch (e) {
      setError(
        e instanceof Error
          ? `遠征を実行できませんでした\n${e.message}`
          : '遠征を実行できませんでした',
      )
    } finally {
      setRunning(false)
    }
  }, [config])

  const rerunSame = useCallback(() => {
    start()
  }, [start])

  const newSeeds = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      expeditionSeed: makeRandomSeed(),
      partySeed: makeRandomSeed(),
    }))
  }, [])

  const currentItem = replayItems[currentIndex] ?? null

  const goFirst = useCallback(() => {
    setCurrentIndex(0)
  }, [])

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, replayItems.length - 1))
  }, [replayItems.length])

  const goLast = useCallback(() => {
    setCurrentIndex(replayItems.length - 1)
  }, [replayItems.length])

  const togglePlay = useCallback(() => {
    setPlaying((p) => !p)
  }, [])

  return (
    <div className="expedition-simulator">
      <ExpeditionControls
        config={config}
        partyPreview={partyPreview}
        onChange={setConfig}
        onStart={start}
        onNewSeeds={newSeeds}
        disabled={running}
      />

      {result && (
        <>
          <div className="timeline-controls">
            <button onClick={rerunSame}>同じ条件でもう一度</button>
            <button onClick={newSeeds}>Seedを変更して再実行</button>
          </div>

          <div className="expedition-main">
            <ExpeditionTimeline
              items={replayItems}
              currentIndex={currentIndex}
              playing={playing}
              onSelect={setCurrentIndex}
              onFirst={goFirst}
              onPrev={goPrev}
              onNext={goNext}
              onLast={goLast}
              onPlayPause={togglePlay}
            />
            <ExpeditionEventDetail item={currentItem} result={result} />
            <aside>
              <ExpeditionPartyPanel result={result} />
              <ExpeditionObjectivePanel
                objective={result.state.objectiveState}
              />
              <ExpeditionBattlePanel result={result} />
            </aside>
          </div>

          <ExpeditionResultSummary result={result} />
          <RawJsonPanel result={result} />
        </>
      )}

      {error && (
        <div className="error-banner" style={{ whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )}
    </div>
  )
}
