import type { NormalizedLaneResult } from '@packracer/timer-adapters'

export function normalizeTimerCapture(
  received: Map<number, NormalizedLaneResult>,
  expectedPhysicalLanes: Set<number>,
  initialWarnings: string[]
): { results: NormalizedLaneResult[]; missing: number[]; warnings: string[] } {
  const results = [...received.values()].sort((first, second) => first.lane - second.lane)
  const missing = [...expectedPhysicalLanes].filter((lane) => !received.has(lane))
  const warnings = [...initialWarnings]
  if (missing.length > 0) warnings.push(`Incomplete result: missing physical lane${missing.length === 1 ? '' : 's'} ${missing.join(', ')}.`)

  const timed = results.filter((result) => result.status === 'ok' && result.timeMs !== undefined)
  const tiedTimes = new Set(timed.filter((result, index) =>
    timed.some((candidate, candidateIndex) => candidateIndex !== index && candidate.timeMs === result.timeMs)
  ).map((result) => result.timeMs!))
  const tiesHaveAuthoritativePlaces = [...tiedTimes].every((timeMs) => {
    const places = timed.filter((result) => result.timeMs === timeMs).map((result) => result.finishPosition)
    return places.every((place): place is number => typeof place === 'number') && new Set(places).size === places.length
  })

  if (tiedTimes.size > 0 && !tiesHaveAuthoritativePlaces) {
    warnings.push('One or more exact ties have no authoritative place; resolve placement before saving when required.')
  }
  if (tiedTimes.size === 0 && timed.every((result) => result.finishPosition === undefined)) {
    [...timed].sort((first, second) => first.timeMs! - second.timeMs!).forEach((result, index) => { result.finishPosition = index + 1 })
  }
  return { results, missing, warnings }
}
