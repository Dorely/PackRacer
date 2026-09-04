import { copyEvent, nowIso, recalculateEventStatus } from './helpers'
import type { DeferHeatRacersInput, Heat, HeatDeferralPlan, LaneAssignment, PostponeHeatInput, Race, RaceEvent } from './types'

function findRace(event: RaceEvent, raceId: string): Race {
  const race = event.races.find((candidate) => candidate.id === raceId)
  if (!race) throw new Error('Race was not found.')
  return race
}

function supportsDeferral(race: Race): boolean {
  return race.format === 'timed-heats' || race.format === 'points-heats'
}

function hasMakeupAssignment(heat: Heat): boolean {
  return heat.laneAssignments.some((assignment) => assignment.makeupSource)
}

function adjustableFutureAssignments(race: Race, heatIndex: number) {
  return race.heats.slice(heatIndex + 1).flatMap((futureHeat, offset) =>
    futureHeat.status === 'pending' && !futureHeat.makeupSource && !futureHeat.tieBreakerSource && !hasMakeupAssignment(futureHeat)
      ? futureHeat.laneAssignments
          .filter((assignment): assignment is LaneAssignment & { racerId: string } => Boolean(assignment.racerId))
          .map((assignment) => ({ futureHeat, assignment, offset }))
      : []
  )
}

function assignmentHistory(race: Race, racerId: string, excludedHeatIds: Set<string>) {
  const lanes = new Map<number, number>()
  const opponents = new Map<string, number>()

  for (const heat of race.heats) {
    if (excludedHeatIds.has(heat.id) || !heat.laneAssignments.some((assignment) => assignment.racerId === racerId)) continue
    const racerAssignment = heat.laneAssignments.find((assignment) => assignment.racerId === racerId)!
    lanes.set(racerAssignment.lane, (lanes.get(racerAssignment.lane) ?? 0) + 1)
    for (const assignment of heat.laneAssignments) {
      if (!assignment.racerId || assignment.racerId === racerId) continue
      opponents.set(assignment.racerId, (opponents.get(assignment.racerId) ?? 0) + 1)
    }
  }

  return { lanes, opponents }
}

function replacementPenalty(
  race: Race,
  currentHeat: Heat,
  selectedAssignment: LaneAssignment & { racerId: string },
  futureHeat: Heat,
  replacementAssignment: LaneAssignment & { racerId: string }
): number {
  const excludedHeatIds = new Set([currentHeat.id, futureHeat.id])
  const selectedHistory = assignmentHistory(race, selectedAssignment.racerId, excludedHeatIds)
  const replacementHistory = assignmentHistory(race, replacementAssignment.racerId, excludedHeatIds)
  let penalty = (selectedHistory.lanes.get(replacementAssignment.lane) ?? 0) * 4
  penalty += (replacementHistory.lanes.get(selectedAssignment.lane) ?? 0) * 4

  for (const assignment of futureHeat.laneAssignments) {
    if (!assignment.racerId || assignment.racerId === replacementAssignment.racerId) continue
    penalty += selectedHistory.opponents.get(assignment.racerId) ?? 0
  }
  for (const assignment of currentHeat.laneAssignments) {
    if (!assignment.racerId || assignment.racerId === selectedAssignment.racerId) continue
    penalty += replacementHistory.opponents.get(assignment.racerId) ?? 0
  }
  return penalty
}

