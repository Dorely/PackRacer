import { addRace, addRaceEntry, addRacer, createRaceEvent } from './event'
import type { CreateRaceInput, RaceEvent, RaceFormat } from './types'

export function eventWithRace(
  format: RaceFormat,
  racerCount: number,
  raceOverrides: Partial<CreateRaceInput> = {}
): { event: RaceEvent; raceId: string; racerIds: string[] } {
  let event = createRaceEvent({ name: 'Test event', laneCount: 4 })
  event = addRace(event, {
    name: 'Test race',
    format,
    laneCount: 4,
    roundsPerRacer: 2,
    divisionId: event.divisions[0].id,
    ...raceOverrides
  })
  const raceId = event.currentRaceId!
  const racerIds: string[] = []

  for (let index = 1; index <= racerCount; index += 1) {
    event = addRacer(event, { racerNumber: `${index}`, name: `Racer ${index}`, divisionIds: [event.divisions[0].id] })
    const racerId = event.racers[event.racers.length - 1].id
    racerIds.push(racerId)
    event = addRaceEntry(event, raceId, { racerId })
  }

  return { event, raceId, racerIds }
}
