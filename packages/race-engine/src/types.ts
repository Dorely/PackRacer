export const PROJECT_SCHEMA_VERSION = 1

export type RaceFormat = 'timed-heats' | 'points-heats' | 'round-robin' | 'single-elimination'

export type TournamentType = RaceFormat | 'multi-stage'

export type ProjectStatus = 'draft' | 'ready' | 'running' | 'complete'

export type RacerStatus = 'active' | 'scratched' | 'no-show'

export type StageStatus = 'draft' | 'scheduled' | 'running' | 'complete'

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

export type AdvancementRule = {
  type: 'top-overall' | 'top-per-division' | 'manual'
  count: number
  targetFormat: RaceFormat
}

export type RaceProject = {
  id: string
  schemaVersion: number
  name: string
  eventDate: string
  trackName: string
  laneCount: number
  tournamentType: TournamentType
  status: ProjectStatus
  racers: Racer[]
  stages: Stage[]
  currentStageId?: string
  currentHeatId?: string
  activeRemovalImpact?: RemovalImpact
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

export type Stage = {
  id: string
  name: string
  format: RaceFormat
  status: StageStatus
  laneCount: number
  roundsPerRacer: number
  scoringMode: ScoringMode
  advancementRule?: AdvancementRule
  eligibleRacerIds?: string[]
  heats: Heat[]
  createdAt: string
  updatedAt: string
}

export type Heat = {
  id: string
  stageId: string
  heatNumber: number
  roundNumber: number
  status: HeatStatus
  laneAssignments: LaneAssignment[]
  results: LaneResult[]
  bracketSlot?: number
  sourceHeatIds?: string[]
  invalidReason?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type LaneAssignment = {
  lane: number
  racerId: string | null
  seed?: number
}

export type LaneResult = {
  lane: number
  racerId: string
  status: LaneResultStatus
  timeMs?: number
  finishPosition?: number
  notes?: string
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
  affectedStageIds: string[]
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
}

export type CreateProjectInput = {
  name: string
  eventDate?: string
  trackName?: string
  laneCount: number
  tournamentType: TournamentType
}

export type UpdateProjectInput = Partial<
  Pick<RaceProject, 'name' | 'eventDate' | 'trackName' | 'laneCount' | 'tournamentType' | 'status'>
>

export type AddRacerInput = {
  racerNumber: string
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

export type AddStageInput = {
  name: string
  format: RaceFormat
  laneCount?: number
  roundsPerRacer?: number
  scoringMode?: ScoringMode
  advancementRule?: AdvancementRule
  eligibleRacerIds?: string[]
}

export type UpdateStageInput = Partial<
  Pick<Stage, 'name' | 'format' | 'laneCount' | 'roundsPerRacer' | 'scoringMode' | 'advancementRule' | 'eligibleRacerIds'>
>

export type RecordHeatResultsInput = {
  heatId: string
  results: LaneResult[]
  notes?: string
}

export type CreateFinalsStageInput = {
  sourceStageId: string
  name: string
  format: RaceFormat
  topCount: number
  laneCount?: number
  scoringMode?: ScoringMode
}

export type ProjectSessionSnapshot = {
  filePath: string
  project: RaceProject
  standings: Standing[]
  auditLog: AuditEntry[]
}