import { contextBridge, ipcRenderer } from 'electron'

import type {
  AddRaceEntryInput,
  AddRacerInput,
  CreateEventInput,
  CreateRaceInput,
  EventSessionSnapshot,
  EventSummary,
  RecordHeatResultsInput,
  RegisterRacerInput,
  RemovalResolutionStrategy,
  UpdateEventInput,
  UpdateRaceEntryInput,
  UpdateRaceInput,
  UpdateRacerInput
} from '@packracer/race-engine'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

type PopoutRequest = {
  sectionId: string
  selectedRaceId?: string
}

const packRacerApi = {
  getVersion: (): Promise<string> => invoke('app:get-version'),
  openPopout: (input: PopoutRequest): Promise<void> => invoke('app:open-popout', input),
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
  deleteEvent: (eventId: string): Promise<EventSessionSnapshot | null> => invoke('event:delete', eventId),
  createRace: (input: CreateRaceInput): Promise<EventSessionSnapshot> => invoke('race:create', input),
  updateRace: (raceId: string, input: UpdateRaceInput): Promise<EventSessionSnapshot> => invoke('race:update', raceId, input),
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
  registerRacerForRace: (raceId: string, input: RegisterRacerInput): Promise<EventSessionSnapshot> =>
    invoke('race-entry:register-racer', raceId, input),
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
  advanceHeat: (raceId: string): Promise<EventSessionSnapshot> => invoke('heat:advance', raceId)
}

contextBridge.exposeInMainWorld('packRacer', packRacerApi)

export type PackRacerApi = typeof packRacerApi
