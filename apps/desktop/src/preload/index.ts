import { contextBridge, ipcRenderer } from 'electron'

import type {
  AddRaceEntryInput,
  AddRacerInput,
  AddStageInput,
  CreateEventInput,
  CreateFinalsStageInput,
  CreateRaceInput,
  EventSessionSnapshot,
  EventSummary,
  RecordHeatResultsInput,
  RegisterRacerInput,
  RemovalResolutionStrategy,
  UpdateEventInput,
  UpdateRaceEntryInput,
  UpdateRaceInput,
  UpdateRacerInput,
  UpdateStageInput
} from '@packracer/race-engine'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

const packRacerApi = {
  getVersion: (): Promise<string> => invoke('app:get-version'),
  createEvent: (input: CreateEventInput): Promise<EventSessionSnapshot> => invoke('event:create', input),
  getCurrentEvent: (): Promise<EventSessionSnapshot | null> => invoke('event:get-current'),
  listEvents: (): Promise<EventSummary[]> => invoke('event:list'),
  selectEvent: (eventId: string): Promise<EventSessionSnapshot> => invoke('event:select', eventId),
  updateEvent: (input: UpdateEventInput): Promise<EventSessionSnapshot> => invoke('event:update', input),
  deleteEvent: (eventId: string): Promise<EventSessionSnapshot | null> => invoke('event:delete', eventId),
  createRace: (input: CreateRaceInput): Promise<EventSessionSnapshot> => invoke('race:create', input),
  updateRace: (raceId: string, input: UpdateRaceInput): Promise<EventSessionSnapshot> => invoke('race:update', raceId, input),
  deleteRace: (raceId: string): Promise<EventSessionSnapshot> => invoke('race:delete', raceId),
  populateRaceEntriesFromSource: (raceId: string): Promise<EventSessionSnapshot> => invoke('race:populate-from-source', raceId),
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
  addStage: (raceId: string, input: AddStageInput): Promise<EventSessionSnapshot> => invoke('stage:add', raceId, input),
  updateStage: (raceId: string, stageId: string, input: UpdateStageInput): Promise<EventSessionSnapshot> =>
    invoke('stage:update', raceId, stageId, input),
  deleteStage: (raceId: string, stageId: string): Promise<EventSessionSnapshot> => invoke('stage:delete', raceId, stageId),
  generateHeats: (raceId: string, stageId: string): Promise<EventSessionSnapshot> =>
    invoke('stage:generate-heats', raceId, stageId),
  createFinalsStage: (raceId: string, input: CreateFinalsStageInput): Promise<EventSessionSnapshot> =>
    invoke('stage:create-finals', raceId, input),
  recordHeatResults: (raceId: string, input: RecordHeatResultsInput): Promise<EventSessionSnapshot> =>
    invoke('heat:record-results', raceId, input),
  clearHeatResults: (raceId: string, heatId: string): Promise<EventSessionSnapshot> =>
    invoke('heat:clear-results', raceId, heatId),
  deleteHeat: (raceId: string, heatId: string): Promise<EventSessionSnapshot> => invoke('heat:delete', raceId, heatId),
  setCurrentHeat: (raceId: string, heatId: string): Promise<EventSessionSnapshot> =>
    invoke('heat:set-current', raceId, heatId),
  advanceHeat: (raceId: string): Promise<EventSessionSnapshot> => invoke('heat:advance', raceId)
}

contextBridge.exposeInMainWorld('packRacer', packRacerApi)

export type PackRacerApi = typeof packRacerApi
