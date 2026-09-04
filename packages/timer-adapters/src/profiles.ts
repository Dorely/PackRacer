import {
  type AdvancedTimerProfile,
  type PhysicalTimerProfileId,
  type TimerAdapter,
  type TimerAdapterEvent,
  type TimerCapabilities,
  type TimerProfile,
  type TimerProfileId,
  defaultAdvancedTimerProfile,
  noTimerCapabilities
} from './types'
import { advancedDefinition } from './advanced-profile'
import { parseEqualsRecords, parseNewBoldLine, secondsToMilliseconds } from './protocol-parsers'
import { TextTimerAdapter, type ProfileDefinition } from './text-timer-adapter'

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
