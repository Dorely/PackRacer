export const EVENT_SCHEMA_VERSION = 8

export type RaceFormat =
  | 'timed-heats'
  | 'points-heats'
  | 'round-robin'
  | 'single-elimination'
  | 'double-elimination'
  | 'triple-elimination'

export type EventStatus = 'draft' | 'ready' | 'running' | 'complete'

export type RaceStatus = 'draft' | 'ready' | 'running' | 'complete'

export type RacerStatus = 'active' | 'scratched' | 'no-show'

export type RaceEntryStatus = 'active' | 'scratched' | 'no-show'

export type HeatStatus = 'pending' | 'running' | 'complete' | 'skipped' | 'invalidated'

export type LaneResultStatus = 'ok' | 'dns' | 'dnf' | 'dq'

export type ScoringMode =
  | 'best-time'
  | 'average-time'
  | 'total-time'
  | 'points-high'
  | 'points-low'
  | 'round-robin-record'
  | 'elimination'

export type RemovalResolutionStrategy = 'keep-empty-lanes' | 'regenerate-pending' | 'invalidate-pending'

export type MakeupHeatSource = {
  originalHeatId: string
  originalHeatNumber: number
  lanes: MakeupLaneSource[]
}

export type MakeupLaneSource = {
  originalLane: number
  racerId: string
  resultStatus: Extract<LaneResultStatus, 'dns' | 'dnf'>
}

export type MakeupAssignmentSource = {
  originalHeatId: string
  originalHeatNumber: number
  originalLane: number
  resultStatus: Extract<LaneResultStatus, 'dns' | 'dnf'>
}

export type AdvancementTieBreakerSource = {
  sourceRaceId: string
  dependentRaceId: string
  topCount: number
  contestedSlots: number
  mainScore: number
  roundNumber: number
  tiedRacerIds: string[]
}

export type EliminationBracketMetadata = {
  lossCount: number
  roundNumber: number
  sequence: number
  isFinal?: boolean
  isCrossLoss?: boolean
}

export type AdvancementTieBreakerResolution = {
  sourceRaceId: string
  dependentRaceId: string
  topCount: number
  sourceComplete: boolean
  qualifierComplete: boolean
  needsTieBreaker: boolean
  resolved: boolean
  canGenerateTieBreaker: boolean
  selectedRacerIds: string[]
  lockedRacerIds: string[]
  resolvedRacerIds: string[]
  tiedRacerIds: string[]
  unresolvedRacerIds: string[]
  contestedSlots: number
  unresolvedContestedSlots: number
  mainScore: number | null
  pendingHeatIds: string[]
  latestRoundNumber: number
  nextRoundNumber: number
  message?: string
}

export type RaceSource = {
  sourceRaceId: string
  topCount: number
}

export type SchedulingOptions = {
  avoidSameLane: boolean
  avoidSameOpponents: boolean
  fillPartialHeats: boolean
}

export type AdvancementRule = {
  type: 'top-overall' | 'top-per-division' | 'manual'
  count: number
  targetFormat: RaceFormat
}

export type RaceEvent = {
  id: string
  schemaVersion: number
  name: string
  eventDate: string
  trackName: string
  laneCount: number
  status: EventStatus
  racers: Racer[]
  races: Race[]
  currentRaceId?: string
  activeRemovalImpact?: RemovalImpact
  createdAt: string
  updatedAt: string
}

export type Race = {
  id: string
  name: string
  format: RaceFormat
  status: RaceStatus
  laneCount: number
  disabledLaneNumbers?: number[]
  roundsPerRacer: number
  scoringMode: ScoringMode
  advancementRule?: AdvancementRule
  eligibleRacerIds?: string[]
  entries: RaceEntry[]
  source?: RaceSource
  schedulingOptions: SchedulingOptions
  heats: Heat[]
  currentHeatId?: string
  createdAt: string
  updatedAt: string
}

