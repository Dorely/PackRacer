import {
  type AdvancedTimerProfile,
  type PhysicalTimerProfileId,
  type TimerAdapter,
  type TimerAdapterEvent,
  type TimerCapabilities,
  type TimerLineEnding,
  type TimerProfile,
  type TimerProfileId,
  defaultAdvancedTimerProfile,
  noTimerCapabilities
} from './types'

type ProfileDefinition = {
  profile: TimerProfile
  lineEnding: TimerLineEnding
  probe: string[]
  probePattern?: RegExp
  setup: string[]
  prepare?: (activePhysicalLanes: number[]) => string[]
  reset: string[]
  forceResults: string[]
  releaseGate: string[]
  parseLine: (line: string) => TimerAdapterEvent[]
}

const placeCharacters = '!"#$%&'

function secondsToMilliseconds(value: string): number | undefined {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined
}

function parseEqualsRecords(line: string, numericLanes: boolean): TimerAdapterEvent[] {
  const events: TimerAdapterEvent[] = []
  const expression = numericLanes
    ? /(?:^|\s)(\d+)=(\d+(?:\.\d+)?)([!"#$%&]?)/g
    : /(?:^|\s)([A-Z])=(\d+(?:\.\d+)?)([!"#$%&]?)/gi

  for (const match of line.matchAll(expression)) {
    const physicalLane = numericLanes ? Number(match[1]) : match[1].toUpperCase().charCodeAt(0) - 64
    const timeMs = secondsToMilliseconds(match[2])

    if (!timeMs && timeMs !== 0) {
      events.push({ type: 'warning', message: `Ignored malformed time in “${match[0].trim()}”.` })
      continue
    }

    const placeIndex = placeCharacters.indexOf(match[3])
    events.push({
      type: 'lane-result',
      physicalLane,
      timeMs,
      finishPosition: placeIndex >= 0 ? placeIndex + 1 : undefined
    })
  }

  if (events.length === 0 && /(?:^|\s)(?:[A-Z]|\d+)=/i.test(line)) {
    events.push({ type: 'warning', message: `Ignored malformed lane/time record “${line}”.` })
  }

  return events
}

function parseNewBoldLine(line: string): TimerAdapterEvent[] {
  const events: TimerAdapterEvent[] = []
  let place = 1

  for (const match of line.matchAll(/(?:^|\s)(\d+)\s+(\d+(?:\.\d+)?)(?=\s|$)/g)) {
    const physicalLane = Number(match[1])
    const timeMs = secondsToMilliseconds(match[2])

    if (timeMs === undefined) {
      events.push({ type: 'warning', message: `Ignored malformed NewBold result “${match[0].trim()}”.` })
      continue
    }

    events.push({
      type: 'lane-result',
      physicalLane,
      timeMs: timeMs >= 9_999 ? undefined : timeMs,
      status: timeMs >= 9_999 ? 'dnf' : 'ok',
      finishPosition: place
    })
    place += 1
  }

  if (events.length === 0 && line.trim()) {
    events.push({ type: 'warning', message: `Ignored malformed NewBold result “${line}”.` })
  }

  return events
}

function splitCommands(command: string): string[] {
  return command
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function advancedDefinition(input: AdvancedTimerProfile): ProfileDefinition {
  const advanced = { ...defaultAdvancedTimerProfile, ...input, serial: { ...defaultAdvancedTimerProfile.serial, ...input.serial } }
  const capabilities: TimerCapabilities = {
    autoDetect: Boolean(advanced.probeCommand && advanced.probeResponseText),
    reset: Boolean(advanced.resetCommand),
    laneMask: false,
    forceResults: Boolean(advanced.forceResultsCommand),
    gateRelease: Boolean(advanced.releaseGateCommand)
  }

  return {
    profile: {
      id: 'advanced',
      name: advanced.name.trim() || 'Custom serial timer',
      description: 'Operator-configured ASCII serial timer.',
      category: 'advanced',
      serial: advanced.serial,
      capabilities,
      hardwareValidation: 'protocol-implemented'
    },
    lineEnding: advanced.lineEnding,
    probe: splitCommands(advanced.probeCommand),
    probePattern: advanced.probeResponseText ? new RegExp(advanced.probeResponseText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : undefined,
    setup: splitCommands(advanced.setupCommand),
    reset: splitCommands(advanced.resetCommand),
    forceResults: splitCommands(advanced.forceResultsCommand),
    releaseGate: splitCommands(advanced.releaseGateCommand),
    parseLine: (line) => {
      const events: TimerAdapterEvent[] = []

      if (advanced.completionText && line.includes(advanced.completionText)) {
        events.push({ type: 'race-finished' })
      }

      if (advanced.layout === 'letter-equals-time') {
        return [...parseEqualsRecords(line, advanced.laneStyle === 'number'), ...events]
      }

      if (advanced.layout === 'ordered-lane-time-pairs') {
        const pairEvents = parseNewBoldLine(line)
        return [
          ...pairEvents.map((event) => {
            if (event.type !== 'lane-result' || advanced.timeUnit === 'seconds' || event.timeMs === undefined) {
              return event
            }

            return { ...event, timeMs: Math.round(event.timeMs / 1000) }
          }),
          ...events
        ]
      }

      const laneToken = advanced.laneStyle === 'letter' ? '([A-Z])' : '(\\d+)'
      const match = line.match(new RegExp(`(?:Lane\\s*)?${laneToken}[\\s,:=]+(\\d+(?:\\.\\d+)?)`, 'i'))

      if (!match) {
        return events
      }

      const physicalLane = advanced.laneStyle === 'letter' ? match[1].toUpperCase().charCodeAt(0) - 64 : Number(match[1])
      const rawTime = Number(match[2])
      const timeMs = advanced.timeUnit === 'seconds' ? Math.round(rawTime * 1000) : Math.round(rawTime)
      return Number.isFinite(timeMs)
        ? [{ type: 'lane-result', physicalLane, timeMs }, ...events]
        : [{ type: 'warning', message: `Ignored malformed custom timer line “${line}”.` }, ...events]
    }
  }
}

const hardwareProfiles: ProfileDefinition[] = [
  {
    profile: {
      id: 'micro-wizard-fasttrack',
      name: 'Micro Wizard FastTrack K/Q',
      description: 'FastTrack K- and Q-series timers; documented protocol, hardware validation pending.',
      category: 'hardware',
      serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
      capabilities: { autoDetect: true, reset: true, laneMask: true, forceResults: true, gateRelease: true },
      hardwareValidation: 'protocol-implemented'
    },
    lineEnding: 'any',
    probe: ['RV'],
    probePattern: /Micro Wizard|Model:\s*Q/i,
    setup: ['RE', 'N1', 'N2'],
    prepare: (activeLanes) => {
      const active = new Set(activeLanes)
      return ['MG', ...Array.from({ length: 6 }, (_value, index) => index + 1).filter((lane) => !active.has(lane)).map((lane) => `M${String.fromCharCode(64 + lane)}`)]
    },
    reset: ['LR'],
    forceResults: ['RA'],
    releaseGate: ['LG'],
    parseLine: (line) => [
      ...(line.match(/^(?:RG)?0$/) ? [{ type: 'race-started' } as TimerAdapterEvent] : []),
      ...parseEqualsRecords(line, false)
    ]
  },
  {
    profile: {
      id: 'besttrack-champ',
      name: 'BestTrack / SmartLine Champ',
      description: 'Legacy eTekGadget SmartLine/Champ protocol; hardware validation pending.',
      category: 'hardware',
      serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
      capabilities: { autoDetect: true, reset: true, laneMask: true, forceResults: true, gateRelease: false },
      hardwareValidation: 'protocol-implemented'
    },
    lineEnding: 'cr',
    probe: ['v'],
    probePattern: /eTekGadget SmartLine Timer/i,
    setup: ['r', 'ol0', 'op3'],
    prepare: (activeLanes) => {
      const active = new Set(activeLanes)
      return ['om0', ...Array.from({ length: 6 }, (_value, index) => index + 1).filter((lane) => !active.has(lane)).map((lane) => `om${lane}`), 'rg']
    },
    reset: ['r'],
    forceResults: ['ra'],
    releaseGate: [],
    parseLine: (line) => [...(line === 'S' ? [{ type: 'race-started' } as TimerAdapterEvent] : []), ...parseEqualsRecords(line, false)]
  },
  {
    profile: {
      id: 'besttrack-champ-srm',
      name: 'BestTrack Champ — SRM firmware',
      description: 'Current SRM Champ firmware with numeric lane output; hardware validation pending.',
      category: 'hardware',
      serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
      capabilities: { autoDetect: true, reset: false, laneMask: false, forceResults: false, gateRelease: false },
      hardwareValidation: 'protocol-implemented'
    },
    lineEnding: 'cr',
    probe: ['v'],
    probePattern: /SRM.*Enterprises/i,
    setup: [],
    reset: [],
    forceResults: [],
    releaseGate: [],
    parseLine: (line) => [...(line === 'S' ? [{ type: 'race-started' } as TimerAdapterEvent] : []), ...parseEqualsRecords(line, true)]
  },
  {
    profile: {
      id: 'newbold',
      name: 'NewBold DT / TURBO / DerbyStick',
      description: 'NewBold ASCII output; select manually because the timer cannot be reliably probed.',
      category: 'hardware',
      serial: { baudRate: 1200, dataBits: 7, stopBits: 2, parity: 'none' },
      capabilities: { autoDetect: false, reset: true, laneMask: false, forceResults: false, gateRelease: false },
      hardwareValidation: 'protocol-implemented'
    },
    lineEnding: 'any',
    probe: [],
    setup: [' '],
    reset: [' '],
    forceResults: [],
    releaseGate: [],
    parseLine: parseNewBoldLine
  },
  {
    profile: {
      id: 'the-judge',
      name: 'The Judge — New Directions',
      description: 'The Judge lane-line protocol; hardware validation pending.',
      category: 'hardware',
      serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
      capabilities: { autoDetect: true, reset: false, laneMask: false, forceResults: true, gateRelease: false },
      hardwareValidation: 'protocol-implemented'
    },
    lineEnding: 'cr',
    probe: ['*'],
    probePattern: /Checking Valid Lanes|Number of Lanes/i,
    setup: [],
    reset: [],
    forceResults: ['*'],
    releaseGate: [],
    parseLine: (line) => {
      if (/^Go!?$/i.test(line)) {
        return [{ type: 'race-started' }]
      }

      if (/Race Over/i.test(line)) {
        return [{ type: 'race-finished' }]
      }

      const match = line.match(/^Lane\s+(\d+)\s+0*(\d+(?:\.\d+)?)(?:\s+(.*))?$/i)
      if (!match) {
        return /^Lane\s+/i.test(line)
          ? [{ type: 'warning', message: `Ignored malformed Judge result “${line}”.` }]
          : []
      }

      return [{
        type: 'lane-result',
        physicalLane: Number(match[1]),
        timeMs: secondsToMilliseconds(match[2]),
        status: /DNF/i.test(match[3] ?? '') ? 'dnf' : 'ok'
      }]
    }
  }
]

class TextTimerAdapter implements TimerAdapter {
  readonly profile: TimerProfile
  private buffer = ''

  constructor(private readonly definition: ProfileDefinition) {
    this.profile = definition.profile
  }

  beginHeat(): void {
    this.buffer = ''
  }

  ingest(chunk: string): TimerAdapterEvent[] {
    this.buffer += chunk
    const separator = this.definition.lineEnding === 'crlf'
      ? /\r\n/
      : this.definition.lineEnding === 'cr'
        ? /\r/
        : this.definition.lineEnding === 'lf'
          ? /\n/
          : /\r\n|\r|\n/
    const parts = this.buffer.split(separator)
    this.buffer = parts.pop() ?? ''
    const events = parts.flatMap((line) => this.definition.parseLine(line.trim()))

    if (this.buffer.length > 1024) {
      events.push({ type: 'warning', message: 'Discarded an unterminated timer frame larger than 1024 characters.' })
      this.buffer = ''
    }

    return events
  }

  probeCommands(): string[] { return [...this.definition.probe] }
  setupCommands(): string[] { return [...this.definition.setup] }
  prepareHeatCommands(activePhysicalLanes: number[]): string[] { return this.definition.prepare?.(activePhysicalLanes) ?? [] }
  resetCommands(): string[] { return [...this.definition.reset] }
  forceResultsCommands(): string[] { return [...this.definition.forceResults] }
  releaseGateCommands(): string[] { return [...this.definition.releaseGate] }
  matchesProbeResponse(response: string): boolean { return Boolean(this.definition.probePattern?.test(response)) }
}

const automaticProfile: TimerProfile = {
  id: 'auto-detect',
  name: 'Auto-detect selected port',
  description: 'Probe the selected port for Micro Wizard, Champ, or The Judge.',
  category: 'automatic',
  capabilities: noTimerCapabilities,
  hardwareValidation: 'not-applicable'
}

const advancedSummary: TimerProfile = {
  id: 'advanced',
  name: 'Advanced serial timer',
  description: 'Configure a declarative ASCII serial protocol.',
  category: 'advanced',
  capabilities: noTimerCapabilities,
  hardwareValidation: 'protocol-implemented'
}

export function listTimerProfiles(): TimerProfile[] {
  return [automaticProfile, ...hardwareProfiles.map((definition) => definition.profile), advancedSummary]
}

export function detectableTimerProfileIds(): PhysicalTimerProfileId[] {
  return hardwareProfiles
    .filter((definition) => definition.profile.capabilities.autoDetect)
    .map((definition) => definition.profile.id as PhysicalTimerProfileId)
}

export function createTimerAdapter(profileId: TimerProfileId, advanced?: AdvancedTimerProfile): TimerAdapter {
  if (profileId === 'auto-detect') {
    throw new Error(`${profileId} does not use a text protocol adapter.`)
  }

  const definition = profileId === 'advanced'
    ? advancedDefinition(advanced ?? defaultAdvancedTimerProfile)
    : hardwareProfiles.find((candidate) => candidate.profile.id === profileId)

  if (!definition) {
    throw new Error(`Unknown timer profile: ${profileId}`)
  }

  return new TextTimerAdapter(definition)
}

const replayChunks: Record<Exclude<PhysicalTimerProfileId, 'advanced'>, string[]> = {
  'micro-wizard-fasttrack': ['noise\r\nA=3.', '001! B=3.026"\r', '\nA=3.001!\r\nC=bad\r\nD=3.'],
  'besttrack-champ': ['noise\rA=3.011! B=', '3.022" C=3.105#\r', 'A=3.011!\rD=bad\rE=3.'],
  'besttrack-champ-srm': ['noise\rS\r1=3.021!', ' 2=3.044" 3=3.090#\r', '1=3.021!\r4=bad\r5=3.'],
  newbold: ['noise\r\n1 2.998 2 ', '3.041 3 3.125\r\n', '1 2.998\r\nmalformed\r\n4 3.'],
  'the-judge': ['noise\rGo!\rLane 1 3.', '0101\rLane 2 3.0442\rLane 3 9.9999 DNF\rRace Over\r', 'Lane 1 3.0101\rLane X bad\rLane 4 3.']
}

export function replayTimerProfile(profileId: PhysicalTimerProfileId, advanced?: AdvancedTimerProfile): { chunks: string[]; events: TimerAdapterEvent[] } {
  const adapter = createTimerAdapter(profileId, advanced)
  adapter.beginHeat()
  const chunks = profileId === 'advanced'
    ? ['Lane 1 3.', '012\r\nLane 2 3.104\r\n']
    : replayChunks[profileId]
  return { chunks, events: chunks.flatMap((chunk) => adapter.ingest(chunk)) }
}
