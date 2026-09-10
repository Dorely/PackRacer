import { describe, expect, it } from 'vitest'

import { updateRace, upgradeRaceEvent } from './event'
import { nextPowerOfTwo } from './helpers'
import {
  deferHeatRacers,
  generateRaceHeats,
  getHeatDeferralPlan,
  postponeHeat,
  recordHeatResults,
  resolveRacerRemoval
} from './scheduling'
import { calculateStandings } from './scoring'
import { EVENT_SCHEMA_VERSION, type LaneResult, type RaceEvent } from './types'
import { eventWithRace } from './test-helpers'

function completeTimedHeat(event: RaceEvent, raceId: string, heatId: string, baseTime = 3_000): RaceEvent {
  const heat = event.races.find((race) => race.id === raceId)!.heats.find((candidate) => candidate.id === heatId)!
  return recordHeatResults(event, raceId, {
    heatId,
    results: heat.laneAssignments
      .filter((assignment): assignment is typeof assignment & { racerId: string } => Boolean(assignment.racerId))
      .map((assignment, index) => ({ lane: assignment.lane, racerId: assignment.racerId, status: 'ok', timeMs: baseTime + index }))
  })
}

describe('single elimination brackets', () => {
  it('uses opening-round byes in a fixed eight-slot bracket for five racers', () => {
    const fixture = eventWithRace('single-elimination', 5)
    const event = generateRaceHeats(fixture.event, fixture.raceId)
    const race = event.races[0]
    expect(race.heats).toHaveLength(4)
    expect(race.heats.map((heat) => heat.laneAssignments.filter((assignment) => assignment.racerId).map((assignment) => assignment.seed)))
      .toEqual([[1], [4, 5], [2], [3]])
    expect(race.heats.filter((heat) => heat.status === 'complete')).toHaveLength(3)
  })

  it.each(Array.from({ length: 32 }, (_, index) => index + 1))('creates a power-of-two opening round for %i racers', (count) => {
    const fixture = eventWithRace('single-elimination', count)
    const event = generateRaceHeats(fixture.event, fixture.raceId)
    expect(event.races[0].heats).toHaveLength(nextPowerOfTwo(Math.max(2, count)) / 2)
    expect(event.races[0].heats.some((heat) => heat.laneAssignments.filter((assignment) => assignment.racerId).length === 0)).toBe(false)
  })
})

