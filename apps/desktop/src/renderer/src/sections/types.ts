import type {
  AddRaceEntriesInput,
  AddRaceEntryInput,
  AddRacerInput,
  CreateDivisionInput,
  CreateEventInput,
  CreateRaceInput,
  EventSessionSnapshot,
  Race,
  RaceEvent,
  RecordHeatResultsInput,
  RemovalResolutionStrategy,
  UpdateEventInput,
  UpdateDivisionInput,
  UpdateRaceLaneAvailabilityInput,
  UpdateRaceEntryInput,
  UpdateRaceInput,
  UpdateRacerInput
} from '@packracer/race-engine'
import type {
  ConnectTimerInput,
  PhysicalTimerProfileId,
  TimerPortInfo,
  TimerPreferences,
  TimerProfile,
  TimerReplayResult,
  TimerState
} from '@packracer/timer-adapters'

export type ConfirmationRequest = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
}

export type AppActions = {
  createEvent: (input: CreateEventInput) => Promise<void>
  selectEvent: (eventId: string) => Promise<void>
  updateEvent: (input: UpdateEventInput) => Promise<void>
  addDivision: (input: CreateDivisionInput) => Promise<void>
  updateDivision: (divisionId: string, input: UpdateDivisionInput) => Promise<void>
  deleteDivision: (divisionId: string) => Promise<void>
  deleteEvent: (eventId: string) => Promise<void>
  createRace: (input: CreateRaceInput) => Promise<void>
  updateRace: (raceId: string, input: UpdateRaceInput) => Promise<void>
  updateRaceLaneAvailability: (raceId: string, input: UpdateRaceLaneAvailabilityInput) => Promise<void>
  deleteRace: (raceId: string) => Promise<void>
  addRacer: (input: AddRacerInput) => Promise<void>
  updateRacer: (racerId: string, input: UpdateRacerInput) => Promise<void>
  deleteRacer: (racerId: string) => Promise<void>
  scratchRacer: (racerId: string) => Promise<void>
  resolveRacerRemoval: (strategy: RemovalResolutionStrategy) => Promise<void>
  addRaceEntry: (raceId: string, input: AddRaceEntryInput) => Promise<void>
  addRaceEntries: (raceId: string, input: AddRaceEntriesInput) => Promise<void>
  updateRaceEntry: (raceId: string, entryId: string, input: UpdateRaceEntryInput) => Promise<void>
  removeRaceEntry: (raceId: string, entryId: string) => Promise<void>
  scratchRaceEntry: (raceId: string, entryId: string) => Promise<void>
  generateHeats: (raceId: string) => Promise<void>
  generateTieBreaker: (sourceRaceId: string, dependentRaceId: string) => Promise<void>
  recordHeatResults: (raceId: string, input: RecordHeatResultsInput) => Promise<void>
  clearHeatResults: (raceId: string, heatId: string) => Promise<void>
  setCurrentHeat: (raceId: string, heatId: string) => Promise<void>
  advanceHeat: (raceId: string) => Promise<void>
  saveTimerPreferences: (input: TimerPreferences) => Promise<void>
  connectTimer: (input: ConnectTimerInput) => Promise<void>
  disconnectTimer: () => Promise<void>
  scanTimerPorts: () => Promise<void>
  armTimer: (raceId: string, heatId: string, laneMapping: Record<number, number>) => Promise<void>
  disarmTimer: () => Promise<void>
  resetTimer: () => Promise<void>
  forceTimerResults: () => Promise<void>
  releaseTimerGate: () => Promise<void>
  openTimerSimulator: () => Promise<void>
  discardTimerCapture: () => Promise<void>
  acceptTimerCapture: (captureId: string, raceId: string, input: RecordHeatResultsInput) => Promise<void>
  replayTimerProtocol: (profileId: PhysicalTimerProfileId) => Promise<TimerReplayResult | null>
}

export type SectionProps = {
  session: EventSessionSnapshot | null
  event: RaceEvent | null
  currentRace: Race | null
  actions: AppActions
  selectedRaceId: string
  setSelectedRaceId: (raceId: string) => void
  openPopout?: () => void
  requestConfirmation: (request: ConfirmationRequest) => void
  timerState: TimerState
  timerProfiles: TimerProfile[]
  timerPorts: TimerPortInfo[]
  timerPreferences: TimerPreferences
  developerMode: boolean
}
