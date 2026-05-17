/// <reference types="vite/client" />

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

declare global {
  interface Window {
    packRacer: {
      getVersion: () => Promise<string>
      createEvent: (input: CreateEventInput) => Promise<EventSessionSnapshot>
      getCurrentEvent: () => Promise<EventSessionSnapshot | null>
      listEvents: () => Promise<EventSummary[]>
      selectEvent: (eventId: string) => Promise<EventSessionSnapshot>
      updateEvent: (input: UpdateEventInput) => Promise<EventSessionSnapshot>
      createRace: (input: CreateRaceInput) => Promise<EventSessionSnapshot>
      updateRace: (raceId: string, input: UpdateRaceInput) => Promise<EventSessionSnapshot>
      addRacer: (input: AddRacerInput) => Promise<EventSessionSnapshot>
      updateRacer: (racerId: string, input: UpdateRacerInput) => Promise<EventSessionSnapshot>
      scratchRacer: (racerId: string) => Promise<EventSessionSnapshot>
      resolveRacerRemoval: (strategy: RemovalResolutionStrategy) => Promise<EventSessionSnapshot>
      addStage: (raceId: string, input: AddStageInput) => Promise<EventSessionSnapshot>
      updateStage: (raceId: string, stageId: string, input: UpdateStageInput) => Promise<EventSessionSnapshot>
      generateHeats: (raceId: string, stageId: string) => Promise<EventSessionSnapshot>
      createFinalsStage: (raceId: string, input: CreateFinalsStageInput) => Promise<EventSessionSnapshot>
      recordHeatResults: (raceId: string, input: RecordHeatResultsInput) => Promise<EventSessionSnapshot>
      setCurrentHeat: (raceId: string, heatId: string) => Promise<EventSessionSnapshot>
      advanceHeat: (raceId: string) => Promise<EventSessionSnapshot>
    }
  }
}

export {}