describe('heat result validation', () => {
  it.each(['points-heats', 'round-robin', 'single-elimination'] as const)(
    'retains optional times without changing placement scoring for %s', (format) => {
      const fixture = eventWithRace(format, 2, { laneCount: 2, roundsPerRacer: 1 })
      const event = generateRaceHeats(fixture.event, fixture.raceId)
      const heat = event.races[0].heats.find((candidate) => candidate.status === 'pending')!
      const results = heat.laneAssignments.filter((assignment) => assignment.racerId).map((assignment, index) => ({
        lane: assignment.lane, racerId: assignment.racerId!, status: 'ok' as const,
        finishPosition: index + 1, timeMs: index === 0 ? 3200.4 : 3000.1
      }))
      const saved = recordHeatResults(event, fixture.raceId, { heatId: heat.id, results })
      const restored = JSON.parse(JSON.stringify(saved)) as RaceEvent
      expect(restored.races[0].heats.find((candidate) => candidate.id === heat.id)!.results.map((result) => result.timeMs))
        .toEqual([3200.4, 3000.1])
      const standings = calculateStandings(restored, fixture.raceId)
      expect(standings[0].racerId).toBe(results[0].racerId)
      expect(standings[0].bestTimeMs).toBe(3200.4)
      const withoutTimes = recordHeatResults(event, fixture.raceId, {
        heatId: heat.id, results: results.map(({ timeMs: _time, ...result }) => result)
      })
      expect(calculateStandings(withoutTimes, fixture.raceId).map(({ racerId, score }) => ({ racerId, score })))
        .toEqual(standings.map(({ racerId, score }) => ({ racerId, score })))
      for (const invalid of [-1, NaN, Infinity]) {
        expect(() => recordHeatResults(event, fixture.raceId, {
          heatId: heat.id, results: [{ ...results[0], timeMs: invalid }, results[1]]
        })).toThrow(/valid non-negative time/)
      }
    }
  )

  it('preserves tenth-millisecond timer differences through result storage and standings', () => {
    const fixture = eventWithRace('timed-heats', 2, { laneCount: 2, roundsPerRacer: 1 })
    const event = generateRaceHeats(fixture.event, fixture.raceId)
    const heat = event.races[0].heats[0]
    const assignments = heat.laneAssignments.filter((assignment) => assignment.racerId)
    const saved = recordHeatResults(event, fixture.raceId, {
      heatId: heat.id,
      results: assignments.map((assignment, index) => ({ lane: assignment.lane,
        racerId: assignment.racerId!, status: 'ok', timeMs: index === 0 ? 3012.4 : 3012.3 }))
    })
    const restored = JSON.parse(JSON.stringify(saved)) as RaceEvent
    expect(restored.races[0].heats[0].results.map((result) => result.timeMs)).toEqual([3012.4, 3012.3])
    expect(calculateStandings(restored, fixture.raceId)[0].racerId).toBe(assignments[1].racerId)
  })

  it('rejects partial, duplicate, mismatched, and blank OK timed results', () => {
    const fixture = eventWithRace('timed-heats', 4)
    const event = generateRaceHeats(fixture.event, fixture.raceId)
    const heat = event.races[0].heats[0]
    const assignments = heat.laneAssignments.filter((assignment): assignment is typeof assignment & { racerId: string } => Boolean(assignment.racerId))
    const valid = assignments.map((assignment, index): LaneResult => ({ lane: assignment.lane, racerId: assignment.racerId, status: 'ok', timeMs: 3_000 + index }))

    expect(() => recordHeatResults(event, fixture.raceId, { heatId: heat.id, results: valid.slice(1) })).toThrow(/exactly one/)
    expect(() => recordHeatResults(event, fixture.raceId, { heatId: heat.id, results: [valid[0], valid[0], ...valid.slice(2)] })).toThrow(/exactly once/)
    expect(() => recordHeatResults(event, fixture.raceId, { heatId: heat.id, results: [{ ...valid[0], racerId: valid[1].racerId }, ...valid.slice(1)] })).toThrow(/assigned/)
    expect(() => recordHeatResults(event, fixture.raceId, { heatId: heat.id, results: [{ ...valid[0], timeMs: undefined }, ...valid.slice(1)] })).toThrow(/valid non-negative time/)
  })

  it('requires complete unique placement results', () => {
    const fixture = eventWithRace('points-heats', 4)
    const event = generateRaceHeats(fixture.event, fixture.raceId)
    const heat = event.races[0].heats[0]
    const results = heat.laneAssignments
      .filter((assignment): assignment is typeof assignment & { racerId: string } => Boolean(assignment.racerId))
      .map((assignment) => ({ lane: assignment.lane, racerId: assignment.racerId, status: 'ok' as const, finishPosition: 1 }))
    expect(() => recordHeatResults(event, fixture.raceId, { heatId: heat.id, results })).toThrow(/unique finish position/)

    const nonContiguous = results.map((result, index) => index === 0
      ? { ...result, status: 'dnf' as const, finishPosition: undefined }
      : { ...result, finishPosition: index + 1 })
    expect(() => recordHeatResults(event, fixture.raceId, { heatId: heat.id, results: nonContiguous })).toThrow(/complete sequence/)
  })
})

describe('scoring and standings', () => {
  it('drops exactly one slowest successful time for average scoring', () => {
    let fixture = eventWithRace('timed-heats', 2, { laneCount: 2, roundsPerRacer: 3, scoringMode: 'average-time', dropWorstTime: true })
    fixture.event = generateRaceHeats(fixture.event, fixture.raceId)
    for (const [index, heat] of [...fixture.event.races[0].heats].entries()) {
      fixture.event = completeTimedHeat(fixture.event, fixture.raceId, heat.id, 3_000 + index * 100)
    }
    const standing = calculateStandings(fixture.event, fixture.raceId)[0]
    expect(standing.scoreLabel).toContain('slowest dropped')
    expect(standing.completedHeats).toBe(3)
  })

  it('puts unscored racers after scored racers and assigns no rank', () => {
    const fixture = eventWithRace('timed-heats', 5, { laneCount: 2, roundsPerRacer: 1 })
    let event = generateRaceHeats(fixture.event, fixture.raceId)
    event = completeTimedHeat(event, fixture.raceId, event.races[0].heats[0].id)
    const standings = calculateStandings(event, fixture.raceId)
    const firstUnscored = standings.findIndex((standing) => standing.score === null)
    expect(firstUnscored).toBeGreaterThan(0)
    expect(standings.slice(firstUnscored).every((standing) => standing.rank === null)).toBe(true)
  })
})

