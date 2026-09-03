import type { ArmedHeat, SimulatorScenario, TimerAdapterEvent } from './types'

function hashText(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function generateSimulatedTimerEvents(
  heat: ArmedHeat,
  scenario: SimulatorScenario,
  variation: number
): TimerAdapterEvent[] {
  if (scenario === 'disconnect-during-heat') {
    return [{ type: 'race-started' }, { type: 'warning', message: 'SIMULATED_DISCONNECT' }]
  }

  const seed = hashText(`${heat.heatId}:${variation}`)
  const ordered = [...heat.lanes].sort((first, second) => {
    const firstValue = hashText(`${seed}:${first.lane}`)
    const secondValue = hashText(`${seed}:${second.lane}`)
    return firstValue - secondValue
  })
  const baseTime = 2_950 + (seed % 80)
  const results: TimerAdapterEvent[] = [{ type: 'race-started' }]

  ordered.forEach((lane, index) => {
    if (scenario === 'incomplete-result' && index === ordered.length - 1) {
      return
    }

    if (scenario === 'explicit-dnf' && index === ordered.length - 1) {
      results.push({ type: 'lane-result', physicalLane: lane.lane, status: 'dnf' })
      return
    }

    const step = scenario === 'close-finish' ? 2 : 31
    const timeMs = scenario === 'exact-tie' && index < 2 ? baseTime : baseTime + index * step
    results.push({ type: 'lane-result', physicalLane: lane.lane, timeMs, finishPosition: scenario === 'exact-tie' ? undefined : index + 1 })
  })

  if (scenario !== 'incomplete-result') {
    results.push({ type: 'race-finished' })
  }

  if (scenario === 'duplicate-transmission') {
    return [...results, ...results.filter((event) => event.type === 'lane-result' || event.type === 'race-finished')]
  }

  return results
}
