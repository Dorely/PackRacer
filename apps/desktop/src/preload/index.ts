import { contextBridge, ipcRenderer } from 'electron'

import type {
  AddRacerInput,
  AddStageInput,
  CreateEventInput,
  CreateFinalsStageInput,
  CreateRaceInput,
  EventSessionSnapshot,
  EventSummary,
  RecordHeatResultsInput,
  RemovalResolutionStrategy,
  UpdateEventInput,
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
  createRace: (input: CreateRaceInput): Promise<EventSessionSnapshot> => invoke('race:create', input),
  updateRace: (raceId: string, input: UpdateRaceInput): Promise<EventSessionSnapshot> => invoke('race:update', raceId, input),
  addRacer: (input: AddRacerInput): Promise<EventSessionSnapshot> => invoke('racer:add', input),
  updateRacer: (racerId: string, input: UpdateRacerInput): Promise<EventSessionSnapshot> =>
    invoke('racer:update', racerId, input),
  scratchRacer: (racerId: string): Promise<EventSessionSnapshot> => invoke('racer:scratch', racerId),
  resolveRacerRemoval: (strategy: RemovalResolutionStrategy): Promise<EventSessionSnapshot> =>
    invoke('racer:resolve-removal', strategy),
  addStage: (raceId: string, input: AddStageInput): Promise<EventSessionSnapshot> => invoke('stage:add', raceId, input),
  updateStage: (raceId: string, stageId: string, input: UpdateStageInput): Promise<EventSessionSnapshot> =>
    invoke('stage:update', raceId, stageId, input),
  generateHeats: (raceId: string, stageId: string): Promise<EventSessionSnapshot> =>
    invoke('stage:generate-heats', raceId, stageId),
  createFinalsStage: (raceId: string, input: CreateFinalsStageInput): Promise<EventSessionSnapshot> =>
    invoke('stage:create-finals', raceId, input),
  recordHeatResults: (raceId: string, input: RecordHeatResultsInput): Promise<EventSessionSnapshot> =>
    invoke('heat:record-results', raceId, input),
  setCurrentHeat: (raceId: string, heatId: string): Promise<EventSessionSnapshot> =>
    invoke('heat:set-current', raceId, heatId),
  advanceHeat: (raceId: string): Promise<EventSessionSnapshot> => invoke('heat:advance', raceId)
}

contextBridge.exposeInMainWorld('packRacer', packRacerApi)

export type PackRacerApi = typeof packRacerApi
