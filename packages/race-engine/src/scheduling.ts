import { calculateStandings } from './scoring'
import {
  type Heat,
  type LaneAssignment,
  type LaneResult,
  type Race,
  type RaceEntry,
  type RaceEvent,
  type Racer,
  type RecordHeatResultsInput,
  type RemovalResolutionStrategy
} from './types'
import { copyEvent, createId, getEligibleRacers, nextPowerOfTwo, normalizeLaneCount, nowIso } from './helpers'

function findRace(event: RaceEvent, raceId: string): Race {
  const race = event.races.find((candidate) => candidate.id === raceId)

  if (!race) {
    throw new Error('Race was not found.')
  }

  race.entries ??= []
  race.heats ??= []
  race.schedulingOptions ??= { avoidSameLane: true, avoidSameOpponents: true }
  return race
}

function makeHeat(heatNumber: number, roundNumber: number, assignments: LaneAssignment[]): Heat {
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

function fillOpenLanes(assignments: LaneAssignment[], laneCount: number): LaneAssignment[] {
  const usedLanes = new Set(assignments.map((assignment) => assignment.lane))
  const nextAssignments = [...assignments]

  for (let lane = 1; lane <= laneCount; lane += 1) {
    if (!usedLanes.has(lane)) {
      nextAssignments.push({ lane, racerId: null })
    }
  }

  return nextAssignments.sort((first, second) => first.lane - second.lane)
}

function pairKey(firstRacerId: string, secondRacerId: string): string {
  return [firstRacerId, secondRacerId].sort().join(':')
}

function recordHeatHistory(
  heat: Heat,
  laneHistory: Map<string, Set<number>>,
  opponentCounts: Map<string, number>,
  runCounts: Map<string, number>
): void {
  const racerAssignments = heat.laneAssignments.filter(
    (assignment): assignment is LaneAssignment & { racerId: string } => Boolean(assignment.racerId)
  )

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

function timedOrPointsHeats(race: Race, racers: Racer[], preservedHeats: Heat[]): Heat[] {
  const heats: Heat[] = []
  const laneCount = normalizeLaneCount(race.laneCount)
  const laneHistory = new Map<string, Set<number>>()
  const opponentCounts = new Map<string, number>()
  const runCounts = new Map<string, number>()
  const schedulingOptions = {
    avoidSameLane: race.schedulingOptions?.avoidSameLane ?? true,
    avoidSameOpponents: race.schedulingOptions?.avoidSameOpponents ?? true
  }

  for (const heat of preservedHeats) {
    recordHeatHistory(heat, laneHistory, opponentCounts, runCounts)
  }

  let heatNumber = 1

  for (let roundIndex = 0; roundIndex < race.roundsPerRacer; roundIndex += 1) {
    const rotatedRacers = racers.slice(roundIndex).concat(racers.slice(0, roundIndex))
    let remainingRacers = rotatedRacers.filter((racer) => (runCounts.get(racer.id) ?? 0) < race.roundsPerRacer)

    while (remainingRacers.length > 0) {
      const assignments: LaneAssignment[] = []
      const selectedRacerIds: string[] = []

      for (let lane = 1; lane <= laneCount && remainingRacers.length > 0; lane += 1) {
        const bestCandidate = remainingRacers
          .map((racer, index) => {
            const repeatedLane = laneHistory.get(racer.id)?.has(lane) ? 1 : 0
            const repeatedOpponents = selectedRacerIds.reduce(
              (total, selectedRacerId) => total + (opponentCounts.get(pairKey(racer.id, selectedRacerId)) ?? 0),
              0
            )
            const runBalance = runCounts.get(racer.id) ?? 0

            return {
              racer,
              index,
              penalty:
                (schedulingOptions.avoidSameLane ? repeatedLane * 1000 : 0) +
                (schedulingOptions.avoidSameOpponents ? repeatedOpponents * 100 : 0) +
                runBalance * 10 +
                index
            }
          })
          .sort((first, second) => first.penalty - second.penalty || first.racer.racerNumber.localeCompare(second.racer.racerNumber, undefined, { numeric: true }))[0]

        if (!bestCandidate) {
          break
        }

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

function roundRobinHeats(race: Race, racers: Racer[]): Heat[] {
  const roster: Array<Racer | null> = racers.length % 2 === 0 ? [...racers] : [...racers, null]
  const heats: Heat[] = []
  const rounds = Math.max(0, roster.length - 1)
  let heatNumber = 1

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    for (let pairIndex = 0; pairIndex < roster.length / 2; pairIndex += 1) {
      const firstRacer = roster[pairIndex]
      const secondRacer = roster[roster.length - 1 - pairIndex]

      if (firstRacer && secondRacer) {
        heats.push(
          makeHeat(
            heatNumber,
            roundIndex + 1,
            fillOpenLanes(
              [
                { lane: 1, racerId: firstRacer.id },
                { lane: 2, racerId: secondRacer.id }
              ],
              race.laneCount
            )
          )
        )
        heatNumber += 1
      }
    }

    const fixedRacer = roster[0]
    const rotatingRacers = roster.slice(1)
    rotatingRacers.unshift(rotatingRacers.pop() ?? null)
    roster.splice(0, roster.length, fixedRacer, ...rotatingRacers)
  }

  return heats
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

function getHeatWinner(heat: Heat): string | undefined {
  return [...heat.results]
    .filter((result) => result.status === 'ok')
    .sort((first, second) => resultRankValue(first) - resultRankValue(second))[0]?.racerId
}

function singleEliminationHeats(race: Race, racers: Racer[]): Heat[] {
  const bracketSize = nextPowerOfTwo(racers.length)
  const seededRacers: Array<Racer | null> = [...racers]

  while (seededRacers.length < bracketSize) {
    seededRacers.push(null)
  }

  const heats: Heat[] = []
  let heatNumber = 1

  for (let seedIndex = 0; seedIndex < bracketSize / 2; seedIndex += 1) {
    const firstRacer = seededRacers[seedIndex]
    const secondRacer = seededRacers[bracketSize - seedIndex - 1]
    const assignments = fillOpenLanes(
      [
        { lane: 1, racerId: firstRacer?.id ?? null, seed: seedIndex + 1 },
        { lane: 2, racerId: secondRacer?.id ?? null, seed: bracketSize - seedIndex }
      ],
      race.laneCount
    )
    const heat = makeHeat(heatNumber, 1, assignments)
    const byeRacer = firstRacer && !secondRacer ? firstRacer : secondRacer && !firstRacer ? secondRacer : null

    if (byeRacer) {
      heat.status = 'complete'
      heat.results = [{ lane: firstRacer ? 1 : 2, racerId: byeRacer.id, status: 'ok', finishPosition: 1 }]
    }

    heats.push(heat)
    heatNumber += 1
  }

  return heats
}

function renumberHeats(heats: Heat[]): Heat[] {
  return heats.map((heat, index) => ({ ...heat, heatNumber: index + 1 }))
}

function nextPendingHeat(race: Race): Heat | undefined {
  return race.heats.find((heat) => heat.status === 'pending')
}

function hasUnfinishedHeats(race: Race): boolean {
  return race.heats.some((heat) => heat.status === 'pending' || heat.status === 'running' || heat.status === 'invalidated')
}

function hasPopulatableSourceStandings(event: RaceEvent, race: Race): boolean {
  if (!race.source) {
    return false
  }

  return calculateStandings(event, race.source.sourceRaceId).some(
    (standing) => standing.score !== null && standing.racerStatus === 'active'
  )
}

export function areRaceResultsLockedByStartedDependents(event: RaceEvent, sourceRaceId: string): boolean {
  return event.races.some((race) => race.source?.sourceRaceId === sourceRaceId && race.heats.length > 0)
}

function populateDependentRacesFromSource(event: RaceEvent, sourceRaceId: string): RaceEvent {
  let nextEvent = event
  const currentRaceId = nextEvent.currentRaceId
  const dependentRaceIds = nextEvent.races
    .filter((race) => race.source?.sourceRaceId === sourceRaceId)
    .map((race) => race.id)

  for (const dependentRaceId of dependentRaceIds) {
    const dependentRace = findRace(nextEvent, dependentRaceId)

    if (dependentRace.heats.length > 0 || !hasPopulatableSourceStandings(nextEvent, dependentRace)) {
      continue
    }

    nextEvent = populateRaceEntriesFromSource(nextEvent, dependentRace.id)
  }

  nextEvent.currentRaceId = currentRaceId
  return nextEvent
}

function clearUnstartedDependentRacesFromSource(event: RaceEvent, sourceRaceId: string): RaceEvent {
  const nextEvent = event
  const updatedAt = nowIso()

  for (const dependentRace of nextEvent.races) {
    if (dependentRace.source?.sourceRaceId !== sourceRaceId || dependentRace.heats.length > 0) {
      continue
    }

    dependentRace.entries = []
    dependentRace.currentHeatId = undefined
    dependentRace.status = 'draft'
    dependentRace.updatedAt = updatedAt
    nextEvent.updatedAt = updatedAt
  }

  return nextEvent
}

function advanceEliminationRounds(event: RaceEvent, raceId: string): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)

  if (race.format !== 'single-elimination') {
    return nextEvent
  }

  let generatedRound = true

  while (generatedRound) {
    generatedRound = false
    const maxRound = Math.max(...race.heats.map((heat) => heat.roundNumber), 0)
    const currentRoundHeats = race.heats.filter((heat) => heat.roundNumber === maxRound)

    if (currentRoundHeats.length === 0 || currentRoundHeats.some((heat) => heat.status !== 'complete')) {
      break
    }

    const winners = currentRoundHeats.map(getHeatWinner).filter((racerId): racerId is string => Boolean(racerId))

    if (winners.length <= 1) {
      race.status = 'complete'
      break
    }

    if (race.heats.some((heat) => heat.roundNumber === maxRound + 1)) {
      break
    }

    for (let index = 0; index < winners.length; index += 2) {
      const firstWinnerId = winners[index]
      const secondWinnerId = winners[index + 1]
      const heat = makeHeat(
        race.heats.length + 1,
        maxRound + 1,
        fillOpenLanes(
          [
            { lane: 1, racerId: firstWinnerId },
            { lane: 2, racerId: secondWinnerId ?? null }
          ],
          race.laneCount
        )
      )
      heat.sourceHeatIds = currentRoundHeats.slice(index, index + 2).map((sourceHeat) => sourceHeat.id)

      if (!secondWinnerId) {
        heat.status = 'complete'
        heat.results = [{ lane: 1, racerId: firstWinnerId, status: 'ok', finishPosition: 1 }]
      }

      race.heats.push(heat)
      generatedRound = true
    }
  }

  race.heats = renumberHeats(race.heats)
  race.updatedAt = nowIso()
  nextEvent.updatedAt = race.updatedAt
  return nextEvent
}

export function populateRaceEntriesFromSource(event: RaceEvent, raceId: string): RaceEvent {
  const nextEvent = copyEvent(event)
  const targetRace = findRace(nextEvent, raceId)

  if (!targetRace.source) {
    throw new Error('This race does not have a source race configured.')
  }

  const source = targetRace.source

  if (targetRace.heats.length > 0) {
    throw new Error('Clear generated heats before replacing this race roster from a source race.')
  }

  const sourceRace = nextEvent.races.find((race) => race.id === source.sourceRaceId)

  if (!sourceRace) {
    throw new Error('The configured source race was not found.')
  }

  if (sourceRace.heats.length === 0 || hasUnfinishedHeats(sourceRace)) {
    throw new Error('Complete the source race before generating heats for this race.')
  }

  const sourceStandings = calculateStandings(nextEvent, source.sourceRaceId)
  const existingEntries = new Map((targetRace.entries ?? []).map((entry) => [entry.racerId, entry]))
  const createdAt = nowIso()
  const entries: RaceEntry[] = sourceStandings
    .filter((standing) => standing.score !== null && standing.racerStatus === 'active')
    .slice(0, Math.max(1, source.topCount))
    .map((standing) => {
      const existingEntry = existingEntries.get(standing.racerId)

      return {
        id: existingEntry?.id ?? createId('entry'),
        racerId: standing.racerId,
        status: 'active',
        checkedIn: existingEntry?.checkedIn ?? true,
        inspectionPassed: existingEntry?.inspectionPassed ?? true,
        notes: existingEntry?.notes ?? '',
        createdAt: existingEntry?.createdAt ?? createdAt,
        updatedAt: createdAt
      }
    })

  if (entries.length === 0) {
    throw new Error('No source standings are ready to populate this race.')
  }

  targetRace.entries = entries
  targetRace.currentHeatId = undefined
  targetRace.status = 'draft'
  targetRace.heats = []
  targetRace.updatedAt = createdAt
  nextEvent.currentRaceId = targetRace.id
  nextEvent.updatedAt = createdAt
  return nextEvent
}

export function generateRaceHeats(event: RaceEvent, raceId: string): RaceEvent {
  let nextEvent = copyEvent(event)
  let race = findRace(nextEvent, raceId)

  if (race.source && !race.heats.some((heat) => heat.status === 'complete')) {
    nextEvent = populateRaceEntriesFromSource(nextEvent, race.id)
    race = findRace(nextEvent, raceId)
  }

  const racers = getEligibleRacers(nextEvent, race)

  if (racers.length === 0) {
    throw new Error('Add at least one active racer to this race before generating heats.')
  }

  const preservedHeats = race.heats.filter((heat) => heat.status === 'complete')
  const generatedHeats = (() => {
    switch (race.format) {
      case 'round-robin':
        return preservedHeats.length > 0 ? [] : roundRobinHeats(race, racers)
      case 'single-elimination':
        return preservedHeats.length > 0 ? [] : singleEliminationHeats(race, racers)
      case 'points-heats':
      case 'timed-heats':
      default:
        return timedOrPointsHeats(race, racers, preservedHeats)
    }
  })()

  race.heats = renumberHeats([...preservedHeats, ...generatedHeats])
  race.currentHeatId = race.heats.find((heat) => heat.status === 'pending')?.id
  race.status = race.currentHeatId ? (preservedHeats.length > 0 ? 'running' : 'ready') : 'complete'
  race.updatedAt = nowIso()
  nextEvent.currentRaceId = race.id
  nextEvent.status = 'ready'
  nextEvent.updatedAt = race.updatedAt

  if (race.format === 'single-elimination') {
    nextEvent = advanceEliminationRounds(nextEvent, race.id)
  }

  return nextEvent
}

export function recordHeatResults(event: RaceEvent, raceId: string, input: RecordHeatResultsInput): RaceEvent {
  let nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)
  const heat = race.heats.find((candidate) => candidate.id === input.heatId)

  if (!heat) {
    throw new Error('Heat was not found.')
  }

  if (areRaceResultsLockedByStartedDependents(nextEvent, race.id)) {
    throw new Error('Heat results are locked because a dependent race has generated heats.')
  }

  if (heat.status === 'invalidated') {
    throw new Error('Resolve the scratched racer impact before recording this heat.')
  }

  const assignedRacerIds = new Set(heat.laneAssignments.map((assignment) => assignment.racerId).filter(Boolean))
  const normalizedResults = input.results
    .filter((result) => assignedRacerIds.has(result.racerId))
    .map((result) => ({
      ...result,
      status: result.status,
      finishPosition: typeof result.finishPosition === 'number' ? Math.max(1, Math.trunc(result.finishPosition)) : undefined,
      timeMs:
        typeof result.timeMs === 'number' && Number.isFinite(result.timeMs) && result.timeMs >= 0
          ? Math.round(result.timeMs)
          : undefined
    }))

  if (normalizedResults.length === 0) {
    throw new Error('Record at least one lane result.')
  }

  heat.results = normalizedResults
  heat.notes = input.notes
  heat.status = 'complete'
  heat.updatedAt = nowIso()
  race.updatedAt = heat.updatedAt
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = heat.updatedAt

  if (race.format === 'single-elimination') {
    nextEvent = advanceEliminationRounds(nextEvent, race.id)
  }

  const nextRace = findRace(nextEvent, race.id)
  const pendingHeat = nextPendingHeat(nextRace)
  const raceComplete = !hasUnfinishedHeats(nextRace)
  nextRace.currentHeatId = pendingHeat?.id
  nextRace.status = raceComplete ? 'complete' : 'running'
  nextEvent.status = nextRace.status === 'running' ? 'running' : nextEvent.status

  if (raceComplete) {
    nextEvent = populateDependentRacesFromSource(nextEvent, nextRace.id)
  }

  return nextEvent
}

export function clearHeatResults(event: RaceEvent, raceId: string, heatId: string): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)
  const heat = race.heats.find((candidate) => candidate.id === heatId)

  if (!heat) {
    throw new Error('Heat was not found.')
  }

  if (areRaceResultsLockedByStartedDependents(nextEvent, race.id)) {
    throw new Error('Heat results are locked because a dependent race has generated heats.')
  }

  heat.results = []
  heat.notes = undefined
  heat.status = 'pending'
  heat.updatedAt = nowIso()
  race.status = 'ready'
  race.currentHeatId = heat.id
  race.updatedAt = heat.updatedAt
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = heat.updatedAt
  clearUnstartedDependentRacesFromSource(nextEvent, race.id)
  return nextEvent
}

export function deleteHeat(event: RaceEvent, raceId: string, heatId: string): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)

  if (!race.heats.some((heat) => heat.id === heatId)) {
    throw new Error('Heat was not found.')
  }

  race.heats = renumberHeats(race.heats.filter((heat) => heat.id !== heatId))
  race.updatedAt = nowIso()
  race.currentHeatId = race.currentHeatId === heatId ? nextPendingHeat(race)?.id : race.currentHeatId
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = race.updatedAt
  return nextEvent
}