export type RaceEntry = {
  id: string
  racerId: string
  status: RaceEntryStatus
  checkedIn: boolean
  inspectionPassed: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export type Racer = {
  id: string
  racerNumber: string
  name: string
  division: string
  vehicleName: string
  status: RacerStatus
  checkedIn: boolean
  inspectionPassed: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export type Heat = {
  id: string
  heatNumber: number
  roundNumber: number
  status: HeatStatus
  laneAssignments: LaneAssignment[]
  results: LaneResult[]
  bracketSlot?: number
  eliminationBracket?: EliminationBracketMetadata
  sourceHeatIds?: string[]
  makeupSource?: MakeupHeatSource
  tieBreakerSource?: AdvancementTieBreakerSource
  invalidReason?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type LaneAssignment = {
  lane: number
  racerId: string | null
  seed?: number
  makeupSource?: MakeupAssignmentSource
}

export type LaneResult = {
  lane: number
  racerId: string
  status: LaneResultStatus
  timeMs?: number
  finishPosition?: number
  notes?: string
  excludedFromScoring?: boolean
  makeupHeatId?: string
}

export type Standing = {
  rank: number
  racerId: string
  racerNumber: string
  racerName: string
  division: string
  racerStatus: RacerStatus
  completedHeats: number
  score: number | null
  scoreLabel: string
  bestTimeMs?: number
  averageTimeMs?: number
  totalTimeMs?: number
  totalPoints?: number
  wins?: number
  losses?: number
}

export type RemovalImpact = {
  racerId: string
  racerName: string
  affectedRaceIds: string[]
  affectedHeatIds: string[]
  completedHeatIds: string[]
  invalidatedHeatIds: string[]
  createdAt: string
}

export type AuditEntry = {
  id: string
  createdAt: string
  action: string
  details: string
  eventId?: string
  raceId?: string
}

export type EventSummary = {
  id: string
  name: string
  eventDate: string
  status: EventStatus
  racerCount: number
  raceCount: number
  updatedAt: string
}

export type CreateEventInput = {
  name: string
  eventDate?: string
  trackName?: string
  laneCount?: number
  initialRace?: CreateRaceInput
}

export type UpdateEventInput = Partial<Pick<RaceEvent, 'name' | 'eventDate' | 'trackName' | 'laneCount' | 'status'>>

export type CreateRaceInput = {
  name: string
  format: RaceFormat
  laneCount?: number
  roundsPerRacer?: number
  scoringMode?: ScoringMode
  advancementRule?: AdvancementRule
  eligibleRacerIds?: string[]
  source?: RaceSource
  schedulingOptions?: Partial<SchedulingOptions>
}

export type UpdateRaceInput = Partial<
  Pick<Race, 'name' | 'format' | 'laneCount' | 'roundsPerRacer' | 'scoringMode' | 'advancementRule' | 'eligibleRacerIds' | 'status' | 'source'>
> & {
  schedulingOptions?: Partial<SchedulingOptions>
}

export type UpdateRaceLaneAvailabilityInput = {
  laneNumbers: number[]
  disabled: boolean
}

export type AddRacerInput = {
  racerNumber?: string
  name: string
  division: string
  vehicleName?: string
  checkedIn?: boolean
  inspectionPassed?: boolean
  notes?: string
}

export type UpdateRacerInput = Partial<
  Pick<
    Racer,
    | 'racerNumber'
    | 'name'
    | 'division'
    | 'vehicleName'
    | 'status'
    | 'checkedIn'
    | 'inspectionPassed'
    | 'notes'
  >
>

export type AddRaceEntryInput = {
  racerId: string
  checkedIn?: boolean
  inspectionPassed?: boolean
  notes?: string
}

export type RegisterRacerInput = AddRacerInput & {
  checkedIn?: boolean
  inspectionPassed?: boolean
}

export type UpdateRaceEntryInput = Partial<Pick<RaceEntry, 'status' | 'checkedIn' | 'inspectionPassed' | 'notes'>>

export type RecordHeatResultsInput = {
  heatId: string
  results: LaneResult[]
  rescheduleLanes?: number[]
  notes?: string
}

export type EventSessionSnapshot = {
  event: RaceEvent
  events: EventSummary[]
  standings: Standing[]
  auditLog: AuditEntry[]
}
