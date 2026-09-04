import type { Heat, LaneAssignment, LaneResult, Race } from './types'

export function usesTimeResults(race: Race): boolean {
  return race.scoringMode === 'average-time' || race.scoringMode === 'best-time' || race.scoringMode === 'total-time'
}

export function validateUniqueFinishPositions(race: Race, results: LaneResult[]): void {
  if (usesTimeResults(race)) return
  const usedPositions = new Set<number>()
  const okResultCount = results.filter((result) => result.status === 'ok').length

  for (const result of results) {
    if (result.status !== 'ok' || typeof result.finishPosition !== 'number') continue
    if (usedPositions.has(result.finishPosition)) throw new Error('Each OK racer must have a unique finish position.')
    usedPositions.add(result.finishPosition)
  }

  if (usedPositions.size !== okResultCount || [...usedPositions].some((position) => position > okResultCount)) {
    throw new Error('OK finish positions must form a complete sequence starting at first place.')
  }
}

export function validateSubmittedResults(race: Race, heat: Heat, results: LaneResult[]): void {
  const assignments = heat.laneAssignments.filter(
    (assignment): assignment is LaneAssignment & { racerId: string } => Boolean(assignment.racerId)
  )
  const assignmentByLane = new Map(assignments.map((assignment) => [assignment.lane, assignment.racerId]))
  const lanes = new Set<number>()
  const racerIds = new Set<string>()
  const validStatuses = new Set(['ok', 'dns', 'dnf', 'dq'])

  if (results.length !== assignments.length) throw new Error('Record exactly one result for every occupied lane.')

  for (const result of results) {
    if (lanes.has(result.lane) || racerIds.has(result.racerId)) {
      throw new Error('Each occupied lane and racer must appear exactly once in the results.')
    }
    if (assignmentByLane.get(result.lane) !== result.racerId) {
      throw new Error('Every result must match the racer assigned to that lane.')
    }
    if (!validStatuses.has(result.status)) throw new Error('A result contains an unsupported status.')
    if (result.status === 'ok' && usesTimeResults(race) &&
      (typeof result.timeMs !== 'number' || !Number.isFinite(result.timeMs) || result.timeMs < 0)) {
      throw new Error('Enter a valid non-negative time for every OK result.')
    }
    if (result.status === 'ok' && !usesTimeResults(race) &&
      (typeof result.finishPosition !== 'number' || !Number.isInteger(result.finishPosition) || result.finishPosition < 1)) {
      throw new Error('Enter a valid finish position for every OK result.')
    }
    lanes.add(result.lane)
    racerIds.add(result.racerId)
  }
}
