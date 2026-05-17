import type {
  AddRacerInput,
  AddStageInput,
  CreateFinalsStageInput,
  CreateProjectInput,
  ProjectSessionSnapshot,
  RaceProject,
  RecordHeatResultsInput,
  RemovalResolutionStrategy,
  UpdateProjectInput,
  UpdateRacerInput,
  UpdateStageInput
} from '@packracer/race-engine'

export type AppActions = {
  createProject: (input: CreateProjectInput) => Promise<void>
  openProject: () => Promise<void>
  updateProject: (input: UpdateProjectInput) => Promise<void>
  addRacer: (input: AddRacerInput) => Promise<void>
  updateRacer: (racerId: string, input: UpdateRacerInput) => Promise<void>
  scratchRacer: (racerId: string) => Promise<void>
  resolveRacerRemoval: (strategy: RemovalResolutionStrategy) => Promise<void>
  addStage: (input: AddStageInput) => Promise<void>
  updateStage: (stageId: string, input: UpdateStageInput) => Promise<void>
  generateHeats: (stageId: string) => Promise<void>
  createFinalsStage: (input: CreateFinalsStageInput) => Promise<void>
  recordHeatResults: (input: RecordHeatResultsInput) => Promise<void>
  setCurrentHeat: (heatId: string) => Promise<void>
  advanceHeat: () => Promise<void>
}

export type SectionProps = {
  session: ProjectSessionSnapshot | null
  project: RaceProject | null
  actions: AppActions
  selectedStageId: string
  setSelectedStageId: (stageId: string) => void
}