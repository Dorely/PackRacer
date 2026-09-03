/// <reference types="vite/client" />

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
  UpdateRaceEntryInput,
  UpdateEventInput,
  UpdateRaceLaneAvailabilityInput,
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
  TimerState
} from '@packracer/timer-adapters'

declare global {
  interface Window {
    packRacer: {
      getVersion: () => Promise<string>
      openPopout: (input: { sectionId: string; selectedRaceId?: string }) => Promise<void>
      onSessionUpdated: (callback: (snapshot: EventSessionSnapshot | null) => void) => () => void
      createEvent: (input: CreateEventInput) => Promise<EventSessionSnapshot>
      getCurrentEvent: () => Promise<EventSessionSnapshot | null>
      listEvents: () => Promise<EventSummary[]>
      selectEvent: (eventId: string) => Promise<EventSessionSnapshot>
      updateEvent: (input: UpdateEventInput) => Promise<EventSessionSnapshot>
      deleteEvent: (eventId: string) => Promise<EventSessionSnapshot | null>
      createRace: (input: CreateRaceInput) => Promise<EventSessionSnapshot>
      updateRace: (raceId: string, input: UpdateRaceInput) => Promise<EventSessionSnapshot>
      updateRaceLaneAvailability: (raceId: string, input: UpdateRaceLaneAvailabilityInput) => Promise<EventSessionSnapshot>
      deleteRace: (raceId: string) => Promise<EventSessionSnapshot>
      addRacer: (input: AddRacerInput) => Promise<EventSessionSnapshot>
      updateRacer: (racerId: string, input: UpdateRacerInput) => Promise<EventSessionSnapshot>
      deleteRacer: (racerId: string) => Promise<EventSessionSnapshot>
      scratchRacer: (racerId: string) => Promise<EventSessionSnapshot>
      resolveRacerRemoval: (strategy: RemovalResolutionStrategy) => Promise<EventSessionSnapshot>
      addRaceEntry: (raceId: string, input: AddRaceEntryInput) => Promise<EventSessionSnapshot>
      registerRacerForRace: (raceId: string, input: RegisterRacerInput) => Promise<EventSessionSnapshot>
      updateRaceEntry: (raceId: string, entryId: string, input: UpdateRaceEntryInput) => Promise<EventSessionSnapshot>
      removeRaceEntry: (raceId: string, entryId: string) => Promise<EventSessionSnapshot>
      scratchRaceEntry: (raceId: string, entryId: string) => Promise<EventSessionSnapshot>
      generateHeats: (raceId: string) => Promise<EventSessionSnapshot>
      generateTieBreaker: (sourceRaceId: string, dependentRaceId: string) => Promise<EventSessionSnapshot>
      recordHeatResults: (raceId: string, input: RecordHeatResultsInput) => Promise<EventSessionSnapshot>
      clearHeatResults: (raceId: string, heatId: string) => Promise<EventSessionSnapshot>
      setCurrentHeat: (raceId: string, heatId: string) => Promise<EventSessionSnapshot>
      advanceHeat: (raceId: string) => Promise<EventSessionSnapshot>
      getTimerState: () => Promise<TimerState>
      getTimerProfiles: () => Promise<TimerProfile[]>
      listTimerPorts: () => Promise<TimerPortInfo[]>
      getTimerPreferences: () => Promise<TimerPreferences>
      saveTimerPreferences: (input: TimerPreferences) => Promise<TimerPreferences>
      connectTimer: (input: ConnectTimerInput) => Promise<TimerState>
      disconnectTimer: () => Promise<TimerState>
      armTimer: (raceId: string, heatId: string, laneMapping: Record<number, number>) => Promise<TimerState>
      disarmTimer: () => Promise<TimerState>
      resetTimer: () => Promise<TimerState>
      forceTimerResults: () => Promise<TimerState>
      releaseTimerGate: () => Promise<TimerState>
      configureTimerSimulator: (input: ConfigureSimulatorInput) => Promise<TimerState>
      runTimerSimulator: () => Promise<TimerState>
      discardTimerCapture: () => Promise<TimerState>
      acceptTimerCapture: (captureId: string, raceId: string, input: RecordHeatResultsInput) => Promise<EventSessionSnapshot>
      replayTimerProtocol: (profileId: PhysicalTimerProfileId) => Promise<TimerReplayResult>
      onTimerUpdated: (callback: (state: TimerState) => void) => () => void
    }
  }
}

export {}
