import type { TimerAdapterEvent } from './types'

const placeCharacters = '!"#$%&'

export function secondsToMilliseconds(value: string): number | undefined {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined
}

export function parseEqualsRecords(line: string, numericLanes: boolean): TimerAdapterEvent[] {
  const events: TimerAdapterEvent[] = []
  const expression = numericLanes ? /(?:^|\s)(\d+)=(\d+(?:\.\d+)?)([!"#$%&]?)/g : /(?:^|\s)([A-Z])=(\d+(?:\.\d+)?)([!"#$%&]?)/gi
  for (const match of line.matchAll(expression)) {
    const physicalLane = numericLanes ? Number(match[1]) : match[1].toUpperCase().charCodeAt(0) - 64
    const timeMs = secondsToMilliseconds(match[2])
    if (timeMs === undefined) {
      events.push({ type: 'warning', message: `Ignored malformed time in “${match[0].trim()}”.` })
      continue
    }
    const placeIndex = placeCharacters.indexOf(match[3])
    events.push({ type: 'lane-result', physicalLane, timeMs, finishPosition: placeIndex >= 0 ? placeIndex + 1 : undefined })
  }
  if (events.length === 0 && /(?:^|\s)(?:[A-Z]|\d+)=/i.test(line)) {
    events.push({ type: 'warning', message: `Ignored malformed lane/time record “${line}”.` })
  }
  return events
}

export function parseNewBoldLine(line: string): TimerAdapterEvent[] {
  const events: TimerAdapterEvent[] = []
  let place = 1
  for (const match of line.matchAll(/(?:^|\s)(\d+)\s+(\d+(?:\.\d+)?)(?=\s|$)/g)) {
    const timeMs = secondsToMilliseconds(match[2])
    if (timeMs === undefined) {
      events.push({ type: 'warning', message: `Ignored malformed NewBold result “${match[0].trim()}”.` })
      continue
    }
    events.push({ type: 'lane-result', physicalLane: Number(match[1]), timeMs: timeMs >= 9_999 ? undefined : timeMs, status: timeMs >= 9_999 ? 'dnf' : 'ok', finishPosition: place++ })
  }
  if (events.length === 0 && line.trim()) events.push({ type: 'warning', message: `Ignored malformed NewBold result “${line}”.` })
  return events
}
