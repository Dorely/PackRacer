import type {
  ArmedHeat,
  BuiltInTimerProfileId,
  SimulatorScenario,
  TimerAdapterEvent
} from './types'

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

const placeCharacters = ['', '!', '"', '#', '$', '%', '&']

function seconds(timeMs: number | undefined): string {
  return ((timeMs ?? 0) / 1000).toFixed(4)
}

function fragmentFrame(frame: string): string[] {
  if (frame.length < 6) return [frame]
  const splitAt = Math.max(1, Math.floor(frame.length / 2))
  return [frame.slice(0, splitAt), frame.slice(splitAt)]
}

export function simulatorProbeResponse(profileId: BuiltInTimerProfileId, command: string): string | undefined {
  const normalized = command.replace(/[\r\n]/g, '')
  if (profileId === 'micro-wizard-fasttrack' && normalized === 'RV') {
    return 'Micro Wizard Fast Track Model: Q - Simulator\r\n'
  }
  if (profileId === 'besttrack-champ' && normalized.toLowerCase() === 'v') {
    return 'eTekGadget SmartLine Timer - Simulator\r'
  }
  if (profileId === 'besttrack-champ-srm' && normalized.toLowerCase() === 'v') {
    return 'SRM Enterprises Champ Timer - Simulator\r'
  }
  if (profileId === 'the-judge' && normalized === '*') {
    return 'Checking Valid Lanes.......\rNumber of Lanes: 3\rReady to Start Race\r'
  }
  return undefined
}

export function encodeSimulatedTimerTransmission(
  profileId: BuiltInTimerProfileId,
  events: TimerAdapterEvent[]
): string[] {
  const frames: string[] = []
  const laneEvents = events.filter((event): event is Extract<TimerAdapterEvent, { type: 'lane-result' }> => event.type === 'lane-result')

  if (events.some((event) => event.type === 'race-started')) {
    if (profileId === 'micro-wizard-fasttrack') frames.push('RG0\r\n')
    if (profileId === 'besttrack-champ' || profileId === 'besttrack-champ-srm') frames.push('S\r')
    if (profileId === 'the-judge') frames.push('Go!\r')
  }

  if (profileId === 'newbold') {
    const records = laneEvents.map((event) => event.status === 'dnf'
      ? `${event.physicalLane} 9.9999`
      : `${event.physicalLane} ${seconds(event.timeMs)}`)
    if (records.length > 0) frames.push(`${records.join(' ')}\r\n`)
  } else {
    for (const event of laneEvents) {
      if (event.status === 'dnf' && profileId !== 'the-judge') continue
      if (profileId === 'micro-wizard-fasttrack' || profileId === 'besttrack-champ') {
        const lane = String.fromCharCode(64 + event.physicalLane)
        const place = event.finishPosition ? (placeCharacters[event.finishPosition] ?? '') : ''
        frames.push(`${lane}=${seconds(event.timeMs)}${place}\r${profileId === 'micro-wizard-fasttrack' ? '\n' : ''}`)
      } else if (profileId === 'besttrack-champ-srm') {
        const place = event.finishPosition ? (placeCharacters[event.finishPosition] ?? '') : ''
        frames.push(`${event.physicalLane}=${seconds(event.timeMs)}${place}\r`)
      } else if (profileId === 'the-judge') {
        frames.push(`Lane ${event.physicalLane} ${seconds(event.timeMs)}${event.status === 'dnf' ? ' DNF' : ''}\r`)
      }
    }
  }

  if (profileId === 'the-judge' && events.some((event) => event.type === 'race-finished')) {
    frames.push('Race Over\r')
  }

  return frames.flatMap(fragmentFrame)
}
