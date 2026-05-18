import {
  EVENT_SCHEMA_VERSION,
  type AddRaceEntryInput,
  type AddRacerInput,
  type AddStageInput,
  type CreateEventInput,
  type CreateRaceInput,
  type Race,
  type RaceEntry,
  type RaceEvent,
  type Racer,
  type RegisterRacerInput,
  type RemovalImpact,
  type ScoringMode,
  type SchedulingOptions,
  type Stage,
  type UpdateEventInput,
  type UpdateRaceEntryInput,
  type UpdateRaceInput,
  type UpdateRacerInput,
  type UpdateStageInput
} from './types'
import { copyEvent, createId, normalizeLaneCount, normalizeRounds, nowIso } from './helpers'

const defaultSchedulingOptions: SchedulingOptions = {
  avoidSameLane: true,
  avoidSameOpponents: true
}

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

function normalizeSchedulingOptions(input: Partial<SchedulingOptions> | undefined): SchedulingOptions {
  return {
    ...defaultSchedulingOptions,
    ...(input ?? {})
  }
}

function ensureRaceDefaults(race: Race): void {
  race.entries ??= []
  race.schedulingOptions = normalizeSchedulingOptions(race.schedulingOptions)
}

function findRace(event: RaceEvent, raceId: string): Race {
  const race = event.races.find((candidate) => candidate.id === raceId)

  if (!race) {
    throw new Error('Race was not found.')
  }

  ensureRaceDefaults(race)
  return race
}

function findRacer(event: RaceEvent, racerId: string): Racer {
  const racer = event.racers.find((candidate) => candidate.id === racerId)

  if (!racer) {
    throw new Error('Racer was not found.')
  }

  return racer
}

function invalidateRacerHeats(event: RaceEvent, racer: Racer, raceId: string | undefined, reason: string): RemovalImpact {
  const affectedRaceIds = new Set<string>()
  const affectedStageIds = new Set<string>()
  const affectedHeatIds: string[] = []
  const completedHeatIds: string[] = []
  const invalidatedHeatIds: string[] = []

  for (const race of event.races) {
    if (raceId && race.id !== raceId) {
      continue
    }

    for (const stage of race.stages) {
      for (const heat of stage.heats) {
        const hasRacer = heat.laneAssignments.some((assignment) => assignment.racerId === racer.id)

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
        heat.invalidReason = reason
        heat.updatedAt = nowIso()
        invalidatedHeatIds.push(heat.id)
      }
    }
  }

  return {
    racerId: racer.id,
    racerName: racer.name,
    affectedRaceIds: [...affectedRaceIds],
    affectedStageIds: [...affectedStageIds],
    affectedHeatIds,
    completedHeatIds,
    invalidatedHeatIds,
    createdAt: nowIso()
  }
}

export function createRaceEvent(input: CreateEventInput): RaceEvent {
  const createdAt = nowIso()
  const laneCount = normalizeLaneCount(input.laneCount ?? 3)
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
    entries: [],
    source: input.source,
    schedulingOptions: normalizeSchedulingOptions(input.schedulingOptions),
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

  if ('source' in input) {
    race.source = input.source
  }

  if (input.schedulingOptions) {
    race.schedulingOptions = normalizeSchedulingOptions({ ...race.schedulingOptions, ...input.schedulingOptions })
  }

  if (input.status) {
    race.status = input.status
  }

  race.updatedAt = nowIso()
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = race.updatedAt
  return nextEvent
}

export function deleteRace(event: RaceEvent, raceId: string): RaceEvent {
  const nextEvent = copyEvent(event)
  const raceIndex = nextEvent.races.findIndex((candidate) => candidate.id === raceId)

  if (raceIndex === -1) {
    throw new Error('Race was not found.')
  }

  nextEvent.races.splice(raceIndex, 1)
  nextEvent.currentRaceId = nextEvent.currentRaceId === raceId ? nextEvent.races[0]?.id : nextEvent.currentRaceId
  nextEvent.updatedAt = nowIso()
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
  const racer = findRacer(nextEvent, racerId)

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

export function deleteRacer(event: RaceEvent, racerId: string): RaceEvent {
  const nextEvent = copyEvent(event)
  findRacer(nextEvent, racerId)

  nextEvent.racers = nextEvent.racers.filter((racer) => racer.id !== racerId)

  for (const race of nextEvent.races) {
    ensureRaceDefaults(race)
    race.entries = race.entries.filter((entry) => entry.racerId !== racerId)

    for (const stage of race.stages) {
      for (const heat of stage.heats) {
        heat.laneAssignments = heat.laneAssignments.map((assignment) =>
          assignment.racerId === racerId ? { ...assignment, racerId: null } : assignment
        )
        heat.results = heat.results.filter((result) => result.racerId !== racerId)
      }
    }
  }

  if (nextEvent.activeRemovalImpact?.racerId === racerId) {
    delete nextEvent.activeRemovalImpact
  }

  nextEvent.updatedAt = nowIso()
  return nextEvent
}

export function addRaceEntry(event: RaceEvent, raceId: string, input: AddRaceEntryInput): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)
  const racer = findRacer(nextEvent, input.racerId)

  if (race.entries.some((entry) => entry.racerId === input.racerId)) {
    throw new Error(`${racer.name} is already registered for this race.`)
  }

  const createdAt = nowIso()
  const entry: RaceEntry = {
    id: createId('entry'),
    racerId: input.racerId,
    status: 'active',
    checkedIn: input.checkedIn ?? racer.checkedIn,
    inspectionPassed: input.inspectionPassed ?? racer.inspectionPassed,
    notes: input.notes?.trim() ?? '',
    createdAt,
    updatedAt: createdAt
  }

  race.entries.push(entry)
  race.updatedAt = createdAt
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = createdAt
  return nextEvent
}

