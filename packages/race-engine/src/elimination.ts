import { nextPowerOfTwo } from './helpers'
import type { Heat, Race } from './types'

export type EliminationBracketParticipant = {
  racerId: string | null
  seed?: number
  placeholder: string
  sourceMatchNumber?: number
  sourceLabel?: string
  lossCount?: number
}

export type EliminationBracketMatch = {
  id: string
  heat?: Heat
  displayCode?: string
  supportingLabel?: string
  matchNumber: number
  roundNumber: number
  matchIndex: number
  participants: EliminationBracketParticipant[]
  sourceMatchNumbers: number[]
  status: Heat['status'] | 'pending'
  winnerId?: string
  resultSummary: string
  isCurrent: boolean
  isChampion: boolean
  isReset?: boolean
}

export type EliminationBracketRound = {
  id: string
  roundNumber: number
  label: string
  matches: EliminationBracketMatch[]
  isChampion: boolean
}

export function standardBracketSeedOrder(racerCount: number): number[] {
  const bracketSize = nextPowerOfTwo(Math.max(2, racerCount))
  let seedOrder = [1, 2]
  for (let size = 4; size <= bracketSize; size *= 2) {
    seedOrder = seedOrder.flatMap((seed) => [seed, size + 1 - seed])
  }
  return seedOrder
}

function resultRankValue(result: Heat['results'][number]): number {
  return result.finishPosition ?? result.timeMs ?? Number.POSITIVE_INFINITY
}

export function eliminationHeatWinnerId(heat: Heat | undefined): string | undefined {
  return heat?.results
    .filter((result) => result.status === 'ok' && !result.excludedFromScoring)
    .sort((first, second) => resultRankValue(first) - resultRankValue(second))[0]?.racerId
}

function roundLabel(roundIndex: number, roundCount: number): string {
  if (roundIndex === roundCount - 1) return 'Finals'
  if (roundIndex === roundCount - 2) return 'Semifinals'
  return `Round ${roundIndex + 1}`
}

function roundMatchCounts(race: Race): number[] {
  const firstRoundHeats = race.heats.filter((heat) => heat.roundNumber === 1)
  const maxSeed = Math.max(...firstRoundHeats.flatMap((heat) => heat.laneAssignments).map((assignment) => assignment.seed ?? 0), 0)
  const participantCount = Math.max(race.entries.filter((entry) => entry.status === 'active').length, maxSeed, 1)
  const actualMaxRound = Math.max(...race.heats.map((heat) => heat.roundNumber), 0)
  const counts: number[] = []
  let matchCount = Math.max(nextPowerOfTwo(Math.max(2, participantCount)) / 2, firstRoundHeats.length, 1)

  for (let round = 1; round <= actualMaxRound || matchCount >= 1; round += 1) {
    const resolved = Math.max(matchCount, race.heats.filter((heat) => heat.roundNumber === round).length, 1)
    counts.push(resolved)
    if (resolved <= 1 && round >= actualMaxRound) break
    matchCount = Math.ceil(resolved / 2)
  }
  return counts
}

function sourceMatch(heat: Heat | undefined, sources: EliminationBracketMatch[], index: number) {
  const sourceHeatId = heat?.sourceHeatIds?.[index]
  return sourceHeatId ? sources.find((match) => match.heat?.id === sourceHeatId) : sources[index]
}

function participants(heat: Heat | undefined, sources: EliminationBracketMatch[]): EliminationBracketParticipant[] {
  const assignments = heat?.laneAssignments.filter((assignment) => assignment.racerId || assignment.seed).slice(0, 2) ?? []
  const projected: EliminationBracketParticipant[] = assignments.map((assignment, index) => {
    const source = sourceMatch(heat, sources, index)
    return {
      racerId: assignment.racerId,
      seed: assignment.seed,
      placeholder: assignment.racerId ? '' : source ? `Winner of Match ${source.matchNumber}` : heat ? 'Bye' : 'TBD',
      sourceMatchNumber: source?.matchNumber
    }
  })
  if (projected.length === 0) {
    projected.push(...sources.slice(0, 2).map((source) => ({
      racerId: null, placeholder: `Winner of Match ${source.matchNumber}`, sourceMatchNumber: source.matchNumber
    })))
  }
  while (projected.length < 2) projected.push({ racerId: null, placeholder: heat || sources.length === 1 ? 'Bye' : 'TBD' })
  return projected
}

export function projectSingleEliminationBracket(race: Race, currentHeatId?: string): EliminationBracketRound[] {
  const matchCounts = roundMatchCounts(race)
  const heatsByRound = new Map<number, Heat[]>()
  for (const heat of race.heats) {
    const list = heatsByRound.get(heat.roundNumber) ?? []
    list.push(heat)
    heatsByRound.set(heat.roundNumber, list)
  }
  for (const heats of heatsByRound.values()) heats.sort((first, second) => first.heatNumber - second.heatNumber)

  const rounds: EliminationBracketRound[] = []
  let previous: EliminationBracketMatch[] = []
  let fallbackMatchNumber = 1
  for (let roundIndex = 0; roundIndex < matchCounts.length; roundIndex += 1) {
    const roundNumber = roundIndex + 1
    const heats = heatsByRound.get(roundNumber) ?? []
    const matches = Array.from({ length: matchCounts[roundIndex] }, (_, matchIndex): EliminationBracketMatch => {
      const heat = heats[matchIndex]
      const sources = previous.slice(matchIndex * 2, matchIndex * 2 + 2)
      const matchNumber = heat?.heatNumber ?? fallbackMatchNumber
      fallbackMatchNumber = Math.max(fallbackMatchNumber + 1, matchNumber + 1)
      return {
        id: heat?.id ?? `round-${roundNumber}-match-${matchIndex + 1}`,
        heat,
        matchNumber,
        roundNumber,
        matchIndex,
        participants: participants(heat, sources),
        sourceMatchNumbers: heat?.sourceHeatIds?.map((id) => previous.find((match) => match.heat?.id === id)?.matchNumber)
          .filter((number): number is number => typeof number === 'number') ?? sources.map((match) => match.matchNumber),
        status: heat?.status ?? 'pending',
        winnerId: eliminationHeatWinnerId(heat),
        resultSummary: heat?.results.length ? 'Result recorded' : 'Awaiting result',
        isCurrent: heat?.id === currentHeatId,
        isChampion: false
      }
    })
    rounds.push({ id: `round-${roundNumber}`, roundNumber, label: roundLabel(roundIndex, matchCounts.length), matches, isChampion: false })
    previous = matches
  }

  const final = previous[0]
  const championId = final?.winnerId
  rounds.push({
    id: 'champion', roundNumber: matchCounts.length + 1, label: 'Champion', isChampion: true,
    matches: [{
      id: 'champion', matchNumber: final?.matchNumber ?? fallbackMatchNumber, roundNumber: matchCounts.length + 1,
      matchIndex: 0, participants: [{ racerId: championId ?? null, placeholder: championId ? '' : final ? `Winner of Match ${final.matchNumber}` : 'Champion' }],
      sourceMatchNumbers: final ? [final.matchNumber] : [], status: championId ? 'complete' : 'pending', winnerId: championId,
      resultSummary: championId ? 'Winner determined' : 'Awaiting final winner', isCurrent: false, isChampion: true
    }]
  })
  return rounds
}
