import type { Heat, LaneResult, Race, RaceEvent, ScoringMode, Stage, Standing } from './types'
import { formatMilliseconds, sortRacers } from './helpers'

type StandingDraft = Omit<Standing, 'rank' | 'scoreLabel'> & {
  rank: number
  scoreLabel?: string
  resultTimes: number[]
}

function activeHeats(stage: Stage): Heat[] {
  return stage.heats.filter((heat) => heat.status === 'complete')
}

function resultRankValue(result: LaneResult): number {
  if (typeof result.finishPosition === 'number') {
    return result.finishPosition
  }

  if (typeof result.timeMs === 'number') {
    return result.timeMs
  }

  return Number.POSITIVE_INFINITY
}

function scorePoints(result: LaneResult, laneCount: number, scoringMode: ScoringMode): number {
  if (result.status !== 'ok') {
    return scoringMode === 'points-low' ? laneCount + 1 : 0
  }

  const position = result.finishPosition ?? laneCount

  if (scoringMode === 'points-low') {
    return position
  }

  return Math.max(0, laneCount - position + 1)
}

function createDrafts(event: RaceEvent, race: Race, stage: Stage): Map<string, StandingDraft> {
  const eligibleIds = stage.eligibleRacerIds ? new Set(stage.eligibleRacerIds) : null
  const entries = race.entries ?? []
  const entryByRacerId = new Map(entries.map((entry) => [entry.racerId, entry]))
  const registeredRacerIds = entries.length > 0 ? new Set(entries.map((entry) => entry.racerId)) : null
  const drafts = new Map<string, StandingDraft>()

  for (const racer of sortRacers(event.racers)) {
    if (registeredRacerIds && !registeredRacerIds.has(racer.id)) {
      continue
    }

    if (eligibleIds && !eligibleIds.has(racer.id)) {
      continue
    }

    const entry = entryByRacerId.get(racer.id)

    drafts.set(racer.id, {
      rank: 0,
      racerId: racer.id,
      racerNumber: racer.racerNumber,
      racerName: racer.name,
      division: racer.division,
      racerStatus: entry?.status ?? racer.status,
      completedHeats: 0,
      score: null,
      resultTimes: [],
      totalPoints: 0,
      wins: 0,
      losses: 0
    })
  }

  return drafts
}

function getWinner(results: LaneResult[]): LaneResult | undefined {
  return [...results]
    .filter((result) => result.status === 'ok')
    .sort((first, second) => resultRankValue(first) - resultRankValue(second))[0]
}

function rankDrafts(drafts: StandingDraft[], scoringMode: ScoringMode): Standing[] {
  const sortedDrafts = [...drafts].sort((first, second) => {
    if (first.score === null && second.score === null) {
      return first.racerNumber.localeCompare(second.racerNumber, undefined, { numeric: true })
    }

    if (first.score === null) {
      return 1
    }

    if (second.score === null) {
      return -1
    }

    if (scoringMode === 'points-high' || scoringMode === 'round-robin-record' || scoringMode === 'elimination') {
      return second.score - first.score
    }

    return first.score - second.score
  })

  let previousScore: number | null = null
  let previousRank = 0

  return sortedDrafts.map((draft, index) => {
    const rank = draft.score === previousScore ? previousRank : index + 1
    previousScore = draft.score
    previousRank = rank

    return {
      rank,
      racerId: draft.racerId,
      racerNumber: draft.racerNumber,
      racerName: draft.racerName,
      division: draft.division,
      racerStatus: draft.racerStatus,
      completedHeats: draft.completedHeats,
      score: draft.score,
      scoreLabel: draft.scoreLabel ?? 'No results',
      bestTimeMs: draft.bestTimeMs,
      averageTimeMs: draft.averageTimeMs,
      totalTimeMs: draft.totalTimeMs,
      totalPoints: draft.totalPoints,
      wins: draft.wins,
      losses: draft.losses
    }
  })
}

