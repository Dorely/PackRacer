import { activeLaneNumbers, normalizeLaneCount } from './helpers'
import { fillOpenLanes, makeHeat, pairKey, recordHeatHistory, scheduledHeatAssignments } from './scheduling-utilities'
import type { Heat, LaneAssignment, Race, Racer } from './types'

function schedulingPenalty(
  race: Race,
  racer: Racer,
  lane: number,
  selectedRacerIds: string[],
  laneHistory: Map<string, Set<number>>,
  opponentCounts: Map<string, number>
): number {
  const repeatedLane = laneHistory.get(racer.id)?.has(lane) ? 1 : 0
  const repeatedOpponents = selectedRacerIds.reduce(
    (total, selectedRacerId) => total + (opponentCounts.get(pairKey(racer.id, selectedRacerId)) ?? 0), 0
  )
  return (race.schedulingOptions?.avoidSameLane ?? true ? repeatedLane * 1000 : 0) +
    (race.schedulingOptions?.avoidSameOpponents ?? true ? repeatedOpponents * 100 : 0)
}

function strictTimedOrPointsHeats(race: Race, racers: Racer[], preservedHeats: Heat[]): Heat[] {
  const heats: Heat[] = []
  const laneCount = normalizeLaneCount(race.laneCount)
  const availableLaneNumbers = activeLaneNumbers(race)
  const laneHistory = new Map<string, Set<number>>()
  const opponentCounts = new Map<string, number>()
  const runCounts = new Map<string, number>()
  for (const heat of preservedHeats) recordHeatHistory(heat, laneHistory, opponentCounts, runCounts)

  let heatNumber = 1
  for (let roundIndex = 0; roundIndex < race.roundsPerRacer; roundIndex += 1) {
    const rotatedRacers = racers.slice(roundIndex).concat(racers.slice(0, roundIndex))
    let remainingRacers = rotatedRacers.filter((racer) => (runCounts.get(racer.id) ?? 0) < race.roundsPerRacer)
    while (remainingRacers.length > 0) {
      const assignments: LaneAssignment[] = []
      const selectedRacerIds: string[] = []
      for (const lane of availableLaneNumbers) {
        if (remainingRacers.length === 0) break
        const bestCandidate = remainingRacers.map((racer, index) => ({
          racer,
          index,
          penalty: schedulingPenalty(race, racer, lane, selectedRacerIds, laneHistory, opponentCounts) +
            (runCounts.get(racer.id) ?? 0) * 10 + index
        })).sort((first, second) => first.penalty - second.penalty ||
          first.racer.racerNumber.localeCompare(second.racer.racerNumber, undefined, { numeric: true }))[0]
        if (!bestCandidate) break
        assignments.push({ lane, racerId: bestCandidate.racer.id })
        selectedRacerIds.push(bestCandidate.racer.id)
        remainingRacers = remainingRacers.filter((_, index) => index !== bestCandidate.index)
      }
      const heat = makeHeat(heatNumber, roundIndex + 1, fillOpenLanes(assignments, laneCount))
      recordHeatHistory(heat, laneHistory, opponentCounts, runCounts)
      heats.push(heat)
      heatNumber += 1
    }
  }
  return heats
}

function filledTimedOrPointsHeats(race: Race, racers: Racer[], preservedHeats: Heat[]): Heat[] {
  const heats: Heat[] = []
  const laneCount = normalizeLaneCount(race.laneCount)
  const availableLaneNumbers = activeLaneNumbers(race)
  const laneHistory = new Map<string, Set<number>>()
  const opponentCounts = new Map<string, number>()
  const runCounts = new Map<string, number>()
  for (const heat of preservedHeats) recordHeatHistory(heat, laneHistory, opponentCounts, runCounts)

  const lastPreservedHeat = preservedHeats[preservedHeats.length - 1]
  let previousHeatRacerIds = new Set<string>(lastPreservedHeat ? scheduledHeatAssignments(lastPreservedHeat).map((a) => a.racerId) : [])
  let heatNumber = 1
  while (racers.some((racer) => (runCounts.get(racer.id) ?? 0) < race.roundsPerRacer)) {
    const assignments: LaneAssignment[] = []
    const selectedRacerIds: string[] = []
    for (const lane of availableLaneNumbers) {
      const eligibleRacers = racers.filter((racer) =>
        !selectedRacerIds.includes(racer.id) && (runCounts.get(racer.id) ?? 0) < race.roundsPerRacer)
      if (eligibleRacers.length === 0) break
      const bestCandidate = eligibleRacers.map((racer, index) => ({
        racer,
        penalty: (runCounts.get(racer.id) ?? 0) * 10000 +
          schedulingPenalty(race, racer, lane, selectedRacerIds, laneHistory, opponentCounts) +
          (previousHeatRacerIds.has(racer.id) ? 50 : 0) + index
      })).sort((first, second) => first.penalty - second.penalty ||
        first.racer.racerNumber.localeCompare(second.racer.racerNumber, undefined, { numeric: true }))[0]
      assignments.push({ lane, racerId: bestCandidate.racer.id })
      selectedRacerIds.push(bestCandidate.racer.id)
    }
    if (assignments.length === 0) break
    const roundNumber = Math.min(...assignments.map((assignment) => (runCounts.get(assignment.racerId ?? '') ?? 0) + 1))
    const heat = makeHeat(heatNumber, roundNumber, fillOpenLanes(assignments, laneCount))
    recordHeatHistory(heat, laneHistory, opponentCounts, runCounts)
    previousHeatRacerIds = new Set(scheduledHeatAssignments(heat).map((assignment) => assignment.racerId))
    heats.push(heat)
    heatNumber += 1
  }
  return heats
}

export function timedOrPointsHeats(race: Race, racers: Racer[], preservedHeats: Heat[]): Heat[] {
  return race.schedulingOptions?.fillPartialHeats ?? true
    ? filledTimedOrPointsHeats(race, racers, preservedHeats)
    : strictTimedOrPointsHeats(race, racers, preservedHeats)
}
