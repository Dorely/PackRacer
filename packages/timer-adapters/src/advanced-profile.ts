import { parseEqualsRecords, parseNewBoldLine } from './protocol-parsers'
import type { ProfileDefinition } from './text-timer-adapter'
import { defaultAdvancedTimerProfile, type AdvancedTimerProfile, type TimerAdapterEvent, type TimerCapabilities } from './types'

function splitCommands(command: string): string[] {
  return command.split(/\r?\n/).map((part) => part.trim()).filter(Boolean)
}

export function advancedDefinition(input: AdvancedTimerProfile): ProfileDefinition {
  const advanced = { ...defaultAdvancedTimerProfile, ...input, serial: { ...defaultAdvancedTimerProfile.serial, ...input.serial } }
  const capabilities: TimerCapabilities = {
    autoDetect: Boolean(advanced.probeCommand && advanced.probeResponseText), reset: Boolean(advanced.resetCommand), laneMask: false,
    forceResults: Boolean(advanced.forceResultsCommand), gateRelease: Boolean(advanced.releaseGateCommand)
  }
  const convertParsedTime = (event: TimerAdapterEvent): TimerAdapterEvent =>
    event.type === 'lane-result' && advanced.timeUnit === 'milliseconds' && event.timeMs !== undefined
      ? { ...event, timeMs: Math.round(event.timeMs / 1000) } : event

  return {
    profile: {
      id: 'advanced', name: advanced.name.trim() || 'Custom serial timer', description: 'Operator-configured ASCII serial timer.',
      category: 'advanced', serial: advanced.serial, capabilities, hardwareValidation: 'protocol-implemented'
    },
    lineEnding: advanced.lineEnding,
    probe: splitCommands(advanced.probeCommand),
    probePattern: advanced.probeResponseText ? new RegExp(advanced.probeResponseText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : undefined,
    setup: splitCommands(advanced.setupCommand), reset: splitCommands(advanced.resetCommand),
    forceResults: splitCommands(advanced.forceResultsCommand), releaseGate: splitCommands(advanced.releaseGateCommand),
    parseLine: (line) => {
      const completion = advanced.completionText && line.includes(advanced.completionText) ? [{ type: 'race-finished' } as TimerAdapterEvent] : []
      if (advanced.layout === 'letter-equals-time') return [...parseEqualsRecords(line, advanced.laneStyle === 'number').map(convertParsedTime), ...completion]
      if (advanced.layout === 'ordered-lane-time-pairs') return [...parseNewBoldLine(line).map(convertParsedTime), ...completion]
      const laneToken = advanced.laneStyle === 'letter' ? '([A-Z])' : '(\\d+)'
      const match = line.match(new RegExp(`(?:Lane\\s*)?${laneToken}[\\s,:=]+(\\d+(?:\\.\\d+)?)`, 'i'))
      if (!match) return completion
      const physicalLane = advanced.laneStyle === 'letter' ? match[1].toUpperCase().charCodeAt(0) - 64 : Number(match[1])
      const rawTime = Number(match[2])
      const timeMs = advanced.timeUnit === 'seconds' ? Math.round(rawTime * 1000) : Math.round(rawTime)
      return Number.isFinite(timeMs) ? [{ type: 'lane-result', physicalLane, timeMs }, ...completion]
        : [{ type: 'warning', message: `Ignored malformed custom timer line “${line}”.` }, ...completion]
    }
  }
}
