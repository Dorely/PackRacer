import type { TimerAdapter, TimerAdapterEvent, TimerLineEnding, TimerProfile } from './types'

export type ProfileDefinition = {
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

export class TextTimerAdapter implements TimerAdapter {
  readonly profile: TimerProfile
  private buffer = ''

  constructor(private readonly definition: ProfileDefinition) {
    this.profile = definition.profile
  }

  beginHeat(): void { this.buffer = '' }

  ingest(chunk: string): TimerAdapterEvent[] {
    this.buffer += chunk
    const separator = this.definition.lineEnding === 'crlf' ? /\r\n/
      : this.definition.lineEnding === 'cr' ? /\r/
        : this.definition.lineEnding === 'lf' ? /\n/ : /\r\n|\r|\n/
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
