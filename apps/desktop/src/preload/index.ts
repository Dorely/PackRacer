import { contextBridge, ipcRenderer } from 'electron'

import type {
  AddRaceEntriesInput,
  AddRaceEntryInput,
  AddRacerInput,
  CreateDivisionInput,
  CreateEventInput,
  CreateRaceInput,
  EventSessionSnapshot,
  EventSummary,
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
  ConfigureSimulatorInput,
  PhysicalTimerProfileId,
  TimerPortInfo,
  TimerPreferences,
  TimerProfile,
  TimerReplayResult,
  TimerSimulatorState,
  TimerState
} from '@packracer/timer-adapters'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

type PopoutRequest = {
  sectionId: string
  selectedRaceId?: string
}

const packRacerApi = {
  getVersion: (): Promise<string> => invoke('app:get-version'),
  openPopout: (input: PopoutRequest): Promise<void> => invoke('app:open-popout', input),
  openTimerSimulator: (): Promise<void> => invoke('app:open-timer-simulator'),
  onSessionUpdated: (callback: (snapshot: EventSessionSnapshot | null) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: EventSessionSnapshot | null) => callback(snapshot)
    ipcRenderer.on('session:updated', listener)
    return () => ipcRenderer.removeListener('session:updated', listener)
  },
  createEvent: (input: CreateEventInput): Promise<EventSessionSnapshot> => invoke('event:create', input),
  getCurrentEvent: (): Promise<EventSessionSnapshot | null> => invoke('event:get-current'),
  listEvents: (): Promise<EventSummary[]> => invoke('event:list'),
  selectEvent: (eventId: string): Promise<EventSessionSnapshot> => invoke('event:select', eventId),
  updateEvent: (input: UpdateEventInput): Promise<EventSessionSnapshot> => invoke('event:update', input),
  addDivision: (input: CreateDivisionInput): Promise<EventSessionSnapshot> => invoke('division:add', input),
  updateDivision: (divisionId: string, input: UpdateDivisionInput): Promise<EventSessionSnapshot> =>
    invoke('division:update', divisionId, input),
  deleteDivision: (divisionId: string): Promise<EventSessionSnapshot> => invoke('division:delete', divisionId),
  deleteEvent: (eventId: string): Promise<EventSessionSnapshot | null> => invoke('event:delete', eventId),
  createRace: (input: CreateRaceInput): Promise<EventSessionSnapshot> => invoke('race:create', input),
  updateRace: (raceId: string, input: UpdateRaceInput): Promise<EventSessionSnapshot> => invoke('race:update', raceId, input),
  updateRaceLaneAvailability: (raceId: string, input: UpdateRaceLaneAvailabilityInput): Promise<EventSessionSnapshot> =>
    invoke('race:update-lane-availability', raceId, input),
  deleteRace: (raceId: string): Promise<EventSessionSnapshot> => invoke('race:delete', raceId),
  addRacer: (input: AddRacerInput): Promise<EventSessionSnapshot> => invoke('racer:add', input),
  updateRacer: (racerId: string, input: UpdateRacerInput): Promise<EventSessionSnapshot> =>
    invoke('racer:update', racerId, input),
  deleteRacer: (racerId: string): Promise<EventSessionSnapshot> => invoke('racer:delete', racerId),
  scratchRacer: (racerId: string): Promise<EventSessionSnapshot> => invoke('racer:scratch', racerId),
  resolveRacerRemoval: (strategy: RemovalResolutionStrategy): Promise<EventSessionSnapshot> =>
    invoke('racer:resolve-removal', strategy),
  addRaceEntry: (raceId: string, input: AddRaceEntryInput): Promise<EventSessionSnapshot> =>
    invoke('race-entry:add', raceId, input),
  addRaceEntries: (raceId: string, input: AddRaceEntriesInput): Promise<EventSessionSnapshot> =>
    invoke('race-entry:add-many', raceId, input),
  updateRaceEntry: (raceId: string, entryId: string, input: UpdateRaceEntryInput): Promise<EventSessionSnapshot> =>
    invoke('race-entry:update', raceId, entryId, input),
  removeRaceEntry: (raceId: string, entryId: string): Promise<EventSessionSnapshot> =>
    invoke('race-entry:remove', raceId, entryId),
  scratchRaceEntry: (raceId: string, entryId: string): Promise<EventSessionSnapshot> =>
    invoke('race-entry:scratch', raceId, entryId),
  generateHeats: (raceId: string): Promise<EventSessionSnapshot> => invoke('race:generate-heats', raceId),
  generateTieBreaker: (sourceRaceId: string, dependentRaceId: string): Promise<EventSessionSnapshot> =>
    invoke('race:generate-tie-breaker', sourceRaceId, dependentRaceId),
  recordHeatResults: (raceId: string, input: RecordHeatResultsInput): Promise<EventSessionSnapshot> =>
    invoke('heat:record-results', raceId, input),
  clearHeatResults: (raceId: string, heatId: string): Promise<EventSessionSnapshot> =>
    invoke('heat:clear-results', raceId, heatId),
  setCurrentHeat: (raceId: string, heatId: string): Promise<EventSessionSnapshot> =>
    invoke('heat:set-current', raceId, heatId),
  advanceHeat: (raceId: string): Promise<EventSessionSnapshot> => invoke('heat:advance', raceId),
  getTimerState: (): Promise<TimerState> => invoke('timer:get-state'),
  getTimerProfiles: (): Promise<TimerProfile[]> => invoke('timer:get-profiles'),
  listTimerPorts: (): Promise<TimerPortInfo[]> => invoke('timer:list-ports'),
  getTimerPreferences: (): Promise<TimerPreferences> => invoke('timer:get-preferences'),
  saveTimerPreferences: (input: TimerPreferences): Promise<TimerPreferences> => invoke('timer:save-preferences', input),
  connectTimer: (input: ConnectTimerInput): Promise<TimerState> => invoke('timer:connect', input),
  disconnectTimer: (): Promise<TimerState> => invoke('timer:disconnect'),
  armTimer: (raceId: string, heatId: string, laneMapping: Record<number, number>): Promise<TimerState> =>
    invoke('timer:arm', raceId, heatId, laneMapping),
  disarmTimer: (): Promise<TimerState> => invoke('timer:disarm'),
  resetTimer: (): Promise<TimerState> => invoke('timer:reset'),
  forceTimerResults: (): Promise<TimerState> => invoke('timer:force-results'),
  releaseTimerGate: (): Promise<TimerState> => invoke('timer:release-gate'),
  discardTimerCapture: (): Promise<TimerState> => invoke('timer:discard-capture'),
  acceptTimerCapture: (captureId: string, raceId: string, input: RecordHeatResultsInput): Promise<EventSessionSnapshot> =>
    invoke('timer:accept-capture', captureId, raceId, input),
  replayTimerProtocol: (profileId: PhysicalTimerProfileId): Promise<TimerReplayResult> => invoke('timer:replay', profileId),
  onTimerUpdated: (callback: (state: TimerState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: TimerState) => callback(state)
    ipcRenderer.on('timer:updated', listener)
    return () => ipcRenderer.removeListener('timer:updated', listener)
  },
  onTimerPortsUpdated: (callback: (ports: TimerPortInfo[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ports: TimerPortInfo[]) => callback(ports)
    ipcRenderer.on('timer:ports-updated', listener)
    return () => ipcRenderer.removeListener('timer:ports-updated', listener)
  },
  getTimerSimulatorState: (): Promise<TimerSimulatorState> => invoke('timer-simulator:get-state'),
  configureTimerSimulator: (input: ConfigureSimulatorInput): Promise<TimerSimulatorState> => invoke('timer-simulator:configure', input),
  sendTimerSimulatorHeat: (): Promise<TimerSimulatorState> => invoke('timer-simulator:send-heat'),
  sendTimerSimulatorRaw: (data: string): Promise<TimerSimulatorState> => invoke('timer-simulator:send-raw', data),
  onTimerSimulatorUpdated: (callback: (state: TimerSimulatorState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: TimerSimulatorState) => callback(state)
    ipcRenderer.on('timer-simulator:updated', listener)
    return () => ipcRenderer.removeListener('timer-simulator:updated', listener)
  }
}

contextBridge.exposeInMainWorld('packRacer', packRacerApi)

export type PackRacerApi = typeof packRacerApi
