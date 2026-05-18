import {
  EVENT_SCHEMA_VERSION,
  type AddRaceEntryInput,
  type AddRacerInput,
  type CreateEventInput,
  type CreateRaceInput,
  type Race,
  type RaceEntry,
  type RaceEvent,
  type RaceFormat,
  type Racer,
  type RegisterRacerInput,
  type RemovalImpact,
  type ScoringMode,
  type SchedulingOptions,
  type UpdateEventInput,
  type UpdateRaceEntryInput,
  type UpdateRaceInput,
  type UpdateRacerInput
} from './types'
import { copyEvent, createId, normalizeLaneCount, normalizeRounds, nowIso } from './helpers'
import { generateRaceHeats } from './scheduling'

const defaultSchedulingOptions: SchedulingOptions = {
  avoidSameLane: true,
  avoidSameOpponents: true,
  fillPartialHeats: true
}

function defaultScoringMode(format: RaceFormat): ScoringMode {
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

function normalizeScoringMode(format: RaceFormat, scoringMode: ScoringMode | undefined): ScoringMode {
  if (format === 'timed-heats') {
    return scoringMode === 'best-time' || scoringMode === 'total-time' || scoringMode === 'average-time'
      ? scoringMode
      : defaultScoringMode(format)
  }

  if (format === 'points-heats') {
    return scoringMode === 'points-high' || scoringMode === 'points-low' ? scoringMode : defaultScoringMode(format)
  }

  return defaultScoringMode(format)
}

function normalizeRoundsForFormat(format: RaceFormat, laneCount: number, roundsPerRacer: number | undefined): number {
  if (format === 'timed-heats' || format === 'points-heats') {
    return normalizeRounds(roundsPerRacer ?? laneCount)
  }

  return 1
}

function normalizeSchedulingOptions(input: Partial<SchedulingOptions> | undefined): SchedulingOptions {
  return {
    ...defaultSchedulingOptions,
    ...(input ?? {})
  }
}

function nextRacerNumber(event: RaceEvent): string {
  const numericNumbers = event.racers
    .map((racer) => Number(racer.racerNumber))
    .filter((racerNumber) => Number.isFinite(racerNumber))

  return `${numericNumbers.length > 0 ? Math.max(...numericNumbers) + 1 : 1}`
}

function normalizeRacerNumber(event: RaceEvent, racerNumber: string | undefined): string {
  const trimmedNumber = racerNumber?.trim() ?? ''
  return trimmedNumber || nextRacerNumber(event)
}

function supportsMidRaceEntry(race: Race): boolean {
  return race.format === 'timed-heats' || race.format === 'points-heats'
}

function ensureRaceDefaults(race: Race): void {
  race.entries ??= []
  race.schedulingOptions = normalizeSchedulingOptions(race.schedulingOptions)
  race.heats ??= []
  race.laneCount = normalizeLaneCount(race.laneCount)
  race.roundsPerRacer = normalizeRoundsForFormat(race.format, race.laneCount, race.roundsPerRacer)
  race.scoringMode = normalizeScoringMode(race.format, race.scoringMode)
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
  const affectedHeatIds: string[] = []
  const completedHeatIds: string[] = []
  const invalidatedHeatIds: string[] = []

  for (const race of event.races) {
    if (raceId && race.id !== raceId) {
      continue
    }

    ensureRaceDefaults(race)

    for (const heat of race.heats) {
      const hasRacer = heat.laneAssignments.some((assignment) => assignment.racerId === racer.id)

      if (!hasRacer) {
        continue
      }

      affectedRaceIds.add(race.id)

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

  return {
    racerId: racer.id,
    racerName: racer.name,
    affectedRaceIds: [...affectedRaceIds],
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
  const laneCount = normalizeLaneCount(input.laneCount ?? nextEvent.laneCount)
  const race: Race = {
    id: createId('race'),
    name: input.name.trim() || `Race ${raceNumber}`,
    format: input.format,
    status: 'draft',
    laneCount,
    roundsPerRacer: normalizeRoundsForFormat(input.format, laneCount, input.roundsPerRacer),
    scoringMode: normalizeScoringMode(input.format, input.scoringMode),
    advancementRule: input.advancementRule,
    eligibleRacerIds: input.eligibleRacerIds,
    entries: [],
    source: input.source,
    schedulingOptions: normalizeSchedulingOptions(input.schedulingOptions),
    heats: [],
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

  if (input.format) {
    race.format = input.format
    race.scoringMode = normalizeScoringMode(input.format, input.scoringMode)
    race.roundsPerRacer = normalizeRoundsForFormat(input.format, race.laneCount, input.roundsPerRacer ?? race.roundsPerRacer)
  }

  if (typeof input.laneCount === 'number') {
    race.laneCount = normalizeLaneCount(input.laneCount)
    race.roundsPerRacer = normalizeRoundsForFormat(race.format, race.laneCount, race.roundsPerRacer)
  }

  if (typeof input.roundsPerRacer === 'number') {
    race.roundsPerRacer = normalizeRoundsForFormat(race.format, race.laneCount, input.roundsPerRacer)
  }

  if (input.scoringMode) {
    race.scoringMode = normalizeScoringMode(race.format, input.scoringMode)
  }

  if ('advancementRule' in input) {
    race.advancementRule = input.advancementRule
  }

  if ('eligibleRacerIds' in input) {
    race.eligibleRacerIds = input.eligibleRacerIds
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

  ensureRaceDefaults(race)
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
    racerNumber: normalizeRacerNumber(nextEvent, input.racerNumber),
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

  if (!racer.name) {
    throw new Error('Racer name is required.')
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

    for (const heat of race.heats) {
      heat.laneAssignments = heat.laneAssignments.map((assignment) =>
        assignment.racerId === racerId ? { ...assignment, racerId: null } : assignment
      )
      heat.results = heat.results.filter((result) => result.racerId !== racerId)
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

  const hasGeneratedHeats = race.heats.length > 0

  if (hasGeneratedHeats && !supportsMidRaceEntry(race)) {
    throw new Error('This race format cannot accept new racers after heats are generated.')
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

  if (hasGeneratedHeats) {
    return generateRaceHeats(nextEvent, race.id)
  }

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
