import { calculateStandings } from './scoring'
import {
  type CreateFinalsStageInput,
  type Heat,
  type LaneAssignment,
  type LaneResult,
  type RaceProject,
  type Racer,
  type RecordHeatResultsInput,
  type RemovalResolutionStrategy,
  type Stage
} from './types'
import { copyProject, createId, getEligibleRacers, nextPowerOfTwo, normalizeLaneCount, nowIso } from './helpers'
import { addStage } from './project'

function makeHeat(stage: Stage, heatNumber: number, roundNumber: number, assignments: LaneAssignment[]): Heat {
  const createdAt = nowIso()

  return {
    id: createId('heat'),
    stageId: stage.id,
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

function timedOrPointsHeats(stage: Stage, racers: Racer[]): Heat[] {
  const heats: Heat[] = []
  const laneCount = normalizeLaneCount(stage.laneCount)
  let heatNumber = 1

  for (let roundIndex = 0; roundIndex < stage.roundsPerRacer; roundIndex += 1) {
    const rotatedRacers = racers.slice(roundIndex).concat(racers.slice(0, roundIndex))

    for (let startIndex = 0; startIndex < rotatedRacers.length; startIndex += laneCount) {
      const heatRacers = rotatedRacers.slice(startIndex, startIndex + laneCount)
      const assignments = heatRacers.map((racer, racerIndex) => ({
        lane: ((racerIndex + roundIndex) % laneCount) + 1,
        racerId: racer.id
      }))

      heats.push(makeHeat(stage, heatNumber, roundIndex + 1, fillOpenLanes(assignments, laneCount)))
      heatNumber += 1
    }
  }

  return heats
}

function roundRobinHeats(stage: Stage, racers: Racer[]): Heat[] {
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
            stage,
            heatNumber,
            roundIndex + 1,
            fillOpenLanes(
              [
                { lane: 1, racerId: firstRacer.id },
                { lane: 2, racerId: secondRacer.id }
              ],
              stage.laneCount
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

function singleEliminationHeats(stage: Stage, racers: Racer[]): Heat[] {
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
      stage.laneCount
    )
    const heat = makeHeat(stage, heatNumber, 1, assignments)
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

function nextPendingHeat(project: RaceProject): Heat | undefined {
  const stage = project.stages.find((candidate) => candidate.id === project.currentStageId) ?? project.stages[0]

  return stage?.heats.find((heat) => heat.status === 'pending')
}

function advanceEliminationRounds(project: RaceProject, stageId: string): RaceProject {
  const nextProject = copyProject(project)
  const stage = nextProject.stages.find((candidate) => candidate.id === stageId)

  if (!stage || stage.format !== 'single-elimination') {
    return nextProject
  }

  let generatedRound = true

  while (generatedRound) {
    generatedRound = false
    const maxRound = Math.max(...stage.heats.map((heat) => heat.roundNumber), 0)
    const currentRoundHeats = stage.heats.filter((heat) => heat.roundNumber === maxRound)

    if (currentRoundHeats.length === 0 || currentRoundHeats.some((heat) => heat.status !== 'complete')) {
      break
    }

    const winners = currentRoundHeats.map(getHeatWinner).filter((racerId): racerId is string => Boolean(racerId))

    if (winners.length <= 1) {
      stage.status = 'complete'
      break
    }

    if (stage.heats.some((heat) => heat.roundNumber === maxRound + 1)) {
      break
    }

    for (let index = 0; index < winners.length; index += 2) {
      const firstWinnerId = winners[index]
      const secondWinnerId = winners[index + 1]
      const heat = makeHeat(
        stage,
        stage.heats.length + 1,
        maxRound + 1,
        fillOpenLanes(
          [
            { lane: 1, racerId: firstWinnerId },
            { lane: 2, racerId: secondWinnerId ?? null }
          ],
          stage.laneCount
        )
      )
      heat.sourceHeatIds = currentRoundHeats.slice(index, index + 2).map((sourceHeat) => sourceHeat.id)

      if (!secondWinnerId) {
        heat.status = 'complete'
        heat.results = [{ lane: 1, racerId: firstWinnerId, status: 'ok', finishPosition: 1 }]
      }

      stage.heats.push(heat)
      generatedRound = true
    }
  }

  stage.heats = renumberHeats(stage.heats)
  stage.updatedAt = nowIso()
  nextProject.updatedAt = stage.updatedAt
  return nextProject
}

export function generateStageHeats(project: RaceProject, stageId: string): RaceProject {
  let nextProject = copyProject(project)
  const stage = nextProject.stages.find((candidate) => candidate.id === stageId)

  if (!stage) {
    throw new Error('Stage was not found.')
  }

  const racers = getEligibleRacers(nextProject, stage)

  if (racers.length === 0) {
    throw new Error('Add at least one active racer before generating heats.')
  }

  const preservedHeats = stage.heats.filter((heat) => heat.status === 'complete')
  const generatedHeats = (() => {
    switch (stage.format) {
      case 'round-robin':
        return roundRobinHeats(stage, racers)
      case 'single-elimination':
        return singleEliminationHeats(stage, racers)
      case 'points-heats':
      case 'timed-heats':
      default:
        return timedOrPointsHeats(stage, racers)
    }
  })()

  stage.heats = renumberHeats([...preservedHeats, ...generatedHeats])
  stage.status = 'scheduled'
  stage.updatedAt = nowIso()
  nextProject.currentStageId = stage.id
  nextProject.currentHeatId = stage.heats.find((heat) => heat.status === 'pending')?.id
  nextProject.status = 'ready'
  nextProject.updatedAt = stage.updatedAt

  if (stage.format === 'single-elimination') {
    nextProject = advanceEliminationRounds(nextProject, stage.id)
  }

  return nextProject
}

export function recordHeatResults(project: RaceProject, input: RecordHeatResultsInput): RaceProject {
  let nextProject = copyProject(project)
  const stage = nextProject.stages.find((candidate) => candidate.heats.some((heat) => heat.id === input.heatId))
  const heat = stage?.heats.find((candidate) => candidate.id === input.heatId)

  if (!stage || !heat) {
    throw new Error('Heat was not found.')
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
  stage.status = stage.heats.some((candidate) => candidate.status === 'pending') ? 'running' : 'complete'
  stage.updatedAt = heat.updatedAt
  nextProject.status = stage.status === 'complete' ? nextProject.status : 'running'
  nextProject.currentStageId = stage.id
  nextProject.updatedAt = heat.updatedAt

  if (stage.format === 'single-elimination') {
    nextProject = advanceEliminationRounds(nextProject, stage.id)
  }

  const pendingHeat = nextPendingHeat(nextProject)
  nextProject.currentHeatId = pendingHeat?.id
  return nextProject
}

export function setCurrentHeat(project: RaceProject, heatId: string): RaceProject {
  const nextProject = copyProject(project)
  const stage = nextProject.stages.find((candidate) => candidate.heats.some((heat) => heat.id === heatId))

  if (!stage) {
    throw new Error('Heat was not found.')
  }

  nextProject.currentStageId = stage.id
  nextProject.currentHeatId = heatId
  nextProject.updatedAt = nowIso()
  return nextProject
}

export function advanceToNextHeat(project: RaceProject): RaceProject {
  const nextProject = copyProject(project)
  const pendingHeat = nextPendingHeat(nextProject)
  nextProject.currentHeatId = pendingHeat?.id
  nextProject.updatedAt = nowIso()
  return nextProject
}

export function resolveRacerRemoval(project: RaceProject, strategy: RemovalResolutionStrategy): RaceProject {
  let nextProject = copyProject(project)
  const impact = nextProject.activeRemovalImpact

  if (!impact) {
    return nextProject
  }

  if (strategy === 'keep-empty-lanes') {
    for (const stage of nextProject.stages) {
      for (const heat of stage.heats) {
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
    }
  }

  if (strategy === 'regenerate-pending') {
    for (const stageId of impact.affectedStageIds) {
      nextProject = generateStageHeats(nextProject, stageId)
    }
  }

  delete nextProject.activeRemovalImpact
  nextProject.currentHeatId = nextPendingHeat(nextProject)?.id
  nextProject.updatedAt = nowIso()
  return nextProject
}

export function createFinalsStage(project: RaceProject, input: CreateFinalsStageInput): RaceProject {
  const sourceStandings = calculateStandings(project, input.sourceStageId)
  const advancedRacerIds = sourceStandings
    .filter((standing) => standing.score !== null && standing.racerStatus === 'active')
    .slice(0, Math.max(1, input.topCount))
    .map((standing) => standing.racerId)

  if (advancedRacerIds.length === 0) {
    throw new Error('No racers are eligible to advance yet.')
  }

  const sourceStage = project.stages.find((stage) => stage.id === input.sourceStageId)
  const nextProject = addStage(project, {
    name: input.name,
    format: input.format,
    laneCount: input.laneCount ?? sourceStage?.laneCount ?? project.laneCount,
    roundsPerRacer: input.format === 'timed-heats' ? input.laneCount ?? sourceStage?.laneCount ?? project.laneCount : 1,
    scoringMode: input.scoringMode,
    eligibleRacerIds: advancedRacerIds
  })

  return nextProject
}