export function calculateStandings(event: RaceEvent, raceId?: string, stageId?: string): Standing[] {
  const race = event.races.find((candidate) => candidate.id === (raceId ?? event.currentRaceId)) ?? event.races[0]
  const stage = race?.stages.find((candidate) => candidate.id === (stageId ?? race.currentStageId)) ?? race?.stages[0]

  if (!race || !stage) {
    return []
  }

  const drafts = createDrafts(event, race, stage)
  const heats = activeHeats(stage)

  for (const heat of heats) {
    if (stage.format === 'round-robin') {
      const winner = getWinner(heat.results)

      for (const result of heat.results) {
        const draft = drafts.get(result.racerId)

        if (!draft) {
          continue
        }

        draft.completedHeats += 1

        if (typeof result.timeMs === 'number' && result.status === 'ok') {
          draft.resultTimes.push(result.timeMs)
        }

        if (winner && winner.racerId === result.racerId) {
          draft.wins = (draft.wins ?? 0) + 1
        } else {
          draft.losses = (draft.losses ?? 0) + 1
        }

        draft.totalPoints = (draft.totalPoints ?? 0) + scorePoints(result, heat.laneAssignments.length, 'points-high')
      }

      continue
    }

    if (stage.format === 'single-elimination') {
      const winner = getWinner(heat.results)

      for (const result of heat.results) {
        const draft = drafts.get(result.racerId)

        if (!draft) {
          continue
        }

        draft.completedHeats += 1

        if (winner && winner.racerId === result.racerId) {
          draft.wins = (draft.wins ?? 0) + 1
        } else {
          draft.losses = (draft.losses ?? 0) + 1
        }
      }

      continue
    }

    for (const result of heat.results) {
      const draft = drafts.get(result.racerId)

      if (!draft) {
        continue
      }

      draft.completedHeats += 1

      if (typeof result.timeMs === 'number' && result.status === 'ok') {
        draft.resultTimes.push(result.timeMs)
      }

      if (stage.format === 'points-heats') {
        draft.totalPoints = (draft.totalPoints ?? 0) + scorePoints(result, stage.laneCount, stage.scoringMode)
      }
    }
  }

  for (const draft of drafts.values()) {
    if (draft.resultTimes.length > 0) {
      const totalTimeMs = draft.resultTimes.reduce((sum, timeMs) => sum + timeMs, 0)
      const bestTimeMs = Math.min(...draft.resultTimes)
      const averageTimeMs = totalTimeMs / draft.resultTimes.length
      draft.totalTimeMs = totalTimeMs
      draft.bestTimeMs = bestTimeMs
      draft.averageTimeMs = averageTimeMs
    }

    switch (stage.scoringMode) {
      case 'best-time':
        draft.score = draft.bestTimeMs ?? null
        draft.scoreLabel = draft.score === null ? 'No time' : formatMilliseconds(draft.bestTimeMs)
        break
      case 'total-time':
        draft.score = draft.totalTimeMs ?? null
        draft.scoreLabel = draft.score === null ? 'No time' : formatMilliseconds(draft.totalTimeMs)
        break
      case 'points-high':
      case 'points-low':
        draft.score = draft.completedHeats > 0 ? draft.totalPoints ?? 0 : null
        draft.scoreLabel = draft.score === null ? 'No points' : `${draft.score} pts`
        break
      case 'round-robin-record':
        draft.score = draft.completedHeats > 0 ? (draft.wins ?? 0) * 1000 + (draft.totalPoints ?? 0) : null
        draft.scoreLabel = draft.score === null ? 'No matches' : `${draft.wins ?? 0}-${draft.losses ?? 0}`
        break
      case 'elimination':
        draft.score = draft.completedHeats > 0 ? draft.wins ?? 0 : null
        draft.scoreLabel = draft.score === null ? 'No matches' : `${draft.wins ?? 0} wins`
        break
      case 'average-time':
      default:
        draft.score = draft.averageTimeMs ?? null
        draft.scoreLabel = draft.score === null ? 'No time' : formatMilliseconds(draft.averageTimeMs)
        break
    }
  }

  return rankDrafts([...drafts.values()], stage.scoringMode)
}