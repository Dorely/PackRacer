import {
  EVENT_SCHEMA_VERSION,
  type AddRacerInput,
  type AddStageInput,
  type CreateEventInput,
  type CreateRaceInput,
  type Race,
  type RaceEvent,
  type Racer,
  type RemovalImpact,
  type ScoringMode,
  type Stage,
  type UpdateEventInput,
  type UpdateRaceInput,
  type UpdateRacerInput,
  type UpdateStageInput
} from './types'
import { copyEvent, createId, normalizeLaneCount, normalizeRounds, nowIso } from './helpers'

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

function findRace(event: RaceEvent, raceId: string): Race {
  const race = event.races.find((candidate) => candidate.id === raceId)

  if (!race) {
    throw new Error('Race was not found.')
  }

  return race
}

export function createRaceEvent(input: CreateEventInput): RaceEvent {
  const createdAt = nowIso()
  const laneCount = normalizeLaneCount(input.laneCount)
  const raceEvent: RaceEvent = {
    id: createId('event'),
    schemaVersion: EVENT_SCHEMA_VERSION,
    name: input.name.trim() || 'Untitled Event',
    eventDate: input.eventDate || createdAt.slice(0, 10),
    trackName: input.trackName?.trim() || 'Main Track',
    laneCount,
    status: 'draft',
    racers: [],
    races: [],
    createdAt,
    updatedAt: createdAt
  }

  if (input.initialRace) {
    return addRace(raceEvent, input.initialRace)
  }

  return raceEvent
}

export function updateEventSettings(event: RaceEvent, input: UpdateEventInput): RaceEvent {
  const nextEvent = copyEvent(event)

  if (typeof input.name === 'string') {
    nextEvent.name = input.name.trim() || nextEvent.name
  }

  if (typeof input.eventDate === 'string') {
    nextEvent.eventDate = input.eventDate
  }

  if (typeof input.trackName === 'string') {
    nextEvent.trackName = input.trackName.trim() || nextEvent.trackName
  }

  if (typeof input.laneCount === 'number') {
    nextEvent.laneCount = normalizeLaneCount(input.laneCount)
  }

  if (input.status) {
    nextEvent.status = input.status
  }

  nextEvent.updatedAt = nowIso()
  return nextEvent
}

export function addRace(event: RaceEvent, input: CreateRaceInput): RaceEvent {
  const nextEvent = copyEvent(event)
  const createdAt = nowIso()
  const raceNumber = nextEvent.races.length + 1
  const race: Race = {
    id: createId('race'),
    name: input.name.trim() || `Race ${raceNumber}`,
    tournamentType: input.tournamentType,
    status: 'draft',
    laneCount: normalizeLaneCount(input.laneCount ?? nextEvent.laneCount),
    stages: [],
    createdAt,
    updatedAt: createdAt
  }

  nextEvent.races.push(race)
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = createdAt
  return nextEvent
}

export function updateRace(event: RaceEvent, raceId: string, input: UpdateRaceInput): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)

  if (typeof input.name === 'string') {
    race.name = input.name.trim() || race.name
  }

  if (input.tournamentType) {
    race.tournamentType = input.tournamentType
  }

  if (typeof input.laneCount === 'number') {
    race.laneCount = normalizeLaneCount(input.laneCount)
  }

  if (input.status) {
    race.status = input.status
  }

  race.updatedAt = nowIso()
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = race.updatedAt
  return nextEvent
}

export function addRacer(event: RaceEvent, input: AddRacerInput): RaceEvent {
  const nextEvent = copyEvent(event)
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

  nextEvent.racers.push(racer)
  nextEvent.updatedAt = createdAt
  return nextEvent
}

export function updateRacer(event: RaceEvent, racerId: string, input: UpdateRacerInput): RaceEvent {
  const nextEvent = copyEvent(event)
  const racer = nextEvent.racers.find((candidate) => candidate.id === racerId)

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
  nextEvent.updatedAt = racer.updatedAt
  return nextEvent
}

export function scratchRacer(event: RaceEvent, racerId: string): { event: RaceEvent; impact: RemovalImpact } {
  const nextEvent = copyEvent(event)
  const racer = nextEvent.racers.find((candidate) => candidate.id === racerId)

  if (!racer) {
    throw new Error('Racer was not found.')
  }

  racer.status = 'scratched'
  racer.updatedAt = nowIso()

  const affectedRaceIds = new Set<string>()
  const affectedStageIds = new Set<string>()
  const affectedHeatIds: string[] = []
  const completedHeatIds: string[] = []
  const invalidatedHeatIds: string[] = []

  for (const race of nextEvent.races) {
    for (const stage of race.stages) {
      for (const heat of stage.heats) {
        const hasRacer = heat.laneAssignments.some((assignment) => assignment.racerId === racerId)

        if (!hasRacer) {
          continue
        }

        affectedRaceIds.add(race.id)
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
  }

  const impact: RemovalImpact = {
    racerId,
    racerName: racer.name,
    affectedRaceIds: [...affectedRaceIds],
    affectedStageIds: [...affectedStageIds],
    affectedHeatIds,
    completedHeatIds,
    invalidatedHeatIds,
    createdAt: nowIso()
  }

  nextEvent.activeRemovalImpact = impact
  nextEvent.updatedAt = impact.createdAt
  return { event: nextEvent, impact }
}

export function addStageToRace(event: RaceEvent, raceId: string, input: AddStageInput): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)
  const createdAt = nowIso()
  const laneCount = normalizeLaneCount(input.laneCount ?? race.laneCount ?? nextEvent.laneCount)
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

  race.stages.push(stage)
  race.currentStageId ??= stage.id
  race.updatedAt = createdAt
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = createdAt
  return nextEvent
}

export function updateStageInRace(event: RaceEvent, raceId: string, stageId: string, input: UpdateStageInput): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)
  const stage = race.stages.find((candidate) => candidate.id === stageId)

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
  race.updatedAt = stage.updatedAt
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = stage.updatedAt
  return nextEvent
}