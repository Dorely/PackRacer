import type { Heat, HeatStatus, LaneResultStatus, ScoringMode } from '@packracer/race-engine'

export type ResultDraft = {
  status: LaneResultStatus
  timeSeconds: string
  finishPosition: string
  rescheduleMakeup: boolean
}

export function usesTimeResults(scoringMode: ScoringMode): boolean {
  return scoringMode === 'average-time' || scoringMode === 'best-time' || scoringMode === 'total-time'
}

export function scenarioLabel(scenario: string | undefined): string {
  return (scenario ?? 'timer').split('-').join(' ')
}

export function supportsMakeupResults(format: string | undefined): boolean {
  return format === 'timed-heats' || format === 'points-heats'
}

export function canMakeupStatus(status: LaneResultStatus): boolean {
  return status === 'dns' || status === 'dnf'
}

export function isUnfinishedHeatStatus(status: HeatStatus | undefined): boolean {
  return status === 'pending' || status === 'running' || status === 'invalidated'
}

export function parseFinishPosition(value: string): number | null {
  const position = Number(value)
  return Number.isInteger(position) && position > 0 ? position : null
}

function cloneDrafts(drafts: Record<number, ResultDraft>): Record<number, ResultDraft> {
  return Object.fromEntries(Object.entries(drafts).map(([lane, draft]) => [Number(lane), { ...draft }]))
}

function okResultLanes(heat: Heat, drafts: Record<number, ResultDraft>): number[] {
  return heat.laneAssignments
    .filter((assignment) => assignment.racerId && drafts[assignment.lane]?.status === 'ok')
    .map((assignment) => assignment.lane)
}

function clearUnplacedLanes(heat: Heat, drafts: Record<number, ResultDraft>): void {
  for (const assignment of heat.laneAssignments) {
    if (!assignment.racerId || drafts[assignment.lane]?.status !== 'ok') {
      if (drafts[assignment.lane]) {
        drafts[assignment.lane].finishPosition = ''
      }
    }
  }
}

export function compactPlacementDrafts(heat: Heat | undefined, drafts: Record<number, ResultDraft>): Record<number, ResultDraft> {
  if (!heat) {
    return drafts
  }

  const next = cloneDrafts(drafts)
  const lanes = okResultLanes(heat, next)
  const maxPosition = lanes.length
  const orderedLanes = lanes
    .map((lane, index) => {
      const position = parseFinishPosition(next[lane].finishPosition)
      return {
        lane,
        index,
        position,
        valid: position !== null && position <= maxPosition
      }
    })
    .sort((first, second) => {
      if (first.valid && second.valid && first.position !== second.position) {
        return (first.position ?? 0) - (second.position ?? 0)
      }

      if (first.valid && !second.valid) {
        return -1
      }

      if (!first.valid && second.valid) {
        return 1
      }

      return first.index - second.index
    })

  orderedLanes.forEach((entry, index) => {
    next[entry.lane].finishPosition = `${index + 1}`
  })
  clearUnplacedLanes(heat, next)
  return next
}

export function normalizeUniquePlacementDrafts(heat: Heat, drafts: Record<number, ResultDraft>): Record<number, ResultDraft> {
  const next = cloneDrafts(drafts)
  const lanes = okResultLanes(heat, next)
  const maxPosition = lanes.length
  const usedPositions = new Set<number>()
  const missingLanes: number[] = []

  for (const lane of lanes) {
    const position = parseFinishPosition(next[lane].finishPosition)

    if (position && position <= maxPosition && !usedPositions.has(position)) {
      usedPositions.add(position)
      continue
    }

    next[lane].finishPosition = ''
    missingLanes.push(lane)
  }

  const availablePositions = Array.from({ length: maxPosition }, (_, index) => index + 1).filter(
    (position) => !usedPositions.has(position)
  )

  for (const lane of missingLanes) {
    next[lane].finishPosition = `${availablePositions.shift() ?? ''}`
  }

  clearUnplacedLanes(heat, next)
  return next
}

export function swapPlacementDrafts(
  heat: Heat,
  drafts: Record<number, ResultDraft>,
  lane: number,
  finishPosition: number
): Record<number, ResultDraft> {
  const next = cloneDrafts(drafts)
  const lanes = okResultLanes(heat, next)
  const maxPosition = lanes.length
  const selectedPosition = Math.min(Math.max(1, Math.trunc(finishPosition)), maxPosition)
  const previousPosition = parseFinishPosition(next[lane]?.finishPosition ?? '')
  const occupiedLane = lanes.find(
    (candidateLane) => candidateLane !== lane && parseFinishPosition(next[candidateLane].finishPosition) === selectedPosition
  )

  if (!next[lane] || next[lane].status !== 'ok') {
    return normalizeUniquePlacementDrafts(heat, next)
  }

  next[lane].finishPosition = `${selectedPosition}`

  if (occupiedLane) {
    const fallbackPosition =
      previousPosition && previousPosition <= maxPosition && previousPosition !== selectedPosition
        ? previousPosition
        : Array.from({ length: maxPosition }, (_, index) => index + 1).find(
            (position) =>
              position !== selectedPosition &&
              lanes.every(
                (candidateLane) =>
                  candidateLane === occupiedLane || parseFinishPosition(next[candidateLane].finishPosition) !== position
              )
          )

    next[occupiedLane].finishPosition = fallbackPosition ? `${fallbackPosition}` : ''
  }

  return normalizeUniquePlacementDrafts(heat, next)
}

export function placementOptions(heat: Heat | undefined, drafts: Record<number, ResultDraft>): number[] {
  return heat ? Array.from({ length: okResultLanes(heat, drafts).length }, (_, index) => index + 1) : []
}

export function initialDraft(heat: Heat | undefined): Record<number, ResultDraft> {
  const draft: Record<number, ResultDraft> = {}

  for (const assignment of heat?.laneAssignments ?? []) {
    const result = heat?.results.find((candidate) => candidate.lane === assignment.lane)
    draft[assignment.lane] = {
      status: result?.status ?? 'ok',
      timeSeconds: typeof result?.timeMs === 'number' ? `${result.timeMs / 1000}` : '',
      finishPosition: typeof result?.finishPosition === 'number' ? `${result.finishPosition}` : assignment.racerId ? `${assignment.lane}` : '',
      rescheduleMakeup: Boolean(result?.excludedFromScoring)
    }
  }

  return compactPlacementDrafts(heat, draft)
}