export function setCurrentHeat(event: RaceEvent, raceId: string, heatId: string): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)

  if (!race.heats.some((heat) => heat.id === heatId)) {
    throw new Error('Heat was not found.')
  }

  race.currentHeatId = heatId
  race.updatedAt = nowIso()
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = race.updatedAt
  return nextEvent
}

export function advanceToNextHeat(event: RaceEvent, raceId: string): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)
  const pendingHeat = nextPendingHeat(race)
  race.currentHeatId = pendingHeat?.id
  race.updatedAt = nowIso()
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = race.updatedAt
  return nextEvent
}

export function resolveRacerRemoval(event: RaceEvent, strategy: RemovalResolutionStrategy): RaceEvent {
  let nextEvent = copyEvent(event)
  const impact = nextEvent.activeRemovalImpact

  if (!impact) {
    return nextEvent
  }

  if (strategy === 'keep-empty-lanes') {
    for (const race of nextEvent.races) {
      for (const heat of race.heats) {
        if (!impact.affectedHeatIds.includes(heat.id)) {
          continue
        }

        heat.laneAssignments = heat.laneAssignments.map((assignment) =>
          assignment.racerId === impact.racerId ? { ...assignment, racerId: null } : assignment
        )
        heat.results = []
        heat.status = 'pending'
        heat.invalidReason = undefined
        heat.updatedAt = nowIso()
      }

      race.currentHeatId = nextPendingHeat(race)?.id
    }
  }

  if (strategy === 'regenerate-pending') {
    for (const raceId of impact.affectedRaceIds) {
      nextEvent = generateRaceHeats(nextEvent, raceId)
    }
  }

  delete nextEvent.activeRemovalImpact
  nextEvent.updatedAt = nowIso()
  return nextEvent
}
