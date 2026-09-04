import { activeLaneNumbers } from './helpers'
import { fillOpenLanes, makeHeat } from './scheduling-utilities'
import type { Heat, Race, Racer } from './types'

export function roundRobinHeats(race: Race, racers: Racer[]): Heat[] {
  const roster: Array<Racer | null> = racers.length % 2 === 0 ? [...racers] : [...racers, null]
  const heats: Heat[] = []
  const rounds = Math.max(0, roster.length - 1)
  const matchLanes = activeLaneNumbers(race).slice(0, 2)
  let heatNumber = 1
  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    for (let pairIndex = 0; pairIndex < roster.length / 2; pairIndex += 1) {
      const firstRacer = roster[pairIndex]
      const secondRacer = roster[roster.length - 1 - pairIndex]
      if (firstRacer && secondRacer) {
        heats.push(makeHeat(heatNumber, roundIndex + 1, fillOpenLanes([
          { lane: matchLanes[0], racerId: firstRacer.id },
          { lane: matchLanes[1], racerId: secondRacer.id }
        ], race.laneCount)))
        heatNumber += 1
      }
    }
    const fixedRacer = roster[0]
    const rotatingRacers = roster.slice(1)
    rotatingRacers.unshift(rotatingRacers.pop() ?? null)
    roster.splice(0, roster.length, fixedRacer, ...rotatingRacers)
  }
  return heats
}
