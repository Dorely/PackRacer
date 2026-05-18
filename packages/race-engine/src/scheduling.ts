import { calculateStandings } from './scoring'
import {
  type AdvancementTieBreakerResolution,
  type Heat,
  type LaneAssignment,
  type LaneResult,
  type Race,
  type RaceEntry,
  type RaceEvent,
  type Racer,
  type RecordHeatResultsInput,
  type RemovalResolutionStrategy,
  type Standing
} from './types'
import { copyEvent, createId, getEligibleRacers, nextPowerOfTwo, normalizeLaneCount, nowIso } from './helpers'

function findRace(event: RaceEvent, raceId: string): Race {
  const race = event.races.find((candidate) => candidate.id === raceId)

  if (!race) {
    throw new Error('Race was not found.')
  }

  race.entries ??= []
  race.heats ??= []
  race.schedulingOptions = {
    avoidSameLane: race.schedulingOptions?.avoidSameLane ?? true,
    avoidSameOpponents: race.schedulingOptions?.avoidSameOpponents ?? true,
    fillPartialHeats: race.schedulingOptions?.fillPartialHeats ?? true
  }
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

function supportsMakeupRescheduling(race: Race): boolean {
  return race.format === 'timed-heats' || race.format === 'points-heats'
}

function usesTimeResults(race: Race): boolean {
  return race.scoringMode === 'average-time' || race.scoringMode === 'best-time' || race.scoringMode === 'total-time'
}

function validateUniqueFinishPositions(race: Race, results: LaneResult[]): void {
  if (usesTimeResults(race)) {
    return
  }

  const usedPositions = new Set<number>()

  for (const result of results) {
    if (result.status !== 'ok' || typeof result.finishPosition !== 'number') {
      continue
    }

    if (usedPositions.has(result.finishPosition)) {
      throw new Error('Each OK racer must have a unique finish position.')
    }

    usedPositions.add(result.finishPosition)
  }
}

function isMakeupResult(result: LaneResult): result is LaneResult & { status: 'dns' | 'dnf' } {
  return result.status === 'dns' || result.status === 'dnf'
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

function scheduledHeatAssignments(heat: Heat): Array<LaneAssignment & { racerId: string }> {
  const excludedResults = new Set(
    heat.results
      .filter((result) => result.excludedFromScoring)
      .map((result) => `${result.lane}:${result.racerId}`)
  )

  return heat.laneAssignments.filter(
    (assignment): assignment is LaneAssignment & { racerId: string } =>
      Boolean(assignment.racerId) && !excludedResults.has(`${assignment.lane}:${assignment.racerId}`)
  )
}

function recordHeatHistory(
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

function strictTimedOrPointsHeats(race: Race, racers: Racer[], preservedHeats: Heat[]): Heat[] {
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

function filledTimedOrPointsHeats(race: Race, racers: Racer[], preservedHeats: Heat[]): Heat[] {
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

  const lastPreservedHeat = preservedHeats[preservedHeats.length - 1]
  let previousHeatRacerIds = new Set<string>(
    lastPreservedHeat ? scheduledHeatAssignments(lastPreservedHeat).map((assignment) => assignment.racerId) : []
  )
  let heatNumber = 1

  while (racers.some((racer) => (runCounts.get(racer.id) ?? 0) < race.roundsPerRacer)) {
    const assignments: LaneAssignment[] = []
    const selectedRacerIds: string[] = []

    for (let lane = 1; lane <= laneCount; lane += 1) {
      const eligibleRacers = racers.filter(
        (racer) => !selectedRacerIds.includes(racer.id) && (runCounts.get(racer.id) ?? 0) < race.roundsPerRacer
      )

      if (eligibleRacers.length === 0) {
        break
      }

      const bestCandidate = eligibleRacers
        .map((racer, index) => {
          const repeatedLane = laneHistory.get(racer.id)?.has(lane) ? 1 : 0
          const repeatedOpponents = selectedRacerIds.reduce(
            (total, selectedRacerId) => total + (opponentCounts.get(pairKey(racer.id, selectedRacerId)) ?? 0),
            0
          )
          const runBalance = runCounts.get(racer.id) ?? 0
          const backToBack = previousHeatRacerIds.has(racer.id) ? 1 : 0

          return {
            racer,
            index,
            penalty:
              runBalance * 10000 +
              (schedulingOptions.avoidSameLane ? repeatedLane * 1000 : 0) +
              (schedulingOptions.avoidSameOpponents ? repeatedOpponents * 100 : 0) +
              backToBack * 50 +
              index
          }
        })
        .sort((first, second) => first.penalty - second.penalty || first.racer.racerNumber.localeCompare(second.racer.racerNumber, undefined, { numeric: true }))[0]

      assignments.push({ lane, racerId: bestCandidate.racer.id })
      selectedRacerIds.push(bestCandidate.racer.id)
    }

    if (assignments.length === 0) {
      break
    }

    const roundNumber = Math.min(...assignments.map((assignment) => (runCounts.get(assignment.racerId ?? '') ?? 0) + 1))
    const heat = makeHeat(heatNumber, roundNumber, fillOpenLanes(assignments, laneCount))
    recordHeatHistory(heat, laneHistory, opponentCounts, runCounts)
    previousHeatRacerIds = new Set(scheduledHeatAssignments(heat).map((assignment) => assignment.racerId))
    heats.push(heat)
    heatNumber += 1
  }

  return heats
}

function timedOrPointsHeats(race: Race, racers: Racer[], preservedHeats: Heat[]): Heat[] {
  if (race.schedulingOptions?.fillPartialHeats ?? true) {
    return filledTimedOrPointsHeats(race, racers, preservedHeats)
  }

  return strictTimedOrPointsHeats(race, racers, preservedHeats)
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

function isUnfinishedHeat(heat: Heat): boolean {
  return heat.status === 'pending' || heat.status === 'running' || heat.status === 'invalidated'
}

function hasUnfinishedHeats(race: Race): boolean {
  return race.heats.some(isUnfinishedHeat)
}

function hasMakeupAssignment(heat: Heat): boolean {
  return heat.laneAssignments.some((assignment) => assignment.makeupSource)
}

function isMakeupOnlyHeat(heat: Heat): boolean {
  return Boolean(heat.makeupSource) || (hasMakeupAssignment(heat) && heat.laneAssignments.every((assignment) => !assignment.racerId || Boolean(assignment.makeupSource)))
}

function linkedMakeupHeats(race: Race, originalHeatId: string): Heat[] {
  return race.heats.filter(
    (heat) =>
      heat.makeupSource?.originalHeatId === originalHeatId ||
      heat.laneAssignments.some((assignment) => assignment.makeupSource?.originalHeatId === originalHeatId)
  )
}

function removeReplaceableMakeupHeats(race: Race, originalHeatId: string): void {
  const linkedHeats = linkedMakeupHeats(race, originalHeatId)
  const completeMakeupHeat = linkedHeats.find((heat) => heat.status === 'complete')

  if (completeMakeupHeat) {
    throw new Error('Clear the linked makeup heat result before changing this original heat.')
  }

  if (linkedHeats.length === 0) {
    return
  }

  race.heats = race.heats
    .map((heat): Heat | null => {
      const wasMakeupOnlyHeat = isMakeupOnlyHeat(heat)
      const legacyMakeupRacerIds =
        heat.makeupSource?.originalHeatId === originalHeatId
          ? new Set(heat.makeupSource.lanes.map((lane) => lane.racerId))
          : new Set<string>()
      const nextHeat: Heat = {
        ...heat,
        laneAssignments: heat.laneAssignments.map((assignment) =>
          assignment.makeupSource?.originalHeatId === originalHeatId ||
          (assignment.racerId !== null && legacyMakeupRacerIds.has(assignment.racerId))
            ? { ...assignment, racerId: null, makeupSource: undefined }
            : assignment
        )
      }

      if (nextHeat.makeupSource?.originalHeatId === originalHeatId) {
        delete nextHeat.makeupSource
      }

      return wasMakeupOnlyHeat && !nextHeat.laneAssignments.some((assignment) => assignment.racerId)
        ? null
        : nextHeat
    })
    .filter((heat): heat is Heat => heat !== null)
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

function qualifierHeatsComplete(race: Race): boolean {
  const qualifierHeats = race.heats.filter((heat) => !heat.tieBreakerSource)

  return qualifierHeats.length > 0 && !qualifierHeats.some(isUnfinishedHeat)
}

function activeScoredStandings(event: RaceEvent, sourceRaceId: string): Standing[] {
  return calculateStandings(event, sourceRaceId).filter(
    (standing) => standing.score !== null && standing.racerStatus === 'active'
  )
}

function sameRacerSet(first: string[], second: string[]): boolean {
  if (first.length !== second.length) {
    return false
  }

  const firstSet = new Set(first)
  return second.every((racerId) => firstSet.has(racerId))
}

function pendingTieBreakerHeatIds(sourceRace: Race, dependentRaceId: string): string[] {
  return sourceRace.heats
    .filter(
      (heat) =>
        heat.tieBreakerSource?.dependentRaceId === dependentRaceId &&
        heat.tieBreakerSource.sourceRaceId === sourceRace.id &&
        isUnfinishedHeat(heat)
    )
    .map((heat) => heat.id)
}

function matchingTieBreakerRoundHeats(
  sourceRace: Race,
  dependentRaceId: string,
  topCount: number,
  mainScore: number,
  roundNumber: number,
  contestedSlots: number,
  tiedRacerIds: string[]
): Heat[] {
  return sourceRace.heats.filter((heat) => {
    const source = heat.tieBreakerSource

    return Boolean(
      source &&
        source.sourceRaceId === sourceRace.id &&
        source.dependentRaceId === dependentRaceId &&
        source.topCount === topCount &&
        source.mainScore === mainScore &&
        source.roundNumber === roundNumber &&
        source.contestedSlots === contestedSlots &&
        sameRacerSet(source.tiedRacerIds, tiedRacerIds)
    )
  })
}

function tieBreakerScore(result: LaneResult | undefined, sourceRace: Race): number {
  if (!result || result.status !== 'ok') {
    return Number.POSITIVE_INFINITY
  }

  if (sourceRace.format === 'timed-heats') {
    return typeof result.timeMs === 'number' ? result.timeMs : Number.POSITIVE_INFINITY
  }

  return typeof result.finishPosition === 'number' ? result.finishPosition : Number.POSITIVE_INFINITY
}

function scoreTieBreakerRound(sourceRace: Race, roundHeats: Heat[], tiedRacerIds: string[]): Map<string, number> {
  const scores = new Map<string, number>()

  for (const racerId of tiedRacerIds) {
    scores.set(racerId, Number.POSITIVE_INFINITY)
  }

  for (const heat of roundHeats) {
    for (const result of heat.results) {
      if (!scores.has(result.racerId)) {
        continue
      }

      scores.set(result.racerId, Math.min(scores.get(result.racerId) ?? Number.POSITIVE_INFINITY, tieBreakerScore(result, sourceRace)))
    }
  }

  return scores
}

function resolveTieBreakerScores(
  scores: Map<string, number>,
  tiedRacerIds: string[],
  contestedSlots: number
): {
  resolved: boolean
  winnerRacerIds: string[]
  unresolvedRacerIds: string[]
  unresolvedContestedSlots: number
} {
  const orderedScores = tiedRacerIds
    .map((racerId, index) => ({ racerId, index, score: scores.get(racerId) ?? Number.POSITIVE_INFINITY }))
    .sort((first, second) => first.score - second.score || first.index - second.index)
  const winnerRacerIds: string[] = []

  for (let index = 0; index < orderedScores.length; ) {
    const score = orderedScores[index].score
    const group = orderedScores.filter((candidate) => candidate.score === score)
    const nextIndex = index + group.length

    if (winnerRacerIds.length + group.length < contestedSlots) {
      winnerRacerIds.push(...group.map((candidate) => candidate.racerId))
      index = nextIndex
      continue
    }

    if (winnerRacerIds.length + group.length === contestedSlots) {
      winnerRacerIds.push(...group.map((candidate) => candidate.racerId))
      return {
        resolved: true,
        winnerRacerIds,
        unresolvedRacerIds: [],
        unresolvedContestedSlots: 0
      }
    }

    return {
      resolved: false,
      winnerRacerIds,
      unresolvedRacerIds: group.map((candidate) => candidate.racerId),
      unresolvedContestedSlots: contestedSlots - winnerRacerIds.length
    }
  }

  return {
    resolved: winnerRacerIds.length >= contestedSlots,
    winnerRacerIds,
    unresolvedRacerIds: [],
    unresolvedContestedSlots: 0
  }
}

function unresolvedTieBreakerMessage(sourceRace: Race, unresolvedRacerCount: number, contestedSlots: number): string {
  if (sourceRace.format !== 'timed-heats' && sourceRace.format !== 'points-heats') {
    return 'Automated advancement tie-breakers are only available for timed and points heat races.'
  }

  const laneCount = normalizeLaneCount(sourceRace.laneCount)

  if (sourceRace.format === 'points-heats' && unresolvedRacerCount > laneCount) {
    return `The tied cutoff group has ${unresolvedRacerCount} racers, which does not fit on a ${laneCount}-lane track. Resolve this advancement tie manually.`
  }

  return `Run a tie-breaker for ${unresolvedRacerCount} tied racer(s) to resolve ${contestedSlots} finalist slot(s).`
}

function resolveAdvancementForTarget(event: RaceEvent, targetRace: Race): AdvancementTieBreakerResolution {
  if (!targetRace.source) {
    throw new Error('This race does not have a source race configured.')
  }

  const sourceRace = event.races.find((race) => race.id === targetRace.source?.sourceRaceId)

  if (!sourceRace) {
    throw new Error('The configured source race was not found.')
  }

  const topCount = Math.max(1, targetRace.source.topCount)
  const sourceComplete = sourceRace.heats.length > 0 && !hasUnfinishedHeats(sourceRace)
  const qualifierComplete = qualifierHeatsComplete(sourceRace)
  const baseResolution: AdvancementTieBreakerResolution = {
    sourceRaceId: sourceRace.id,
    dependentRaceId: targetRace.id,
    topCount,
    sourceComplete,
    qualifierComplete,
    needsTieBreaker: false,
    resolved: true,
    canGenerateTieBreaker: false,
    selectedRacerIds: [],
    lockedRacerIds: [],
    resolvedRacerIds: [],
    tiedRacerIds: [],
    unresolvedRacerIds: [],
    contestedSlots: 0,
    unresolvedContestedSlots: 0,
    mainScore: null,
    pendingHeatIds: pendingTieBreakerHeatIds(sourceRace, targetRace.id),
    latestRoundNumber: 0,
    nextRoundNumber: 1
  }

  if (!qualifierComplete) {
    return {
      ...baseResolution,
      resolved: false,
      message: 'Complete the source race before resolving advancement.'
    }
  }

  const sourceStandings = activeScoredStandings(event, sourceRace.id)

  if (sourceStandings.length === 0) {
    return {
      ...baseResolution,
      resolved: false,
      message: 'No source standings are ready to populate this race.'
    }
  }

  const desiredCount = Math.min(topCount, sourceStandings.length)

  if (sourceStandings.length <= topCount) {
    return {
      ...baseResolution,
      selectedRacerIds: sourceStandings.map((standing) => standing.racerId)
    }
  }

  const cutoffStanding = sourceStandings[desiredCount - 1]

  if (cutoffStanding.score === null) {
    return {
      ...baseResolution,
      resolved: false,
      message: 'No source standings are ready to populate this race.'
    }
  }

  const firstTieIndex = sourceStandings.findIndex((standing) => standing.score === cutoffStanding.score)
  const tiedStandings = sourceStandings.filter((standing) => standing.score === cutoffStanding.score)
  const lockedRacerIds = sourceStandings.slice(0, firstTieIndex).map((standing) => standing.racerId)
  const tiedRacerIds = tiedStandings.map((standing) => standing.racerId)
  const contestedSlots = desiredCount - lockedRacerIds.length

  if (tiedRacerIds.length <= contestedSlots) {
    return {
      ...baseResolution,
      selectedRacerIds: sourceStandings.slice(0, desiredCount).map((standing) => standing.racerId),
      lockedRacerIds,
      tiedRacerIds,
      contestedSlots,
      mainScore: cutoffStanding.score
    }
  }

  let unresolvedRacerIds = tiedRacerIds
  let unresolvedContestedSlots = contestedSlots
  let latestRoundNumber = 0
  let nextRoundNumber = 1
  const resolvedRacerIds: string[] = []

  while (unresolvedRacerIds.length > unresolvedContestedSlots) {
    const pendingHeatIds = pendingTieBreakerHeatIds(sourceRace, targetRace.id)

    if (pendingHeatIds.length > 0) {
      return {
        ...baseResolution,
        needsTieBreaker: true,
        resolved: false,
        selectedRacerIds: [...lockedRacerIds, ...resolvedRacerIds],
        lockedRacerIds,
        resolvedRacerIds,
        tiedRacerIds,
        unresolvedRacerIds,
        contestedSlots,
        unresolvedContestedSlots,
        mainScore: cutoffStanding.score,
        pendingHeatIds,
        latestRoundNumber,
        nextRoundNumber,
        message: 'Complete the existing tie-breaker heat before generating another round.'
      }
    }

    const roundHeats = matchingTieBreakerRoundHeats(
      sourceRace,
      targetRace.id,
      topCount,
      cutoffStanding.score,
      nextRoundNumber,
      unresolvedContestedSlots,
      unresolvedRacerIds
    ).filter((heat) => heat.status === 'complete')

    if (roundHeats.length === 0) {
      break
    }

    const roundResolution = resolveTieBreakerScores(
      scoreTieBreakerRound(sourceRace, roundHeats, unresolvedRacerIds),
      unresolvedRacerIds,
      unresolvedContestedSlots
    )
    resolvedRacerIds.push(...roundResolution.winnerRacerIds)
    latestRoundNumber = nextRoundNumber

    if (roundResolution.resolved) {
      return {
        ...baseResolution,
        needsTieBreaker: true,
        resolved: true,
        selectedRacerIds: [...lockedRacerIds, ...resolvedRacerIds],
        lockedRacerIds,
        resolvedRacerIds,
        tiedRacerIds,
        unresolvedRacerIds: [],
        contestedSlots,
        unresolvedContestedSlots: 0,
        mainScore: cutoffStanding.score,
        latestRoundNumber,
        nextRoundNumber: latestRoundNumber + 1,
        message: 'Advancement tie-breaker is resolved.'
      }
    }

    unresolvedRacerIds = roundResolution.unresolvedRacerIds
    unresolvedContestedSlots = roundResolution.unresolvedContestedSlots
    nextRoundNumber += 1
  }

  if (unresolvedRacerIds.length <= unresolvedContestedSlots) {
    return {
      ...baseResolution,
      needsTieBreaker: true,
      resolved: true,
      selectedRacerIds: [...lockedRacerIds, ...resolvedRacerIds, ...unresolvedRacerIds],
      lockedRacerIds,
      resolvedRacerIds: [...resolvedRacerIds, ...unresolvedRacerIds],
      tiedRacerIds,
      unresolvedRacerIds: [],
      contestedSlots,
      unresolvedContestedSlots: 0,
      mainScore: cutoffStanding.score,
      latestRoundNumber,
      nextRoundNumber,
      message: 'Advancement tie-breaker is resolved.'
    }
  }

  const canGenerateTieBreaker =
    qualifierComplete &&
    (sourceRace.format === 'timed-heats' ||
      (sourceRace.format === 'points-heats' && unresolvedRacerIds.length <= normalizeLaneCount(sourceRace.laneCount)))

  return {
    ...baseResolution,
    needsTieBreaker: true,
    resolved: false,
    canGenerateTieBreaker,
    selectedRacerIds: [...lockedRacerIds, ...resolvedRacerIds],
    lockedRacerIds,
    resolvedRacerIds,
    tiedRacerIds,
    unresolvedRacerIds,
    contestedSlots,
    unresolvedContestedSlots,
    mainScore: cutoffStanding.score,
    latestRoundNumber,
    nextRoundNumber,
    message: unresolvedTieBreakerMessage(sourceRace, unresolvedRacerIds.length, unresolvedContestedSlots)
  }
}

export function getAdvancementTieBreakerResolution(event: RaceEvent, dependentRaceId: string): AdvancementTieBreakerResolution {
  const targetRace = event.races.find((race) => race.id === dependentRaceId)

  if (!targetRace) {
    throw new Error('Race was not found.')
  }

  return resolveAdvancementForTarget(event, targetRace)
}

export function getAdvancementTieBreakerStatuses(event: RaceEvent, sourceRaceId: string): AdvancementTieBreakerResolution[] {
  return event.races
    .filter((race) => race.source?.sourceRaceId === sourceRaceId)
    .map((race) => resolveAdvancementForTarget(event, race))
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

    const advancementResolution = resolveAdvancementForTarget(nextEvent, dependentRace)

    if (advancementResolution.needsTieBreaker && !advancementResolution.resolved) {
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

function placeMakeupResultInExistingGap(
  race: Race,
  originalHeat: Heat,
  result: LaneResult & { status: 'dns' | 'dnf' }
): string | undefined {
  const makeupSource = {
    originalHeatId: originalHeat.id,
    originalHeatNumber: originalHeat.heatNumber,
    originalLane: result.lane,
    resultStatus: result.status
  }
  const openSlotHeat = race.heats
    .filter(
      (heat) =>
        heat.id !== originalHeat.id &&
        heat.status === 'pending' &&
        heat.heatNumber > originalHeat.heatNumber &&
        !heat.makeupSource &&
        !hasMakeupAssignment(heat)
    )
    .find((heat) => heat.laneAssignments.some((assignment) => !assignment.racerId) && !heat.laneAssignments.some((assignment) => assignment.racerId === result.racerId))
  const openSlot = openSlotHeat?.laneAssignments.find((assignment) => !assignment.racerId)

  if (openSlotHeat && openSlot) {
    openSlot.racerId = result.racerId
    openSlot.makeupSource = makeupSource
    openSlotHeat.updatedAt = nowIso()
    return openSlotHeat.id
  }

  return undefined
}

function placeMakeupResultInExistingMakeupHeat(
  race: Race,
  originalHeat: Heat,
  result: LaneResult & { status: 'dns' | 'dnf' }
): string | undefined {
  const makeupSource = {
    originalHeatId: originalHeat.id,
    originalHeatNumber: originalHeat.heatNumber,
    originalLane: result.lane,
    resultStatus: result.status
  }
  const openSlotHeat = race.heats
    .filter((heat) => heat.status === 'pending' && heat.heatNumber > originalHeat.heatNumber && isMakeupOnlyHeat(heat))
    .find((heat) => heat.laneAssignments.some((assignment) => !assignment.racerId) && !heat.laneAssignments.some((assignment) => assignment.racerId === result.racerId))
  const openSlot = openSlotHeat?.laneAssignments.find((assignment) => !assignment.racerId)

  if (openSlotHeat && openSlot) {
    openSlot.racerId = result.racerId
    openSlot.makeupSource = makeupSource
    openSlotHeat.updatedAt = nowIso()
    return openSlotHeat.id
  }

  return undefined
}

function appendMakeupHeat(race: Race, originalHeat: Heat, result: LaneResult & { status: 'dns' | 'dnf' }): string {
  const makeupHeat = makeHeat(
    race.heats.length + 1,
    originalHeat.roundNumber,
    fillOpenLanes(
      [
        {
          lane: 1,
          racerId: result.racerId,
          makeupSource: {
            originalHeatId: originalHeat.id,
            originalHeatNumber: originalHeat.heatNumber,
            originalLane: result.lane,
            resultStatus: result.status
          }
        }
      ],
      race.laneCount
    )
  )

  race.heats.push(makeupHeat)
  return makeupHeat.id
}

function placeMakeupResult(
  race: Race,
  originalHeat: Heat,
  result: LaneResult & { status: 'dns' | 'dnf' }
): string {
  return (
    placeMakeupResultInExistingGap(race, originalHeat, result) ??
    placeMakeupResultInExistingMakeupHeat(race, originalHeat, result) ??
    appendMakeupHeat(race, originalHeat, result)
  )
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

  const advancementResolution = resolveAdvancementForTarget(nextEvent, targetRace)

  if (advancementResolution.needsTieBreaker && !advancementResolution.resolved) {
    throw new Error(advancementResolution.message ?? 'Run the advancement tie-breaker before populating this race.')
  }

  const sourceStandings = calculateStandings(nextEvent, source.sourceRaceId)
  const standingByRacerId = new Map(sourceStandings.map((standing) => [standing.racerId, standing]))
  const existingEntries = new Map((targetRace.entries ?? []).map((entry) => [entry.racerId, entry]))
  const createdAt = nowIso()
  const entries: RaceEntry[] = advancementResolution.selectedRacerIds
    .map((racerId) => standingByRacerId.get(racerId))
    .filter((standing): standing is Standing => Boolean(standing))
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

export function generateAdvancementTieBreakerHeats(
  event: RaceEvent,
  sourceRaceId: string,
  dependentRaceId: string
): RaceEvent {
  let nextEvent = copyEvent(event)
  const sourceRace = findRace(nextEvent, sourceRaceId)
  const dependentRace = findRace(nextEvent, dependentRaceId)

  if (dependentRace.source?.sourceRaceId !== sourceRace.id) {
    throw new Error('This race does not advance from the selected source race.')
  }

  if (dependentRace.heats.length > 0) {
    throw new Error('Dependent race heats have already been generated.')
  }

  if (sourceRace.format !== 'timed-heats' && sourceRace.format !== 'points-heats') {
    throw new Error('Automated advancement tie-breakers are only available for timed and points heat races.')
  }

  const advancementResolution = resolveAdvancementForTarget(nextEvent, dependentRace)

  if (!advancementResolution.needsTieBreaker) {
    throw new Error('No advancement tie-breaker is needed for this race.')
  }

  if (advancementResolution.resolved) {
    return populateRaceEntriesFromSource(nextEvent, dependentRace.id)
  }

  if (advancementResolution.pendingHeatIds.length > 0) {
    throw new Error('Complete the existing tie-breaker heat before generating another round.')
  }

  if (!advancementResolution.canGenerateTieBreaker || advancementResolution.mainScore === null) {
    throw new Error(advancementResolution.message ?? 'This advancement tie requires manual resolution.')
  }

  const createdAt = nowIso()
  const laneCount = normalizeLaneCount(sourceRace.laneCount)
  const tiedRacerIds = advancementResolution.unresolvedRacerIds
  const tieBreakerSource = {
    sourceRaceId: sourceRace.id,
    dependentRaceId: dependentRace.id,
    topCount: advancementResolution.topCount,
    contestedSlots: advancementResolution.unresolvedContestedSlots,
    mainScore: advancementResolution.mainScore,
    roundNumber: advancementResolution.nextRoundNumber,
    tiedRacerIds
  }
  const nextHeats: Heat[] = []

  if (sourceRace.format === 'points-heats') {
    if (tiedRacerIds.length > laneCount) {
      throw new Error(
        `The tied cutoff group has ${tiedRacerIds.length} racers, which does not fit on a ${laneCount}-lane track. Resolve this advancement tie manually.`
      )
    }

    const heat = makeHeat(
      sourceRace.heats.length + 1,
      advancementResolution.nextRoundNumber,
      fillOpenLanes(
        tiedRacerIds.map((racerId, index) => ({
          lane: index + 1,
          racerId
        })),
        laneCount
      )
    )
    heat.tieBreakerSource = tieBreakerSource
    nextHeats.push(heat)
  } else {
    for (let index = 0; index < tiedRacerIds.length; index += laneCount) {
      const heat = makeHeat(
        sourceRace.heats.length + nextHeats.length + 1,
        advancementResolution.nextRoundNumber,
        fillOpenLanes(
          tiedRacerIds.slice(index, index + laneCount).map((racerId, laneIndex) => ({
            lane: laneIndex + 1,
            racerId
          })),
          laneCount
        )
      )
      heat.tieBreakerSource = tieBreakerSource
      nextHeats.push(heat)
    }
  }

  if (nextHeats.length === 0) {
    throw new Error('No tied racers are available for a tie-breaker heat.')
  }

  sourceRace.heats = renumberHeats([...sourceRace.heats, ...nextHeats])
  sourceRace.currentHeatId = nextHeats[0].id
  sourceRace.status = 'running'
  sourceRace.updatedAt = createdAt
  nextEvent.currentRaceId = sourceRace.id
  nextEvent.status = 'running'
  nextEvent.updatedAt = createdAt
  return nextEvent
}

function generateRaceHeatsInternal(event: RaceEvent, raceId: string, options: { allowCompletedHeats: boolean }): RaceEvent {
  let nextEvent = copyEvent(event)
  let race = findRace(nextEvent, raceId)

  if (!options.allowCompletedHeats && race.heats.some((heat) => heat.status === 'complete')) {
    throw new Error('Clear recorded heat results before regenerating this race.')
  }

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

export function generateRaceHeats(event: RaceEvent, raceId: string): RaceEvent {
  return generateRaceHeatsInternal(event, raceId, { allowCompletedHeats: false })
}

export function regenerateRaceHeatsAfterRosterChange(event: RaceEvent, raceId: string): RaceEvent {
  return generateRaceHeatsInternal(event, raceId, { allowCompletedHeats: true })
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

  const rescheduleLaneSet = new Set(input.rescheduleLanes ?? [])

  if (rescheduleLaneSet.size > 0 && heat.tieBreakerSource) {
    throw new Error('Makeup runs are not available for advancement tie-breaker heats.')
  }

  if (rescheduleLaneSet.size > 0 && !supportsMakeupRescheduling(race)) {
    throw new Error('Makeup heats are only available for timed and points heat races.')
  }

  removeReplaceableMakeupHeats(race, heat.id)

  const assignedRacerIds = new Set(heat.laneAssignments.map((assignment) => assignment.racerId).filter(Boolean))
  const normalizedResults: LaneResult[] = input.results
    .filter((result) => assignedRacerIds.has(result.racerId))
    .map((result) => ({
      ...result,
      status: result.status,
      finishPosition:
        result.status === 'ok' && typeof result.finishPosition === 'number'
          ? Math.max(1, Math.trunc(result.finishPosition))
          : undefined,
      timeMs:
        typeof result.timeMs === 'number' && Number.isFinite(result.timeMs) && result.timeMs >= 0
          ? Math.round(result.timeMs)
          : undefined,
      notes: result.notes,
      excludedFromScoring: heat.tieBreakerSource ? true : undefined,
      makeupHeatId: undefined
    }))

  if (normalizedResults.length === 0) {
    throw new Error('Record at least one lane result.')
  }

  validateUniqueFinishPositions(race, normalizedResults)

  const makeupResults = supportsMakeupRescheduling(race) && !heat.tieBreakerSource
    ? normalizedResults.filter(
        (result): result is LaneResult & { status: 'dns' | 'dnf' } => rescheduleLaneSet.has(result.lane) && isMakeupResult(result)
      )
    : []

  if (makeupResults.length > 0) {
    for (const result of normalizedResults) {
      const makeupResult = makeupResults.find(
        (candidate) => candidate.lane === result.lane && candidate.racerId === result.racerId
      )

      if (makeupResult) {
        result.excludedFromScoring = true
        result.makeupHeatId = placeMakeupResult(race, heat, makeupResult)
      }
    }
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
  nextRace.heats = renumberHeats(nextRace.heats)
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

  removeReplaceableMakeupHeats(race, heat.id)

  heat.results = []
  heat.notes = undefined
  heat.status = 'pending'
  heat.updatedAt = nowIso()
  race.heats = renumberHeats(race.heats)
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
      nextEvent = generateRaceHeatsInternal(nextEvent, raceId, { allowCompletedHeats: true })
    }
  }

  delete nextEvent.activeRemovalImpact
  nextEvent.updatedAt = nowIso()
  return nextEvent
}
