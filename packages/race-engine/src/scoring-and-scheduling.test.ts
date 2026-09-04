import { describe, expect, it } from 'vitest'

import { addRace, addRaceEntry, addRacer, createRaceEvent, scratchRaceEntry } from './event'
import { calculateStandings } from './scoring'
import { generateRaceHeats, recordHeatResults, updateRaceLaneAvailability } from './scheduling'
import type { LaneResult, RaceEvent, RaceFormat, ScoringMode } from './types'
import { eventWithRace } from './test-helpers'

function completeNext(event: RaceEvent, raceId: string, useTimes: boolean): RaceEvent {
  const race = event.races.find((candidate) => candidate.id === raceId)!
  const heat = race.heats.find((candidate) => candidate.status === 'pending')!
  const results = heat.laneAssignments
    .filter((assignment): assignment is typeof assignment & { racerId: string } => Boolean(assignment.racerId))
    .map((assignment, index): LaneResult => ({
      lane: assignment.lane,
      racerId: assignment.racerId,
      status: 'ok',
      timeMs: useTimes ? 3_000 + index * 10 : undefined,
      finishPosition: useTimes ? undefined : index + 1
    }))
  return recordHeatResults(event, raceId, { heatId: heat.id, results })
}

describe('format scheduling invariants', () => {
  it.each(['timed-heats', 'points-heats'] as RaceFormat[])('%s preserves run counts and disabled lanes', (format) => {
    const fixture = eventWithRace(format, 11, { laneCount: 4, roundsPerRacer: 3 })
    const disabled = updateRaceLaneAvailability(fixture.event, fixture.raceId, { laneNumbers: [2], disabled: true })
    const event = generateRaceHeats(disabled, fixture.raceId)
    const assignments = event.races[0].heats.flatMap((heat) => heat.laneAssignments.filter((assignment) => assignment.racerId))
    expect(assignments.some((assignment) => assignment.lane === 2)).toBe(false)
    for (const racerId of fixture.racerIds) {
      expect(assignments.filter((assignment) => assignment.racerId === racerId)).toHaveLength(3)
    }
    expect(event.races[0].heats.every((heat) => new Set(heat.laneAssignments.map((assignment) => assignment.racerId).filter(Boolean)).size === heat.laneAssignments.filter((assignment) => assignment.racerId).length)).toBe(true)
  })

  it('round robin schedules every pair exactly once', () => {
    const fixture = eventWithRace('round-robin', 7)
    const event = generateRaceHeats(fixture.event, fixture.raceId)
    const pairs = event.races[0].heats.map((heat) => heat.laneAssignments.map((assignment) => assignment.racerId).filter(Boolean).sort().join(':'))
    expect(pairs).toHaveLength(21)
    expect(new Set(pairs).size).toBe(21)
  })
})

describe('scoring modes', () => {
  it.each([
    ['best-time', 'timed-heats'], ['average-time', 'timed-heats'], ['total-time', 'timed-heats'],
    ['points-high', 'points-heats'], ['points-low', 'points-heats'], ['round-robin-record', 'round-robin']
  ] as Array<[ScoringMode, RaceFormat]>)('calculates %s standings', (scoringMode, format) => {
    const fixture = eventWithRace(format, 4, { laneCount: format === 'round-robin' ? 2 : 4, roundsPerRacer: 1, scoringMode })
    let event = generateRaceHeats(fixture.event, fixture.raceId)
    while (event.races[0].heats.some((heat) => heat.status === 'pending')) {
      event = completeNext(event, fixture.raceId, format === 'timed-heats')
    }
    const standings = calculateStandings(event, fixture.raceId)
    expect(standings).toHaveLength(4)
    expect(standings[0].score).not.toBeNull()
    expect(standings.every((standing) => standing.rank !== null)).toBe(true)
  })
})

describe('advancement and elimination progression', () => {
  it('preserves source standings as dependent-race seeds', () => {
    let event = createRaceEvent({ name: 'Seeds', laneCount: 5 })
    const divisionId = event.divisions[0].id
    event = addRace(event, { name: 'Qualifier', format: 'timed-heats', laneCount: 5, roundsPerRacer: 1, divisionId })
    const qualifierId = event.currentRaceId!
    for (let index = 1; index <= 5; index += 1) {
      event = addRacer(event, { racerNumber: `${index}`, name: `Racer ${index}`, divisionIds: [divisionId] })
      event = addRaceEntry(event, qualifierId, { racerId: event.racers[event.racers.length - 1].id })
    }
    event = generateRaceHeats(event, qualifierId)
    const heat = event.races[0].heats[0]
    const assignments = heat.laneAssignments.filter((assignment): assignment is typeof assignment & { racerId: string } => Boolean(assignment.racerId))
    event = recordHeatResults(event, qualifierId, {
      heatId: heat.id,
      results: assignments.map((assignment, index) => ({ lane: assignment.lane, racerId: assignment.racerId, status: 'ok', timeMs: 3_500 - index * 100 }))
    })
    const expectedOrder = calculateStandings(event, qualifierId).map((standing) => standing.racerId)
    event = addRace(event, { name: 'Final', format: 'single-elimination', laneCount: 2, source: { sourceRaceId: qualifierId, topCount: 5 } })
    const finalId = event.currentRaceId!
    event = generateRaceHeats(event, finalId)
    const final = event.races.find((race) => race.id === finalId)!
    expect(final.entries.sort((first, second) => first.seed! - second.seed!).map((entry) => entry.racerId)).toEqual(expectedOrder)
  })

  it.each([['double-elimination', 2], ['triple-elimination', 3]] as Array<[RaceFormat, number]>)('completes %s with the configured loss limit', (format, lossLimit) => {
    const fixture = eventWithRace(format, 4, { laneCount: 2 })
    let event = generateRaceHeats(fixture.event, fixture.raceId)
    let safety = 0
    while (event.races[0].status !== 'complete' && safety++ < 50) event = completeNext(event, fixture.raceId, false)
    expect(event.races[0].status).toBe('complete')
    const standings = calculateStandings(event, fixture.raceId)
    expect(Math.max(...standings.map((standing) => standing.losses ?? 0))).toBe(lossLimit)
  })

  it('blocks a second scratch until the first schedule impact is resolved', () => {
    const fixture = eventWithRace('timed-heats', 4)
    const event = generateRaceHeats(fixture.event, fixture.raceId)
    const entries = event.races[0].entries
    const first = scratchRaceEntry(event, fixture.raceId, entries[0].id).event
    expect(() => scratchRaceEntry(first, fixture.raceId, entries[1].id)).toThrow(/Resolve the schedule impact/)
  })
})
