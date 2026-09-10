export type TimerProfileId =
  | 'auto-detect'
  | 'micro-wizard-fasttrack'
  | 'besttrack-champ'
  | 'besttrack-champ-srm'
  | 'newbold'
  | 'the-judge'
  | 'dfgtec-pdt'
  | 'advanced'

export type PhysicalTimerProfileId = Exclude<TimerProfileId, 'auto-detect'>
export type BuiltInTimerProfileId = Exclude<PhysicalTimerProfileId, 'advanced'>

export type TimerConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'armed'
  | 'running'
  | 'result'
  | 'error'

export type TimerParity = 'none' | 'even' | 'odd' | 'mark' | 'space'
export type TimerLineEnding = 'crlf' | 'cr' | 'lf' | 'any'
export type AdvancedTimerLayout = 'letter-equals-time' | 'lane-time-line' | 'ordered-lane-time-pairs'

export type TimerSerialSettings = {
  baudRate: number
  dataBits: 5 | 6 | 7 | 8
  stopBits: 1 | 1.5 | 2
  parity: TimerParity
  rtscts?: boolean
}

export type TimerCapabilities = {
  autoDetect: boolean
  reset: boolean
  laneMask: boolean
  forceResults: boolean
  gateRelease: boolean
}

export type TimerProfile = {
  id: TimerProfileId
  name: string
  description: string
  category: 'automatic' | 'hardware' | 'advanced'
  serial?: TimerSerialSettings
  capabilities: TimerCapabilities
  hardwareValidation: 'not-applicable' | 'protocol-implemented'
}

export type AdvancedTimerProfile = {
  name: string
  serial: TimerSerialSettings
  lineEnding: TimerLineEnding
  layout: AdvancedTimerLayout
  laneStyle: 'number' | 'letter'
  timeUnit: 'seconds' | 'milliseconds'
  completionText: string
  probeCommand: string
  probeResponseText: string
  setupCommand: string
  resetCommand: string
  forceResultsCommand: string
  releaseGateCommand: string
}

export type TimerPreferences = {
  profileId: PhysicalTimerProfileId
  portPath: string
  portIdentity?: string
  laneMapping: Record<number, number>
  advancedProfile: AdvancedTimerProfile
}

export type TimerPortInfo = {
  path: string
  manufacturer?: string
  serialNumber?: string
  vendorId?: string
  productId?: string
  identity: string
  simulated?: boolean
}

export type ArmedHeatLane = {
  lane: number
  racerId: string
}

export type ArmedHeat = {
  eventId: string
  raceId: string
  heatId: string
  heatNumber: number
  lanes: ArmedHeatLane[]
  laneMapping: Record<number, number>
  disabledLanes: number[]
  armedAt: string
}

export type NormalizedLaneResult = {
  physicalLane: number
  lane: number
  status: 'ok' | 'dnf'
  timeMs?: number
  finishPosition?: number
}

export type TimerCapture = {
  id: string
  profileId: TimerProfileId
  profileName: string
  raceId: string
  heatId: string
  heatNumber: number
  capturedAt: string
  complete: boolean
  simulated: boolean
  simulatorScenario?: SimulatorScenario
  results: NormalizedLaneResult[]
  warnings: string[]
  rawFrames: string[]
}

export type TimerDiagnosticEntry = {
  id: string
  createdAt: string
  direction: 'system' | 'received' | 'sent'
  message: string
}

export type SimulatorScenario =
  | 'normal-finish'
  | 'close-finish'
  | 'exact-tie'
  | 'explicit-dnf'
  | 'incomplete-result'
  | 'duplicate-transmission'
  | 'disconnect-during-heat'

export type TimerState = {
  status: TimerConnectionStatus
  selectedProfileId: TimerProfileId
  connectedProfileId?: PhysicalTimerProfileId
  profileName?: string
  portPath?: string
  capabilities: TimerCapabilities
  armedHeat?: ArmedHeat
  capture?: TimerCapture
  diagnostics: TimerDiagnosticEntry[]
  error?: string
  simulationMode: boolean
  gateReleased: boolean
  connectionVerification?: 'verified' | 'unverified'
}

export type TimerConnectionState = TimerState

export type ConnectTimerInput = {
  profileId: TimerProfileId
  portPath?: string
  advancedProfile?: AdvancedTimerProfile
  confirmUnverified?: boolean
}

export type ArmTimerInput = {
  raceId: string
  heatId: string
  laneMapping: Record<number, number>
}

export type ConfigureSimulatorInput = {
  profileId?: BuiltInTimerProfileId
  scenario?: SimulatorScenario
  variation?: number
}

export type TimerSimulatorState = {
  active: boolean
  profileId: BuiltInTimerProfileId
  scenario: SimulatorScenario
  variation: number
  connected: boolean
  connectedProfileId?: PhysicalTimerProfileId
  armedHeatNumber?: number
  diagnostics: TimerDiagnosticEntry[]
}

export const timerSimulatorPortPath = 'PACKRACER-SIM'

export type TimerAdapterEvent =
  | { type: 'race-started' }
  | { type: 'lane-result'; physicalLane: number; timeMs?: number; finishPosition?: number; status?: 'ok' | 'dnf' }
  | { type: 'race-finished' }
  | { type: 'warning'; message: string }

export type TimerReplayResult = {
  profileId: PhysicalTimerProfileId
  chunks: string[]
  events: TimerAdapterEvent[]
}

export type TimerAdapter = {
  readonly profile: TimerProfile
  beginHeat(): void
  ingest(chunk: string): TimerAdapterEvent[]
  probeCommands(): string[]
  setupCommands(): string[]
  prepareHeatCommands(activePhysicalLanes: number[]): string[]
  resetCommands(): string[]
  forceResultsCommands(): string[]
  releaseGateCommands(): string[]
  matchesProbeResponse(response: string): boolean
}

export const noTimerCapabilities: TimerCapabilities = {
  autoDetect: false,
  reset: false,
  laneMask: false,
  forceResults: false,
  gateRelease: false
}

export const defaultAdvancedTimerProfile: AdvancedTimerProfile = {
  name: 'Custom serial timer',
  serial: {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    rtscts: false
  },
  lineEnding: 'any',
  layout: 'lane-time-line',
  laneStyle: 'number',
  timeUnit: 'seconds',
  completionText: '',
  probeCommand: '',
  probeResponseText: '',
  setupCommand: '',
  resetCommand: '',
  forceResultsCommand: '',
  releaseGateCommand: ''
}

export const defaultTimerPreferences: TimerPreferences = {
  profileId: 'micro-wizard-fasttrack',
  portPath: '',
  laneMapping: {},
  advancedProfile: defaultAdvancedTimerProfile
}
