import {
  PROJECT_SCHEMA_VERSION,
  type AddRacerInput,
  type AddStageInput,
  type RaceProject,
  type Racer,
  type RemovalImpact,
  type Stage,
  type UpdateProjectInput,
  type UpdateRacerInput,
  type UpdateStageInput,
  type CreateProjectInput,
  type ScoringMode
} from './types'
import { copyProject, createId, normalizeLaneCount, normalizeRounds, nowIso } from './helpers'

function defaultScoringMode(format: Stage['format']): ScoringMode {
  switch (format) {
    case 'points-heats':
      return 'points-high'
    case 'round-robin':
      return 'round-robin-record'
    case 'single-elimination':
      return 'elimination'
    case 'timed-heats':
    default:
      return 'average-time'
  }
}

export function createRaceProject(input: CreateProjectInput): RaceProject {
  const createdAt = nowIso()
  const laneCount = normalizeLaneCount(input.laneCount)

  return {
    id: createId('project'),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: input.name.trim() || 'Untitled Race',
    eventDate: input.eventDate || createdAt.slice(0, 10),
    trackName: input.trackName?.trim() || 'Main Track',
    laneCount,
    tournamentType: input.tournamentType,
    status: 'draft',
    racers: [],
    stages: [],
    createdAt,
    updatedAt: createdAt
  }
}

export function updateProjectSettings(project: RaceProject, input: UpdateProjectInput): RaceProject {
  const nextProject = copyProject(project)

  if (typeof input.name === 'string') {
    nextProject.name = input.name.trim() || nextProject.name
  }

  if (typeof input.eventDate === 'string') {
    nextProject.eventDate = input.eventDate
  }

  if (typeof input.trackName === 'string') {
    nextProject.trackName = input.trackName.trim() || nextProject.trackName
  }

  if (typeof input.laneCount === 'number') {
    nextProject.laneCount = normalizeLaneCount(input.laneCount)
  }

  if (input.tournamentType) {
    nextProject.tournamentType = input.tournamentType
  }

  if (input.status) {
    nextProject.status = input.status
  }

  nextProject.updatedAt = nowIso()
  return nextProject
}

export function addRacer(project: RaceProject, input: AddRacerInput): RaceProject {
  const nextProject = copyProject(project)
  const createdAt = nowIso()
  const racer: Racer = {
    id: createId('racer'),
    racerNumber: input.racerNumber.trim(),
    name: input.name.trim(),
    division: input.division.trim() || 'Open',
    vehicleName: input.vehicleName?.trim() || '',
    status: 'active',
    checkedIn: Boolean(input.checkedIn),
    inspectionPassed: Boolean(input.inspectionPassed),
    notes: input.notes?.trim() || '',
    createdAt,
    updatedAt: createdAt
  }

  if (!racer.racerNumber || !racer.name) {
    throw new Error('Racer number and name are required.')
  }

  nextProject.racers.push(racer)
  nextProject.updatedAt = createdAt
  return nextProject
}

export function updateRacer(project: RaceProject, racerId: string, input: UpdateRacerInput): RaceProject {
  const nextProject = copyProject(project)
  const racer = nextProject.racers.find((candidate) => candidate.id === racerId)

  if (!racer) {
    throw new Error('Racer was not found.')
  }

  Object.assign(racer, input)

  if (typeof input.racerNumber === 'string') {
    racer.racerNumber = input.racerNumber.trim()
  }

  if (typeof input.name === 'string') {
    racer.name = input.name.trim()
  }

  if (typeof input.division === 'string') {
    racer.division = input.division.trim() || 'Open'
  }

  if (typeof input.vehicleName === 'string') {
    racer.vehicleName = input.vehicleName.trim()
  }

  if (typeof input.notes === 'string') {
    racer.notes = input.notes.trim()
  }

  racer.updatedAt = nowIso()
  nextProject.updatedAt = racer.updatedAt
  return nextProject
}

export function scratchRacer(project: RaceProject, racerId: string): { project: RaceProject; impact: RemovalImpact } {
  const nextProject = copyProject(project)
  const racer = nextProject.racers.find((candidate) => candidate.id === racerId)

  if (!racer) {
    throw new Error('Racer was not found.')
  }

  racer.status = 'scratched'
  racer.updatedAt = nowIso()

  const affectedStageIds = new Set<string>()
  const affectedHeatIds: string[] = []
  const completedHeatIds: string[] = []
  const invalidatedHeatIds: string[] = []

  for (const stage of nextProject.stages) {
    for (const heat of stage.heats) {
      const hasRacer = heat.laneAssignments.some((assignment) => assignment.racerId === racerId)

      if (!hasRacer) {
        continue
      }

      affectedStageIds.add(stage.id)

      if (heat.status === 'complete') {
        completedHeatIds.push(heat.id)
        continue
      }

      affectedHeatIds.push(heat.id)
      heat.status = 'invalidated'
      heat.invalidReason = `${racer.name} was scratched from the event.`
      heat.updatedAt = nowIso()
      invalidatedHeatIds.push(heat.id)
    }
  }

  const impact: RemovalImpact = {
    racerId,
    racerName: racer.name,
    affectedStageIds: [...affectedStageIds],
    affectedHeatIds,
    completedHeatIds,
    invalidatedHeatIds,
    createdAt: nowIso()
  }

  nextProject.activeRemovalImpact = impact
  nextProject.updatedAt = impact.createdAt
  return { project: nextProject, impact }
}

export function addStage(project: RaceProject, input: AddStageInput): RaceProject {
  const nextProject = copyProject(project)
  const createdAt = nowIso()
  const laneCount = normalizeLaneCount(input.laneCount ?? nextProject.laneCount)
  const stage: Stage = {
    id: createId('stage'),
    name: input.name.trim() || `${input.format} stage`,
    format: input.format,
    status: 'draft',
    laneCount,
    roundsPerRacer: normalizeRounds(input.roundsPerRacer ?? (input.format === 'timed-heats' ? laneCount : 1)),
    scoringMode: input.scoringMode ?? defaultScoringMode(input.format),
    advancementRule: input.advancementRule,
    eligibleRacerIds: input.eligibleRacerIds,
    heats: [],
    createdAt,
    updatedAt: createdAt
  }

  nextProject.stages.push(stage)
  nextProject.currentStageId ??= stage.id
  nextProject.updatedAt = createdAt
  return nextProject
}

export function updateStage(project: RaceProject, stageId: string, input: UpdateStageInput): RaceProject {
  const nextProject = copyProject(project)
  const stage = nextProject.stages.find((candidate) => candidate.id === stageId)

  if (!stage) {
    throw new Error('Stage was not found.')
  }

  if (typeof input.name === 'string') {
    stage.name = input.name.trim() || stage.name
  }

  if (input.format) {
    stage.format = input.format
    stage.scoringMode = input.scoringMode ?? defaultScoringMode(input.format)
  }

  if (typeof input.laneCount === 'number') {
    stage.laneCount = normalizeLaneCount(input.laneCount)
  }

  if (typeof input.roundsPerRacer === 'number') {
    stage.roundsPerRacer = normalizeRounds(input.roundsPerRacer)
  }

  if (input.scoringMode) {
    stage.scoringMode = input.scoringMode
  }

  if (input.advancementRule) {
    stage.advancementRule = input.advancementRule
  }

  if (input.eligibleRacerIds) {
    stage.eligibleRacerIds = input.eligibleRacerIds
  }

  stage.updatedAt = nowIso()
  nextProject.updatedAt = stage.updatedAt
  return nextProject
}