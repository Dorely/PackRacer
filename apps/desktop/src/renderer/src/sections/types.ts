import type {
  AddRacerInput,
  AddStageInput,
  CreateEventInput,
  CreateFinalsStageInput,
  CreateRaceInput,
  EventSessionSnapshot,
  Race,
  RaceEvent,
  RecordHeatResultsInput,
  RemovalResolutionStrategy,
  UpdateEventInput,
  UpdateRaceInput,
  UpdateRacerInput,
  UpdateStageInput
} from '@packracer/race-engine'

export type AppActions = {
  createEvent: (input: CreateEventInput) => Promise<void>
  selectEvent: (eventId: string) => Promise<void>
  updateEvent: (input: UpdateEventInput) => Promise<void>
  createRace: (input: CreateRaceInput) => Promise<void>
  updateRace: (raceId: string, input: UpdateRaceInput) => Promise<void>
  addRacer: (input: AddRacerInput) => Promise<void>
  updateRacer: (racerId: string, input: UpdateRacerInput) => Promise<void>
  scratchRacer: (racerId: string) => Promise<void>
  resolveRacerRemoval: (strategy: RemovalResolutionStrategy) => Promise<void>
  addStage: (raceId: string, input: AddStageInput) => Promise<void>
  updateStage: (raceId: string, stageId: string, input: UpdateStageInput) => Promise<void>
  generateHeats: (raceId: string, stageId: string) => Promise<void>
  createFinalsStage: (raceId: string, input: CreateFinalsStageInput) => Promise<void>
  recordHeatResults: (raceId: string, input: RecordHeatResultsInput) => Promise<void>
  setCurrentHeat: (raceId: string, heatId: string) => Promise<void>
  advanceHeat: (raceId: string) => Promise<void>
}

export type SectionProps = {
  session: EventSessionSnapshot | null
  event: RaceEvent | null
  currentRace: Race | null
  actions: AppActions
  selectedRaceId: string
  setSelectedRaceId: (raceId: string) => void
  selectedStageId: string
  setSelectedStageId: (stageId: string) => void
}