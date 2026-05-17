import { contextBridge, ipcRenderer } from 'electron'

import type {
  AddRacerInput,
  AddStageInput,
  CreateFinalsStageInput,
  CreateProjectInput,
  ProjectSessionSnapshot,
  RecordHeatResultsInput,
  RemovalResolutionStrategy,
  UpdateProjectInput,
  UpdateRacerInput,
  UpdateStageInput
} from '@packracer/race-engine'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

const packRacerApi = {
  getVersion: (): Promise<string> => invoke('app:get-version'),
  createProject: (input: CreateProjectInput): Promise<ProjectSessionSnapshot | null> => invoke('project:create', input),
  openProject: (): Promise<ProjectSessionSnapshot | null> => invoke('project:open'),
  getCurrentProject: (): Promise<ProjectSessionSnapshot | null> => invoke('project:get-current'),
  updateProject: (input: UpdateProjectInput): Promise<ProjectSessionSnapshot> => invoke('project:update', input),
  addRacer: (input: AddRacerInput): Promise<ProjectSessionSnapshot> => invoke('racer:add', input),
  updateRacer: (racerId: string, input: UpdateRacerInput): Promise<ProjectSessionSnapshot> =>
    invoke('racer:update', racerId, input),
  scratchRacer: (racerId: string): Promise<ProjectSessionSnapshot> => invoke('racer:scratch', racerId),
  resolveRacerRemoval: (strategy: RemovalResolutionStrategy): Promise<ProjectSessionSnapshot> =>
    invoke('racer:resolve-removal', strategy),
  addStage: (input: AddStageInput): Promise<ProjectSessionSnapshot> => invoke('stage:add', input),
  updateStage: (stageId: string, input: UpdateStageInput): Promise<ProjectSessionSnapshot> =>
    invoke('stage:update', stageId, input),
  generateHeats: (stageId: string): Promise<ProjectSessionSnapshot> => invoke('stage:generate-heats', stageId),
  createFinalsStage: (input: CreateFinalsStageInput): Promise<ProjectSessionSnapshot> =>
    invoke('stage:create-finals', input),
  recordHeatResults: (input: RecordHeatResultsInput): Promise<ProjectSessionSnapshot> =>
    invoke('heat:record-results', input),
  setCurrentHeat: (heatId: string): Promise<ProjectSessionSnapshot> => invoke('heat:set-current', heatId),
  advanceHeat: (): Promise<ProjectSessionSnapshot> => invoke('heat:advance')
}

contextBridge.exposeInMainWorld('packRacer', packRacerApi)

export type PackRacerApi = typeof packRacerApi