describe('schedule changes', () => {
  it('requires confirmation to regenerate unrecorded structural changes and locks after results', () => {
    const fixture = eventWithRace('timed-heats', 6)
    const generated = generateRaceHeats(fixture.event, fixture.raceId)
    expect(() => updateRace(generated, fixture.raceId, { laneCount: 3 })).toThrow(/Confirm regeneration/)
    const regenerated = updateRace(generated, fixture.raceId, { laneCount: 3, confirmRegenerateHeats: true })
    expect(regenerated.races[0].laneCount).toBe(3)
    const recorded = completeTimedHeat(regenerated, fixture.raceId, regenerated.races[0].heats[0].id)
    expect(() => updateRace(recorded, fixture.raceId, { laneCount: 4, confirmRegenerateHeats: true })).toThrow(/locked/)
  })

  it('defers selected racers atomically and postpones the current heat', () => {
    const fixture = eventWithRace('timed-heats', 8, { laneCount: 4, roundsPerRacer: 2 })
    const generated = generateRaceHeats(fixture.event, fixture.raceId)
    const race = generated.races[0]
    const heat = race.heats[0]
    const racerId = heat.laneAssignments.find((assignment) => assignment.racerId)!.racerId!
    const plan = getHeatDeferralPlan(generated, fixture.raceId, { heatId: heat.id, racerIds: [racerId] })
    const deferred = deferHeatRacers(generated, fixture.raceId, { heatId: heat.id, racerIds: [racerId] })
    expect(deferred.races[0].heats[0].laneAssignments.some((assignment) => assignment.racerId === plan.moves[0].replacementRacerId)).toBe(true)
    expect(deferred.races[0].heats.find((candidate) => candidate.id === plan.moves[0].targetHeatId)?.laneAssignments.some((assignment) => assignment.racerId === racerId)).toBe(true)

    const beforeOrder = deferred.races[0].heats.map((candidate) => candidate.id)
    const postponed = postponeHeat(deferred, fixture.raceId, { heatId: deferred.races[0].currentHeatId! })
    expect(postponed.races[0].heats.map((candidate) => candidate.id).slice(-1)[0]).toBe(beforeOrder[0])
  })
})

describe('lifecycle and migration', () => {
  it('upgrades legacy events to current defaults', () => {
    const fixture = eventWithRace('timed-heats', 1)
    const legacy = structuredClone(fixture.event) as RaceEvent
    legacy.schemaVersion = 1
    delete (legacy.races[0] as Partial<typeof legacy.races[0]>).dropWorstTime
    const upgraded = upgradeRaceEvent(legacy)
    expect(upgraded.schemaVersion).toBe(EVENT_SCHEMA_VERSION)
    expect(upgraded.races[0].dropWorstTime).toBe(false)
  })

  it('marks the event complete when every race completes', () => {
    const fixture = eventWithRace('timed-heats', 1, { laneCount: 1, roundsPerRacer: 1 })
    let event = generateRaceHeats(fixture.event, fixture.raceId)
    event = completeTimedHeat(event, fixture.raceId, event.races[0].heats[0].id)
    expect(event.races[0].status).toBe('complete')
    expect(event.status).toBe('complete')
  })

  it('removes all-empty pending heats when keeping empty lanes', () => {
    const fixture = eventWithRace('timed-heats', 1, { laneCount: 1, roundsPerRacer: 1 })
    let event = generateRaceHeats(fixture.event, fixture.raceId)
    const heatId = event.races[0].heats[0].id
    event.activeRemovalImpact = {
      racerId: fixture.racerIds[0], racerName: 'Racer 1', affectedRaceIds: [fixture.raceId], affectedHeatIds: [heatId],
      completedHeatIds: [], invalidatedHeatIds: [heatId], createdAt: new Date().toISOString()
    }
    event.races.push({ ...structuredClone(event.races[0]), id: 'unaffected-race', name: 'Unstarted race', entries: [], heats: [], status: 'draft' })
    event.races[0].heats[0].status = 'invalidated'
    event = resolveRacerRemoval(event, 'keep-empty-lanes')
    expect(event.races[0].heats).toHaveLength(0)
    expect(event.races[1].status).toBe('draft')
    expect(event.activeRemovalImpact).toBeUndefined()
  })
})
