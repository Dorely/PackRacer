/// <reference types="vite/client" />

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

declare global {
  interface Window {
    packRacer: {
      getVersion: () => Promise<string>
      createProject: (input: CreateProjectInput) => Promise<ProjectSessionSnapshot | null>
      openProject: () => Promise<ProjectSessionSnapshot | null>
      getCurrentProject: () => Promise<ProjectSessionSnapshot | null>
      updateProject: (input: UpdateProjectInput) => Promise<ProjectSessionSnapshot>
      addRacer: (input: AddRacerInput) => Promise<ProjectSessionSnapshot>
      updateRacer: (racerId: string, input: UpdateRacerInput) => Promise<ProjectSessionSnapshot>
      scratchRacer: (racerId: string) => Promise<ProjectSessionSnapshot>
      resolveRacerRemoval: (strategy: RemovalResolutionStrategy) => Promise<ProjectSessionSnapshot>
      addStage: (input: AddStageInput) => Promise<ProjectSessionSnapshot>
      updateStage: (stageId: string, input: UpdateStageInput) => Promise<ProjectSessionSnapshot>
      generateHeats: (stageId: string) => Promise<ProjectSessionSnapshot>
      createFinalsStage: (input: CreateFinalsStageInput) => Promise<ProjectSessionSnapshot>
      recordHeatResults: (input: RecordHeatResultsInput) => Promise<ProjectSessionSnapshot>
      setCurrentHeat: (heatId: string) => Promise<ProjectSessionSnapshot>
      advanceHeat: () => Promise<ProjectSessionSnapshot>
    }
  }
}

export {}
