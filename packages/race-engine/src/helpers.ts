import type { Race, RaceEntry, Racer, RaceEvent } from './types'

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
    return sortRacers(event.racers.filter((racer) => racer.status === 'active'))
  }

  const entryRacerIds = new Set(entries.map((entry) => entry.racerId))
  return sortRacers(event.racers.filter((racer) => racer.status === 'active' && entryRacerIds.has(racer.id)))
}

export function getEligibleRacers(event: RaceEvent, race?: Race): Racer[] {
  const eligibleIds = race?.eligibleRacerIds ? new Set(race.eligibleRacerIds) : null
  const raceRacers = getRaceRacers(event, race)

  return sortRacers(
    raceRacers.filter((racer) => {
      if (racer.status !== 'active') {
        return false
      }

      return eligibleIds ? eligibleIds.has(racer.id) : true
    })
  )
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