export function registerRacerForRace(event: RaceEvent, raceId: string, input: RegisterRacerInput): RaceEvent {
  const nextEvent = addRacer(event, input)
  const racer = nextEvent.racers[nextEvent.racers.length - 1]

  return addRaceEntry(nextEvent, raceId, {
    racerId: racer.id,
    checkedIn: input.checkedIn,
    inspectionPassed: input.inspectionPassed,
    notes: input.notes
  })
}

export function updateRaceEntry(event: RaceEvent, raceId: string, entryId: string, input: UpdateRaceEntryInput): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)
  const entry = race.entries.find((candidate) => candidate.id === entryId)

  if (!entry) {
    throw new Error('Race entry was not found.')
  }

  Object.assign(entry, input)

  if (typeof input.notes === 'string') {
    entry.notes = input.notes.trim()
  }

  entry.updatedAt = nowIso()
  race.updatedAt = entry.updatedAt
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = entry.updatedAt
  return nextEvent
}

export function removeRaceEntry(event: RaceEvent, raceId: string, entryId: string): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)
  const entry = race.entries.find((candidate) => candidate.id === entryId)

  if (!entry) {
    throw new Error('Race entry was not found.')
  }

  const racer = findRacer(nextEvent, entry.racerId)
  const impact = invalidateRacerHeats(nextEvent, racer, race.id, `${racer.name} was removed from ${race.name}.`)
  race.entries = race.entries.filter((candidate) => candidate.id !== entryId)

  if (impact.affectedHeatIds.length > 0 || impact.completedHeatIds.length > 0) {
    nextEvent.activeRemovalImpact = impact
  }

  race.updatedAt = nowIso()
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = race.updatedAt
  return nextEvent
}

export function scratchRaceEntry(event: RaceEvent, raceId: string, entryId: string): { event: RaceEvent; impact: RemovalImpact } {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)
  const entry = race.entries.find((candidate) => candidate.id === entryId)

  if (!entry) {
    throw new Error('Race entry was not found.')
  }

  const racer = findRacer(nextEvent, entry.racerId)
  entry.status = 'scratched'
  entry.updatedAt = nowIso()
  const impact = invalidateRacerHeats(nextEvent, racer, race.id, `${racer.name} was scratched from ${race.name}.`)
  nextEvent.activeRemovalImpact = impact
  race.updatedAt = impact.createdAt
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = impact.createdAt
  return { event: nextEvent, impact }
}

export function scratchRacer(event: RaceEvent, racerId: string): { event: RaceEvent; impact: RemovalImpact } {
  const nextEvent = copyEvent(event)
  const racer = findRacer(nextEvent, racerId)

  racer.status = 'scratched'
  racer.updatedAt = nowIso()

  for (const race of nextEvent.races) {
    ensureRaceDefaults(race)

    for (const entry of race.entries) {
      if (entry.racerId === racerId) {
        entry.status = 'scratched'
        entry.updatedAt = racer.updatedAt
      }
    }
  }

  const impact = invalidateRacerHeats(nextEvent, racer, undefined, `${racer.name} was scratched from the event.`)
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

export function deleteStageFromRace(event: RaceEvent, raceId: string, stageId: string): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)
  const stageIndex = race.stages.findIndex((candidate) => candidate.id === stageId)

  if (stageIndex === -1) {
    throw new Error('Stage was not found.')
  }

  race.stages.splice(stageIndex, 1)
  race.currentStageId = race.currentStageId === stageId ? race.stages[0]?.id : race.currentStageId
  race.currentHeatId = race.stages.some((stage) => stage.heats.some((heat) => heat.id === race.currentHeatId))
    ? race.currentHeatId
    : undefined
  race.updatedAt = nowIso()
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = race.updatedAt
  return nextEvent
}