import { useMemo, useState } from 'react'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import { generateNarrative } from '../../core/narrative/generation.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'
import type {
  NarrativeCandidate,
  NarrativeGenerationRecord,
} from '../../core/narrative/types.ts'
import { NarrativeCandidateCard } from './NarrativeCandidateCard.tsx'

export interface NarrativeQueueProps {
  campaign: TavernCampaignState
  provider: NarrativeProvider | null
  onUpdateCampaign: (
    updater: (c: TavernCampaignState) => TavernCampaignState,
  ) => void
}

function sortCandidates(a: NarrativeCandidate, b: NarrativeCandidate): number {
  if (b.priority !== a.priority) return b.priority - a.priority
  return b.dayNumber - a.dayNumber
}

export function NarrativeQueue({
  campaign,
  provider,
  onUpdateCampaign,
}: NarrativeQueueProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(
    () => [...campaign.narrativeCandidates].sort(sortCandidates),
    [campaign.narrativeCandidates],
  )

  const generationByCandidate = useMemo(() => {
    const map = new Map<string, NarrativeGenerationRecord>()
    for (const record of campaign.narrativeGenerations) {
      const existing = map.get(record.candidateId)
      if (!existing || record.createdAt > existing.createdAt) {
        map.set(record.candidateId, record)
      }
    }
    return map
  }, [campaign.narrativeGenerations])

  const availableCount = useMemo(
    () => candidates.filter((c) => c.state === 'available').length,
    [candidates],
  )

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const applyGenerated = (
    candidate: NarrativeCandidate,
    record: NarrativeGenerationRecord,
  ) => {
    onUpdateCampaign((prev) => {
      const updatedCandidates = prev.narrativeCandidates.map((c) =>
        c.id === candidate.id
          ? { ...c, state: 'generated' as const, activeGenerationId: record.id }
          : c,
      )
      return {
        ...prev,
        narrativeCandidates: updatedCandidates,
        narrativeGenerations: [...prev.narrativeGenerations, record],
      }
    })
  }

  const handleGenerate = async (candidate: NarrativeCandidate) => {
    if (!provider) return
    setGeneratingIds((prev) => new Set(prev).add(candidate.id))
    setError(null)
    try {
      const { candidate: updated, record } = await generateNarrative(
        candidate,
        provider,
      )
      applyGenerated(updated, record)
    } catch (e) {
      setError(
        `AI文章の生成に失敗しました。${e instanceof Error ? e.message : ''}`,
      )
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev)
        next.delete(candidate.id)
        return next
      })
    }
  }

  const handleBulkGenerate = async () => {
    if (!provider) return
    const selected = candidates.filter(
      (c) => selectedIds.has(c.id) && c.state === 'available',
    )
    if (selected.length === 0) return
    setError(null)
    for (const candidate of selected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(candidate.id)
        return next
      })
      await handleGenerate(candidate)
    }
  }

  const handleDismiss = (id: string) => {
    onUpdateCampaign((prev) => ({
      ...prev,
      narrativeCandidates: prev.narrativeCandidates.map((c) =>
        c.id === id ? { ...c, state: 'dismissed' as const } : c,
      ),
    }))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleRestore = (id: string) => {
    onUpdateCampaign((prev) => ({
      ...prev,
      narrativeCandidates: prev.narrativeCandidates.map((c) =>
        c.id === id ? { ...c, state: 'available' as const } : c,
      ),
    }))
  }

  const selectedCount = selectedIds.size
  const totalGenerations = campaign.narrativeGenerations.length
  const isAnyGenerating = generatingIds.size > 0

  return (
    <div className="narrative-queue" data-testid="narrative-queue">
      <h3>AI文章候補</h3>
      <div className="narrative-queue-summary">
        <span>候補: {candidates.length}件</span>
        <span>未生成: {availableCount}件</span>
        <span>選択中: {selectedCount}件</span>
        <span>AI呼び出し: {totalGenerations}回</span>
        <span>状態: {provider ? `接続済み (${provider.id})` : 'AI未接続'}</span>
      </div>

      <div className="narrative-queue-actions">
        <button
          type="button"
          onClick={handleBulkGenerate}
          disabled={!provider || selectedCount === 0 || isAnyGenerating}
          data-testid="narrative-bulk-generate"
        >
          選択中{selectedCount}件を生成（AIを{selectedCount}回呼び出し）
        </button>
      </div>

      {error && <div className="narrative-error">{error}</div>}

      {candidates.length === 0 && (
        <p className="narrative-empty">AI文章候補はありません。</p>
      )}

      <div className="narrative-candidate-list">
        {candidates.map((candidate) => (
          <NarrativeCandidateCard
            key={candidate.id}
            candidate={candidate}
            generation={generationByCandidate.get(candidate.id)}
            selected={selectedIds.has(candidate.id)}
            generating={generatingIds.has(candidate.id)}
            onToggle={() => toggleSelection(candidate.id)}
            onGenerate={() => handleGenerate(candidate)}
            onRegenerate={() => handleGenerate(candidate)}
            onDismiss={() => handleDismiss(candidate.id)}
            onRestore={() => handleRestore(candidate.id)}
          />
        ))}
      </div>
    </div>
  )
}
