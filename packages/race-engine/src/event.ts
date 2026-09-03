import {
  EVENT_SCHEMA_VERSION,
  type AddRaceEntriesInput,
  type AddRaceEntryInput,
  type AddRacerInput,
  type CreateDivisionInput,
  type CreateEventInput,
  type CreateRaceInput,
  type Division,
  type Race,
  type RaceEntry,
  type RaceEvent,
  type RaceFormat,
  type Racer,
  type RacerDeletionStatus,
  type RemovalImpact,
  type ScoringMode,
  type SchedulingOptions,
  type UpdateEventInput,
  type UpdateDivisionInput,
  type UpdateRaceEntryInput,
  type UpdateRaceInput,
  type UpdateRacerInput
} from './types'
import { copyEvent, createId, getRaceDivisionId, isEliminationFormat, normalizeLaneCount, normalizeLaneNumbers, normalizeRounds, nowIso } from './helpers'
import { regenerateRaceHeatsAfterRosterChange } from './scheduling'

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
    case 'timed-heats':
    default:
      return isEliminationFormat(format) ? 'elimination' : 'average-time'
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
  race.disabledLaneNumbers = normalizeLaneNumbers(race.disabledLaneNumbers, race.laneCount)
  race.roundsPerRacer = normalizeRoundsForFormat(race.format, race.laneCount, race.roundsPerRacer)
  race.scoringMode = normalizeScoringMode(race.format, race.scoringMode)
}

function normalizeDivisionName(name: string): string {
  return name.trim()
}

function divisionNameKey(name: string): string {
  return normalizeDivisionName(name).toLocaleLowerCase()
}

function findDivision(event: RaceEvent, divisionId: string): Division {
  const division = event.divisions.find((candidate) => candidate.id === divisionId)

  if (!division) {
    throw new Error('Division was not found.')
  }

  return division
}

function validateUniqueDivisionName(event: RaceEvent, name: string, currentDivisionId?: string): string {
  const normalizedName = normalizeDivisionName(name)

  if (!normalizedName) {
    throw new Error('Division name is required.')
  }

  if (
    event.divisions.some(
      (division) => division.id !== currentDivisionId && divisionNameKey(division.name) === divisionNameKey(normalizedName)
    )
  ) {
    throw new Error('Division names must be unique.')
  }

  return normalizedName
}

function normalizeRacerDivisionIds(event: RaceEvent, divisionIds: string[]): string[] {
  const normalizedIds = [...new Set(divisionIds)]

  if (normalizedIds.length === 0) {
    throw new Error('Select at least one division for this racer.')
  }

  for (const divisionId of normalizedIds) {
    findDivision(event, divisionId)
  }

  return normalizedIds
}

function validateDirectRaceDivision(event: RaceEvent, divisionId: string | undefined): string {
  if (!divisionId) {
    throw new Error('Select a division for this race.')
  }

  findDivision(event, divisionId)
  return divisionId
}