export function getHeatDeferralPlan(event: RaceEvent, raceId: string, input: DeferHeatRacersInput): HeatDeferralPlan {
  if (event.activeRemovalImpact) throw new Error('Resolve the scratched racer schedule before adjusting a heat.')

  const race = findRace(copyEvent(event), raceId)
  if (!supportsDeferral(race)) throw new Error('Selected-racer deferral is available only for timed and points heats.')

  const heatIndex = race.heats.findIndex((heat) => heat.id === input.heatId)
  const heat = race.heats[heatIndex]
  if (!heat || heat.status !== 'pending' || race.currentHeatId !== heat.id) {
    throw new Error('Only the current pending heat can be adjusted.')
  }
  if (heat.makeupSource || heat.tieBreakerSource || hasMakeupAssignment(heat)) {
    throw new Error('Makeup and tie-breaker heats cannot be adjusted with racer deferral.')
  }

  const selectedRacerIds = [...new Set(input.racerIds)]
  const selectedAssignments = selectedRacerIds.map((racerId) => {
    const assignment = heat.laneAssignments.find((candidate) => candidate.racerId === racerId)
    if (!assignment) throw new Error('Every selected racer must be assigned to the current heat.')
    return assignment
  })
  if (selectedAssignments.length === 0) throw new Error('Select at least one racer to defer.')

  const currentRacerIds = new Set(
    heat.laneAssignments.map((assignment) => assignment.racerId).filter((racerId): racerId is string => Boolean(racerId))
  )
  const usedReplacementIds = new Set<string>()
  const moves: HeatDeferralPlan['moves'] = []

  for (const selectedAssignment of selectedAssignments) {
    const racerId = selectedAssignment.racerId!
    const candidate = adjustableFutureAssignments(race, heatIndex)
      .filter(({ futureHeat, assignment }) =>
        !currentRacerIds.has(assignment.racerId) &&
        !usedReplacementIds.has(assignment.racerId) &&
        !futureHeat.laneAssignments.some((futureAssignment) => futureAssignment.racerId === racerId)
      )
      .map((option) => ({
        ...option,
        penalty: replacementPenalty(race, heat, selectedAssignment as LaneAssignment & { racerId: string }, option.futureHeat, option.assignment)
      }))
      .sort((first, second) => first.offset - second.offset || first.penalty - second.penalty || first.assignment.lane - second.assignment.lane)[0]

    if (!candidate) {
      throw new Error('The selected racers cannot all be moved to compatible future heats. Postpone this heat instead.')
    }

    const replacementRacerId = candidate.assignment.racerId
    selectedAssignment.racerId = replacementRacerId
    candidate.assignment.racerId = racerId
    currentRacerIds.delete(racerId)
    currentRacerIds.add(replacementRacerId)
    usedReplacementIds.add(replacementRacerId)
    moves.push({ racerId, replacementRacerId, targetHeatId: candidate.futureHeat.id, targetHeatNumber: candidate.futureHeat.heatNumber })
  }

  return { heatId: heat.id, moves }
}

export function deferHeatRacers(event: RaceEvent, raceId: string, input: DeferHeatRacersInput): RaceEvent {
  const plan = getHeatDeferralPlan(event, raceId, input)
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)
  const heat = race.heats.find((candidate) => candidate.id === plan.heatId)!
  const updatedAt = nowIso()

  for (const move of plan.moves) {
    const selectedAssignment = heat.laneAssignments.find((assignment) => assignment.racerId === move.racerId)!
    const targetHeat = race.heats.find((candidate) => candidate.id === move.targetHeatId)!
    const replacementAssignment = targetHeat.laneAssignments.find((assignment) => assignment.racerId === move.replacementRacerId)!
    selectedAssignment.racerId = move.replacementRacerId
    replacementAssignment.racerId = move.racerId
    heat.updatedAt = updatedAt
    targetHeat.updatedAt = updatedAt
  }

  race.updatedAt = updatedAt
  nextEvent.updatedAt = updatedAt
  return recalculateEventStatus(nextEvent)
}

export function postponeHeat(event: RaceEvent, raceId: string, input: PostponeHeatInput): RaceEvent {
  const nextEvent = copyEvent(event)
  if (nextEvent.activeRemovalImpact) throw new Error('Resolve the scratched racer schedule before postponing a heat.')
  const race = findRace(nextEvent, raceId)
  const heat = race.heats.find((candidate) => candidate.id === input.heatId)
  if (!heat || heat.status !== 'pending' || race.currentHeatId !== heat.id) {
    throw new Error('Only the current pending heat can be postponed.')
  }

  const remaining = race.heats.filter((candidate) => candidate.id !== heat.id)
  const lastPendingIndex = remaining.reduce((last, candidate, index) => candidate.status === 'pending' ? index : last, -1)
  remaining.splice(lastPendingIndex + 1, 0, heat)
  race.heats = remaining.map((candidate, index) => ({ ...candidate, heatNumber: index + 1 }))
  race.currentHeatId = race.heats.find((candidate) => candidate.status === 'pending')?.id
  race.updatedAt = nowIso()
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = race.updatedAt
  return recalculateEventStatus(nextEvent)
}
