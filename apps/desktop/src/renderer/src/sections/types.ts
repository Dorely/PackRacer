import type {
  AddRaceEntryInput,
  AddRacerInput,
  CreateEventInput,
  CreateRaceInput,
  EventSessionSnapshot,
  Race,
  RaceEvent,
  RecordHeatResultsInput,
  RegisterRacerInput,
  RemovalResolutionStrategy,
  UpdateEventInput,
  UpdateRaceEntryInput,
  UpdateRaceInput,
  UpdateRacerInput
} from '@packracer/race-engine'

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
  deleteEvent: (eventId: string) => Promise<void>
  createRace: (input: CreateRaceInput) => Promise<void>
  updateRace: (raceId: string, input: UpdateRaceInput) => Promise<void>
  deleteRace: (raceId: string) => Promise<void>
  addRacer: (input: AddRacerInput) => Promise<void>
  updateRacer: (racerId: string, input: UpdateRacerInput) => Promise<void>
  deleteRacer: (racerId: string) => Promise<void>
  scratchRacer: (racerId: string) => Promise<void>
  resolveRacerRemoval: (strategy: RemovalResolutionStrategy) => Promise<void>
  addRaceEntry: (raceId: string, input: AddRaceEntryInput) => Promise<void>
  registerRacerForRace: (raceId: string, input: RegisterRacerInput) => Promise<void>
  updateRaceEntry: (raceId: string, entryId: string, input: UpdateRaceEntryInput) => Promise<void>
  removeRaceEntry: (raceId: string, entryId: string) => Promise<void>
  scratchRaceEntry: (raceId: string, entryId: string) => Promise<void>
  generateHeats: (raceId: string) => Promise<void>
  generateTieBreaker: (sourceRaceId: string, dependentRaceId: string) => Promise<void>
  recordHeatResults: (raceId: string, input: RecordHeatResultsInput) => Promise<void>
  clearHeatResults: (raceId: string, heatId: string) => Promise<void>
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
  requestConfirmation: (request: ConfirmationRequest) => void
}