function validateRaceSource(event: RaceEvent, raceId: string, sourceRaceId: string): void {
  if (raceId === sourceRaceId) {
    throw new Error('A race cannot populate itself.')
  }

  const sourceRace = event.races.find((race) => race.id === sourceRaceId)

  if (!sourceRace) {
    throw new Error('The configured source race was not found.')
  }

  const visitedRaceIds = new Set([raceId])
  let currentRace: Race | undefined = sourceRace

  while (currentRace) {
    if (visitedRaceIds.has(currentRace.id)) {
      throw new Error('Race source relationships cannot form a cycle.')
    }

    visitedRaceIds.add(currentRace.id)

    if (!currentRace.source) {
      currentRace = undefined
      continue
    }

    const nextSourceRace = event.races.find((race) => race.id === currentRace?.source?.sourceRaceId)

    if (!nextSourceRace) {
      throw new Error('The configured source race was not found.')
    }

    currentRace = nextSourceRace
  }
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

type LegacyRacer = Omit<Racer, 'divisionIds'> & {
  division?: string
  divisionIds?: string[]
}

type LegacyRace = Race & {
  eligibleRacerIds?: string[]
}

type LegacyRaceEvent = Omit<RaceEvent, 'divisions' | 'racers' | 'races'> & {
  divisions?: Division[]
  racers: LegacyRacer[]
  races: LegacyRace[]
}

export function upgradeRaceEvent(event: RaceEvent): RaceEvent {
  const storedEvent = copyEvent(event) as unknown as LegacyRaceEvent
  const divisions: Division[] = []
  const divisionIdRemap = new Map<string, string>()
  const divisionByName = new Map<string, Division>()

  const ensureDivision = (name: string): Division => {
    const normalizedName = normalizeDivisionName(name) || 'Open'
    const key = divisionNameKey(normalizedName)
    const existing = divisionByName.get(key)

    if (existing) {
      return existing
    }

    const division = { id: createId('division'), name: normalizedName }
    divisions.push(division)
    divisionByName.set(key, division)
    return division
  }

  for (const storedDivision of storedEvent.divisions ?? []) {
    const normalizedName = normalizeDivisionName(storedDivision.name)

    if (!normalizedName) {
      continue
    }

    const existing = divisionByName.get(divisionNameKey(normalizedName))
    const division = existing ?? { id: storedDivision.id || createId('division'), name: normalizedName }

    if (!existing) {
      divisions.push(division)
      divisionByName.set(divisionNameKey(normalizedName), division)
    }

    divisionIdRemap.set(storedDivision.id, division.id)
  }

  const racers = storedEvent.racers.map((storedRacer): Racer => {
    const legacyDivisionIds = (storedRacer.divisionIds ?? [])
      .map((divisionId) => divisionIdRemap.get(divisionId) ?? divisionId)
      .filter((divisionId) => divisions.some((division) => division.id === divisionId))
    const divisionIds = legacyDivisionIds.length > 0
      ? [...new Set(legacyDivisionIds)]
      : [ensureDivision(storedRacer.division ?? 'Open').id]
    const racer = { ...storedRacer, divisionIds } as LegacyRacer & Racer
    delete racer.division
    return racer
  })

  if (divisions.length === 0) {
    ensureDivision('Open')
  }

  const racerById = new Map(racers.map((racer) => [racer.id, racer]))
  const openDivision = () => ensureDivision('Open')
  const races = storedEvent.races.map((storedRace): Race => {
    const race = storedRace as Race
    delete storedRace.eligibleRacerIds
    ensureRaceDefaults(race)

    if (race.source) {
      delete race.divisionId
      return race
    }

    const remappedDivisionId = race.divisionId ? divisionIdRemap.get(race.divisionId) ?? race.divisionId : undefined
    const validDivisionId = divisions.some((division) => division.id === remappedDivisionId) ? remappedDivisionId : undefined
    const rosterDivisionIds = new Set(
      race.entries
        .map((entry) => racerById.get(entry.racerId)?.divisionIds[0])
        .filter((divisionId): divisionId is string => Boolean(divisionId))
    )
    race.divisionId = validDivisionId ?? (rosterDivisionIds.size === 1 ? [...rosterDivisionIds][0] : openDivision().id)

    for (const entry of race.entries) {
      const racer = racerById.get(entry.racerId)

      if (racer && !racer.divisionIds.includes(race.divisionId)) {
        racer.divisionIds.push(race.divisionId)
      }
    }

    return race
  })

  const upgradedEvent = {
    ...storedEvent,
    schemaVersion: EVENT_SCHEMA_VERSION,
    divisions,
    racers,
    races
  } as RaceEvent

  for (const race of upgradedEvent.races) {
    if (race.source && !getRaceDivisionId(upgradedEvent, race)) {
      delete race.source
      race.divisionId = openDivision().id
    }
  }

  upgradedEvent.divisions = divisions
  return upgradedEvent
}

export function createRaceEvent(input: CreateEventInput): RaceEvent {
  const createdAt = nowIso()
  const laneCount = normalizeLaneCount(input.laneCount ?? 3)
  const openDivision: Division = { id: createId('division'), name: 'Open' }
  const raceEvent: RaceEvent = {
    id: createId('event'),
    schemaVersion: EVENT_SCHEMA_VERSION,
    name: input.name.trim() || 'Untitled Event',
    eventDate: input.eventDate || createdAt.slice(0, 10),
    trackName: input.trackName?.trim() || 'Main Track',
    laneCount,
    status: 'draft',
    divisions: [openDivision],
    racers: [],
    races: [],
    createdAt,
    updatedAt: createdAt
  }

  if (input.initialRace) {
    return addRace(raceEvent, {
      ...input.initialRace,
      divisionId: input.initialRace.source ? undefined : input.initialRace.divisionId ?? openDivision.id
    })
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

export function addDivision(event: RaceEvent, input: CreateDivisionInput): RaceEvent {
  const nextEvent = copyEvent(event)
  const name = validateUniqueDivisionName(nextEvent, input.name)
  nextEvent.divisions.push({ id: createId('division'), name })
  nextEvent.schemaVersion = EVENT_SCHEMA_VERSION
  nextEvent.updatedAt = nowIso()
  return nextEvent
}

export function updateDivision(event: RaceEvent, divisionId: string, input: UpdateDivisionInput): RaceEvent {
  const nextEvent = copyEvent(event)
  const division = findDivision(nextEvent, divisionId)
  division.name = validateUniqueDivisionName(nextEvent, input.name, divisionId)
  nextEvent.schemaVersion = EVENT_SCHEMA_VERSION
  nextEvent.updatedAt = nowIso()
  return nextEvent
}

export function deleteDivision(event: RaceEvent, divisionId: string): RaceEvent {
  const nextEvent = copyEvent(event)
  const division = findDivision(nextEvent, divisionId)

  if (nextEvent.racers.some((racer) => racer.divisionIds.includes(divisionId))) {
    throw new Error(`Remove ${division.name} from every racer before deleting it.`)
  }

  if (nextEvent.races.some((race) => !race.source && race.divisionId === divisionId)) {
    throw new Error(`Move every ${division.name} race to another division before deleting it.`)
  }

  if (nextEvent.divisions.length === 1) {
    throw new Error('An event must keep at least one division.')
  }

  nextEvent.divisions = nextEvent.divisions.filter((candidate) => candidate.id !== divisionId)
  nextEvent.schemaVersion = EVENT_SCHEMA_VERSION
  nextEvent.updatedAt = nowIso()
  return nextEvent
}

export function addRace(event: RaceEvent, input: CreateRaceInput): RaceEvent {
  const nextEvent = copyEvent(event)
  const createdAt = nowIso()
  const raceNumber = nextEvent.races.length + 1
  const laneCount = normalizeLaneCount(input.laneCount ?? nextEvent.laneCount)

  if (input.source) {
    validateRaceSource(nextEvent, 'new-race', input.source.sourceRaceId)
  }

  nextEvent.schemaVersion = EVENT_SCHEMA_VERSION
  const race: Race = {
    id: createId('race'),
    name: input.name.trim() || `Race ${raceNumber}`,
    format: input.format,
    status: 'draft',
    laneCount,
    disabledLaneNumbers: [],
    roundsPerRacer: normalizeRoundsForFormat(input.format, laneCount, input.roundsPerRacer),
    scoringMode: normalizeScoringMode(input.format, input.scoringMode),
    advancementRule: input.advancementRule,
    divisionId: input.source ? undefined : validateDirectRaceDivision(nextEvent, input.divisionId),
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
  nextEvent.schemaVersion = EVENT_SCHEMA_VERSION
  const race = findRace(nextEvent, raceId)
  const previousSourceRaceId = race.source?.sourceRaceId

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
    race.disabledLaneNumbers = normalizeLaneNumbers(race.disabledLaneNumbers, race.laneCount)
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

  if ('source' in input) {
    const nextSourceRaceId = input.source?.sourceRaceId
    const sourceChanged = previousSourceRaceId !== nextSourceRaceId

    if (sourceChanged && (race.entries.length > 0 || race.heats.length > 0)) {
      throw new Error('Clear this race roster and its heats before changing how the race is populated.')
    }

    if (input.source) {
      validateRaceSource(nextEvent, race.id, input.source.sourceRaceId)
      race.source = input.source
      delete race.divisionId
    } else {
      delete race.source

      if (previousSourceRaceId) {
        race.divisionId = validateDirectRaceDivision(nextEvent, input.divisionId)
      }
    }
  }

  if ('divisionId' in input && !input.source) {
    if (race.source) {
      delete race.divisionId
    } else {
      const nextDivisionId = validateDirectRaceDivision(nextEvent, input.divisionId)

      if (nextDivisionId !== race.divisionId && (race.entries.length > 0 || race.heats.length > 0)) {
        throw new Error('Clear this race roster and its heats before changing its division.')
      }

      race.divisionId = nextDivisionId
    }
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

  if (nextEvent.races.some((race) => race.source?.sourceRaceId === raceId)) {
    throw new Error('Remove dependent race source settings before deleting this race.')
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
    divisionIds: normalizeRacerDivisionIds(nextEvent, input.divisionIds),
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

  if (typeof input.racerNumber === 'string' && !input.racerNumber.trim()) {
    throw new Error('Racer number is required.')
  }

  if (typeof input.name === 'string' && !input.name.trim()) {
    throw new Error('Racer name is required.')
  }

  if ('divisionIds' in input) {
    const nextDivisionIds = normalizeRacerDivisionIds(nextEvent, input.divisionIds ?? [])
    const removedDivisionIds = racer.divisionIds.filter((divisionId) => !nextDivisionIds.includes(divisionId))
    const blockingRace = nextEvent.races.find(
      (race) => !race.source && removedDivisionIds.includes(race.divisionId ?? '') && race.entries.some((entry) => entry.racerId === racer.id)
    )

    if (blockingRace) {
      throw new Error(`Remove ${racer.name} from ${blockingRace.name} before removing that division membership.`)
    }

    racer.divisionIds = nextDivisionIds
  }

  Object.assign(racer, { ...input, divisionIds: racer.divisionIds })

  if (typeof input.racerNumber === 'string') {
    racer.racerNumber = input.racerNumber.trim()
  }

  if (typeof input.name === 'string') {
    racer.name = input.name.trim()
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

export function getRacerDeletionStatus(event: RaceEvent, racerId: string): RacerDeletionStatus {
  findRacer(event, racerId)
  const assignedRaceIds: string[] = []
  const blockingRaceIds: string[] = []

  for (const race of event.races) {
    const isAssigned = race.entries.some((entry) => entry.racerId === racerId)
    const hasHeatReference = race.heats.some(
      (heat) =>
        heat.laneAssignments.some((assignment) => assignment.racerId === racerId) ||
        heat.results.some((result) => result.racerId === racerId)
    )

    if (isAssigned) {
      assignedRaceIds.push(race.id)
    }

    if ((isAssigned && race.heats.length > 0) || hasHeatReference) {
      blockingRaceIds.push(race.id)
    }
  }

  return {
    racerId,
    assignedRaceIds,
    blockingRaceIds,
    canDelete: blockingRaceIds.length === 0
  }
}

export function deleteRacer(event: RaceEvent, racerId: string): RaceEvent {
  const deletionStatus = getRacerDeletionStatus(event, racerId)

  if (!deletionStatus.canDelete) {
    const blockingRaceNames = deletionStatus.blockingRaceIds
      .map((raceId) => event.races.find((race) => race.id === raceId)?.name)
      .filter((name): name is string => Boolean(name))
    const raceLabel = blockingRaceNames.length > 0 ? blockingRaceNames.join(', ') : 'a scheduled race'
    throw new Error(`This racer cannot be permanently deleted because heats exist in ${raceLabel}. Use the race roster removal and scratch workflow instead.`)
  }

  const nextEvent = copyEvent(event)
  findRacer(nextEvent, racerId)
  const updatedAt = nowIso()

  nextEvent.racers = nextEvent.racers.filter((racer) => racer.id !== racerId)

  for (const race of nextEvent.races) {
    ensureRaceDefaults(race)
    const previousEntryCount = race.entries.length
    race.entries = race.entries.filter((entry) => entry.racerId !== racerId)

    if (race.entries.length !== previousEntryCount) {
      race.updatedAt = updatedAt
    }
  }

  if (nextEvent.activeRemovalImpact?.racerId === racerId) {
    delete nextEvent.activeRemovalImpact
  }

  nextEvent.updatedAt = updatedAt
  return nextEvent
}

export function addRaceEntry(event: RaceEvent, raceId: string, input: AddRaceEntryInput): RaceEvent {
  return addRaceEntries(event, raceId, {
    racerIds: [input.racerId],
    checkedIn: input.checkedIn,
    inspectionPassed: input.inspectionPassed,
    notes: input.notes
  })
}

export function addRaceEntries(event: RaceEvent, raceId: string, input: AddRaceEntriesInput): RaceEvent {
  const nextEvent = copyEvent(event)
  const race = findRace(nextEvent, raceId)

  if (race.source) {
    throw new Error('This race roster is populated from another race.')
  }

  const divisionId = validateDirectRaceDivision(nextEvent, race.divisionId)
  const existingRacerIds = new Set(race.entries.map((entry) => entry.racerId))
  const racerIds = [...new Set(input.racerIds)].filter((racerId) => !existingRacerIds.has(racerId))
  const racers = racerIds.map((racerId) => findRacer(nextEvent, racerId))

  for (const racer of racers) {
    if (racer.status !== 'active') {
      throw new Error(`${racer.name} is not active and cannot be added to this race.`)
    }

    if (!racer.divisionIds.includes(divisionId)) {
      throw new Error(`${racer.name} does not belong to this race's division.`)
    }
  }

  if (racers.length === 0) {
    return nextEvent
  }

  const hasGeneratedHeats = race.heats.length > 0

  if (hasGeneratedHeats && !supportsMidRaceEntry(race)) {
    throw new Error('This race format cannot accept new racers after heats are generated.')
  }

  const createdAt = nowIso()
  race.entries.push(
    ...racers.map((racer): RaceEntry => ({
      id: createId('entry'),
      racerId: racer.id,
      status: 'active',
      checkedIn: input.checkedIn ?? racer.checkedIn,
      inspectionPassed: input.inspectionPassed ?? racer.inspectionPassed,
      notes: input.notes?.trim() ?? '',
      createdAt,
      updatedAt: createdAt
    }))
  )
  race.updatedAt = createdAt
  nextEvent.currentRaceId = race.id
  nextEvent.updatedAt = createdAt

  if (hasGeneratedHeats) {
    return regenerateRaceHeatsAfterRosterChange(nextEvent, race.id)
  }

  return nextEvent
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
  const hasGeneratedHeats = race.heats.length > 0

  if (!hasGeneratedHeats) {
    race.entries = race.entries.filter((candidate) => candidate.id !== entryId)
    race.updatedAt = nowIso()
    nextEvent.currentRaceId = race.id
    nextEvent.updatedAt = race.updatedAt
    return nextEvent
  }

  entry.status = 'scratched'
  entry.updatedAt = nowIso()
  const impact = invalidateRacerHeats(nextEvent, racer, race.id, `${racer.name} was removed from ${race.name}.`)

  if (impact.affectedHeatIds.length > 0) {
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
