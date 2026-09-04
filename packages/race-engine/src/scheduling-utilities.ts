import { activeLaneNumbers, createId, normalizeLaneCount, nowIso } from './helpers'
import type { Heat, LaneAssignment, Race } from './types'

export function makeHeat(heatNumber: number, roundNumber: number, assignments: LaneAssignment[]): Heat {
  const createdAt = nowIso()
  return {
    id: createId('heat'),
    heatNumber,
    roundNumber,
    status: 'pending',
    laneAssignments: assignments.sort((first, second) => first.lane - second.lane),
    results: [],
    createdAt,
    updatedAt: createdAt
  }
}

export function supportsMakeupRescheduling(race: Race): boolean {
  return race.format === 'timed-heats' || race.format === 'points-heats'
}

export function validateActiveLaneCapacity(race: Race): void {
  const minimumLaneCount = supportsMakeupRescheduling(race) ? 1 : 2
  if (activeLaneNumbers(race).length >= minimumLaneCount) return
  throw new Error(
    supportsMakeupRescheduling(race)
      ? 'This race needs at least one active lane.'
      : 'This race format needs at least two active lanes.'
  )
}

export function fillOpenLanes(assignments: LaneAssignment[], laneCount: number): LaneAssignment[] {
  const usedLanes = new Set(assignments.map((assignment) => assignment.lane))
  const nextAssignments = [...assignments]
  for (let lane = 1; lane <= normalizeLaneCount(laneCount); lane += 1) {
    if (!usedLanes.has(lane)) nextAssignments.push({ lane, racerId: null })
  }
  return nextAssignments.sort((first, second) => first.lane - second.lane)
}

export function pairKey(firstRacerId: string, secondRacerId: string): string {
  return [firstRacerId, secondRacerId].sort().join(':')
}

export function scheduledHeatAssignments(heat: Heat): Array<LaneAssignment & { racerId: string }> {
  const excludedResults = new Set(
    heat.results.filter((result) => result.excludedFromScoring).map((result) => `${result.lane}:${result.racerId}`)
  )
  return heat.laneAssignments.filter(
    (assignment): assignment is LaneAssignment & { racerId: string } =>
      Boolean(assignment.racerId) && !excludedResults.has(`${assignment.lane}:${assignment.racerId}`)
  )
}

export function recordHeatHistory(
  heat: Heat,
  laneHistory: Map<string, Set<number>>,
  opponentCounts: Map<string, number>,
  runCounts: Map<string, number>
): void {
  const racerAssignments = scheduledHeatAssignments(heat)
  for (const assignment of racerAssignments) {
    laneHistory.get(assignment.racerId)?.add(assignment.lane) ?? laneHistory.set(assignment.racerId, new Set([assignment.lane]))
    runCounts.set(assignment.racerId, (runCounts.get(assignment.racerId) ?? 0) + 1)
  }
  for (let firstIndex = 0; firstIndex < racerAssignments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < racerAssignments.length; secondIndex += 1) {
      const key = pairKey(racerAssignments[firstIndex].racerId, racerAssignments[secondIndex].racerId)
      opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1)
    }
  }
}
