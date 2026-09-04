import type { Race, RaceEntry, RaceFormat, Racer, RaceEvent } from './types'

export function createId(prefix: string): string {
  if (globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function copyEvent(event: RaceEvent): RaceEvent {
  return JSON.parse(JSON.stringify(event)) as RaceEvent
}

export function sortRacers(racers: Racer[]): Racer[] {
  return [...racers].sort((first, second) => {
    const firstNumber = Number(first.racerNumber)
    const secondNumber = Number(second.racerNumber)

    if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber) && firstNumber !== secondNumber) {
      return firstNumber - secondNumber
    }

    return `${first.racerNumber} ${first.name}`.localeCompare(`${second.racerNumber} ${second.name}`)
  })
}

export function raceEntries(race: Race | undefined): RaceEntry[] {
  return race?.entries ?? []
}

export function getRaceRacers(event: RaceEvent, race: Race | undefined): Racer[] {
  const entries = raceEntries(race).filter((entry) => entry.status === 'active')

  if (entries.length === 0) {
    return []
  }

  const entryByRacerId = new Map(entries.map((entry) => [entry.racerId, entry]))
  return sortRacers(event.racers.filter((racer) => racer.status === 'active' && entryByRacerId.has(racer.id))).sort(
    (first, second) => {
      const firstSeed = entryByRacerId.get(first.id)?.seed
      const secondSeed = entryByRacerId.get(second.id)?.seed

      if (typeof firstSeed === 'number' || typeof secondSeed === 'number') {
        return (firstSeed ?? Number.POSITIVE_INFINITY) - (secondSeed ?? Number.POSITIVE_INFINITY)
      }

      return 0
    }
  )
}

export function getEligibleRacers(event: RaceEvent, race?: Race): Racer[] {
  return getRaceRacers(event, race)
}

export function getRaceDivisionId(event: RaceEvent, race: Race | undefined): string | undefined {
  const visitedRaceIds = new Set<string>()
  let currentRace = race

  while (currentRace) {
    if (visitedRaceIds.has(currentRace.id)) {
      return undefined
    }

    visitedRaceIds.add(currentRace.id)

    if (!currentRace.source) {
      return currentRace.divisionId
    }

    currentRace = event.races.find((candidate) => candidate.id === currentRace?.source?.sourceRaceId)
  }

  return undefined
}

export function getRaceDivision(event: RaceEvent, race: Race | undefined) {
  const divisionId = getRaceDivisionId(event, race)
  return event.divisions.find((division) => division.id === divisionId)
}

export function getSelectedRace(event: RaceEvent, raceId?: string): Race | undefined {
  return event.races.find((race) => race.id === (raceId ?? event.currentRaceId)) ?? event.races[0]
}

export function summarizeRaceName(race: Race | undefined): string {
  return race?.name || 'No race'
}

export function normalizeLaneCount(laneCount: number): number {
  return Math.max(1, Math.min(12, Math.trunc(laneCount) || 1))
}

export function normalizeLaneNumbers(laneNumbers: number[] | undefined, laneCount: number): number[] {
  const normalizedLaneCount = normalizeLaneCount(laneCount)
  const uniqueLaneNumbers = new Set<number>()

  for (const laneNumber of laneNumbers ?? []) {
    const normalizedLaneNumber = Math.trunc(laneNumber)

    if (normalizedLaneNumber >= 1 && normalizedLaneNumber <= normalizedLaneCount) {
      uniqueLaneNumbers.add(normalizedLaneNumber)
    }
  }

  return [...uniqueLaneNumbers].sort((first, second) => first - second)
}

export function activeLaneNumbers(race: Pick<Race, 'laneCount' | 'disabledLaneNumbers'>): number[] {
  const disabledLaneNumbers = new Set(normalizeLaneNumbers(race.disabledLaneNumbers, race.laneCount))

  return Array.from({ length: normalizeLaneCount(race.laneCount) }, (_value, index) => index + 1).filter(
    (laneNumber) => !disabledLaneNumbers.has(laneNumber)
  )
}

export function normalizeRounds(roundsPerRacer: number): number {
  return Math.max(1, Math.min(24, Math.trunc(roundsPerRacer) || 1))
}

export function formatMilliseconds(timeMs: number | undefined): string {
  if (typeof timeMs !== 'number' || !Number.isFinite(timeMs)) {
    return 'No time'
  }

  return `${(timeMs / 1000).toFixed(3)}s`
}

export function nextPowerOfTwo(value: number): number {
  let bracketSize = 1

  while (bracketSize < value) {
    bracketSize *= 2
  }

  return bracketSize
}

export function isEliminationFormat(format: RaceFormat | undefined): boolean {
  return format === 'single-elimination' || format === 'double-elimination' || format === 'triple-elimination'
}

export function eliminationLossLimit(format: RaceFormat): number {
  switch (format) {
    case 'single-elimination':
      return 1
    case 'double-elimination':
      return 2
    case 'triple-elimination':
      return 3
    case 'timed-heats':
    case 'points-heats':
    case 'round-robin':
    default:
      return 0
  }
}

export function recalculateEventStatus(event: RaceEvent): RaceEvent {
  if (event.races.length === 0) {
    event.status = 'draft'
    return event
  }

  if (event.races.every((race) => race.status === 'complete')) {
    event.status = 'complete'
  } else if (event.races.some((race) => race.status === 'running' || race.heats.some((heat) => heat.status === 'complete'))) {
    event.status = 'running'
  } else if (event.races.some((race) => race.status === 'ready' || race.heats.length > 0)) {
    event.status = 'ready'
  } else {
    event.status = 'draft'
  }

  return event
}
