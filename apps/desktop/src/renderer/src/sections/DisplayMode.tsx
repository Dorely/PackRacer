import { Monitor, Pin, PinOff, RotateCcw, Trophy } from 'lucide-react'
import {
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import {
  calculateStandings,
  eliminationLossLimit,
  type Heat,
  type Race,
  type RaceEvent,
  type Standing
} from '@packracer/race-engine'

import { formatStatus, formatTime, racerLabel } from '../formatters'
import type { SectionProps } from './types'

type DisplayContext = {
  event: RaceEvent
  race: Race
  currentHeat: Heat | undefined
  raceFinished: boolean
  standings: Standing[]
  disabledLaneNumbers: Set<number>
}

type DisplayViewId = 'current' | 'standings' | 'records' | 'schedule' | 'bracket'

type DisplayView = {
  id: DisplayViewId
  label: string
}

type TournamentParticipant = {
  racerId: string | null
  seed?: number
  placeholder: string
  sourceMatchNumber?: number
  sourceLabel?: string
  lossCount?: number
}

type TournamentMatch = {
  id: string
  heat?: Heat
  displayCode?: string
  supportingLabel?: string
  matchNumber: number
  roundNumber: number
  matchIndex: number
  participants: TournamentParticipant[]
  sourceMatchNumbers: number[]
  status: Heat['status'] | 'pending'
  winnerId?: string
  resultSummary: string
  isCurrent: boolean
  isChampion: boolean
  isReset?: boolean
}

type TournamentRound = {
  id: string
  roundNumber: number
  label: string
  matches: TournamentMatch[]
  isChampion: boolean
}

type BracketPage = {
  id: string
  label: string
  mode: 'full' | 'focused' | 'section' | 'status'
  roundIds?: string[]
  sectionIds?: string[]
}

type BracketConnectorVariant = 'winner' | 'drop' | 'progression'

type BracketConnector = {
  id: string
  fromId: string
  toId: string
  variant: BracketConnectorVariant
  label?: string
}

type BracketSectionKind =
  | 'single'
  | 'winners'
  | 'losers'
  | 'grand-final'
  | 'loss-lane'
  | 'status'

type BracketSection = {
  id: string
  title: string
  subtitle?: string
  kind: BracketSectionKind
  columns: TournamentRound[]
  connectors: BracketConnector[]
}

type ConnectorPath = {
  id: string
  d: string
  variant: BracketConnectorVariant
  label?: string
  labelX: number
  labelY: number
}

type CardRefMap = MutableRefObject<Map<string, HTMLElement>>

type BracketStatusGroup = {
  id: string
  label: string
  racerIds: string[]
  eliminated: boolean
}

const fullBracketPageId = 'full'
const bracketRowsPerSlot = 12
const bracketCardRowSpan = 11

function displayViewsForRace(race: Race): DisplayView[] {
  switch (race.format) {
    case 'timed-heats':
    case 'points-heats':
      return [
        { id: 'current', label: 'Current Heat' },
        { id: 'standings', label: 'Standings' }
      ]
    case 'round-robin':
      return [
        { id: 'current', label: 'Current Match' },
        { id: 'records', label: 'Records' },
        { id: 'schedule', label: 'Schedule' }
      ]
    case 'single-elimination':
      return [
        { id: 'bracket', label: 'Bracket' },
        { id: 'current', label: 'Current Match' }
      ]
    case 'double-elimination':
    case 'triple-elimination':
      return [
        { id: 'bracket', label: 'Bracket' },
        { id: 'records', label: 'Records' },
        { id: 'current', label: 'Current Match' }
      ]
    default:
      return [{ id: 'current', label: 'Current Heat' }]
  }
}

function isUnfinishedHeat(heat: Heat): boolean {
  return heat.status === 'pending' || heat.status === 'running' || heat.status === 'invalidated'
}

function resultRankValue(result: Heat['results'][number]): number {
  if (typeof result.finishPosition === 'number') {
    return result.finishPosition
  }

  if (typeof result.timeMs === 'number') {
    return result.timeMs
  }

  return Number.POSITIVE_INFINITY
}

function heatWinnerId(heat: Heat | undefined): string | undefined {
  return heat?.results
    .filter((result) => result.status === 'ok' && !result.excludedFromScoring)
    .sort((first, second) => resultRankValue(first) - resultRankValue(second))[0]?.racerId
}

function currentHeatLabel(heat: Heat | undefined): string {
  if (!heat) {
    return 'No heat'
  }

  if (heat.tieBreakerSource) {
    return `Tie-Breaker Round ${heat.tieBreakerSource.roundNumber}`
  }

  return `Heat ${heat.heatNumber}`
}

function tournamentRoundLabel(roundIndex: number, roundCount: number): string {
  if (roundIndex === roundCount - 1) {
    return 'Finals'
  }

  if (roundIndex === roundCount - 2) {
    return 'Semifinals'
  }

  return `Round ${roundIndex + 1}`
}

function firstRoundParticipantCount(race: Race): number {
  const activeEntries = race.entries.filter((entry) => entry.status === 'active').length
  const firstRoundHeats = race.heats.filter((heat) => heat.roundNumber === 1)
  const firstRoundAssignments = firstRoundHeats.flatMap((heat) =>
    heat.laneAssignments.filter((assignment) => assignment.racerId || assignment.seed)
  )
  const maxSeed = Math.max(...firstRoundAssignments.map((assignment) => assignment.seed ?? 0), 0)

  return Math.max(activeEntries, firstRoundAssignments.length, maxSeed, 1)
}

function tournamentRoundMatchCounts(race: Race): number[] {
  const firstRoundHeats = race.heats.filter((heat) => heat.roundNumber === 1)
  const actualMaxRoundNumber = Math.max(...race.heats.map((heat) => heat.roundNumber), 0)
  const counts: number[] = []
  let matchCount = Math.max(Math.ceil(firstRoundParticipantCount(race) / 2), firstRoundHeats.length, 1)
  let roundNumber = 1

  while (roundNumber <= actualMaxRoundNumber || matchCount >= 1) {
    const actualRoundCount = race.heats.filter((heat) => heat.roundNumber === roundNumber).length
    const resolvedMatchCount = Math.max(matchCount, actualRoundCount, 1)

    counts.push(resolvedMatchCount)

    if (resolvedMatchCount <= 1 && roundNumber >= actualMaxRoundNumber) {
      break
    }

    matchCount = Math.ceil(resolvedMatchCount / 2)
    roundNumber += 1
  }

  return counts
}

function heatResultSummary(context: DisplayContext, heat: Heat | undefined): string {
  if (!heat || heat.results.length === 0) {
    return 'Awaiting result'
  }

  const scoringResults = heat.results
    .filter((result) => result.status === 'ok' && !result.excludedFromScoring)
    .sort((first, second) => resultRankValue(first) - resultRankValue(second))

  if (scoringResults.length === 0) {
    return 'Result recorded, winner pending'
  }

  const winner = scoringResults[0]
  const resultText = typeof winner.timeMs === 'number' ? `, ${formatTime(winner.timeMs)}` : ''

  return `${racerLabel(context.event.racers, winner.racerId)} wins${resultText}`
}

function tournamentResultText(context: DisplayContext, match: TournamentMatch): string {
  if (!match.winnerId) {
    return match.resultSummary
  }

  const winnerResult = match.heat?.results.find(
    (result) => result.racerId === match.winnerId && result.status === 'ok' && !result.excludedFromScoring
  )
  const detail =
    typeof winnerResult?.timeMs === 'number'
      ? ` (${formatTime(winnerResult.timeMs)})`
      : typeof winnerResult?.finishPosition === 'number'
        ? ` (Place ${winnerResult.finishPosition})`
        : ''

  return `Winner: ${racerLabel(context.event.racers, match.winnerId)}${detail}`
}

function participantSourceMatch(
  heat: Heat | undefined,
  sourceMatches: TournamentMatch[],
  participantIndex: number
): TournamentMatch | undefined {
  const sourceHeatId = heat?.sourceHeatIds?.[participantIndex]

  return sourceHeatId
    ? sourceMatches.find((match) => match.heat?.id === sourceHeatId)
    : sourceMatches[participantIndex]
}

function participantLabel(
  heat: Heat | undefined,
  sourceMatches: TournamentMatch[],
  participantIndex: number
): string {
  const sourceMatch = participantSourceMatch(heat, sourceMatches, participantIndex)

  if (sourceMatch) {
    return `Winner of Match ${sourceMatch.matchNumber}`
  }

  return heat ? 'Bye' : 'TBD'
}

function heatParticipants(heat: Heat | undefined, sourceMatches: TournamentMatch[]): TournamentParticipant[] {
  const assignments = heat?.laneAssignments.filter((assignment) => assignment.racerId || assignment.seed).slice(0, 2) ?? []

  if (assignments.length > 0) {
    const participants: TournamentParticipant[] = assignments.map((assignment, index) => {
      const sourceMatch = participantSourceMatch(heat, sourceMatches, index)

      return {
        racerId: assignment.racerId,
        seed: assignment.seed,
        placeholder: assignment.racerId ? '' : participantLabel(heat, sourceMatches, index),
        sourceMatchNumber: sourceMatch?.matchNumber
      }
    })

    while (participants.length < 2) {
      participants.push({
        racerId: null,
        placeholder: participantLabel(heat, sourceMatches, participants.length),
        sourceMatchNumber: participantSourceMatch(heat, sourceMatches, participants.length)?.matchNumber
      })
    }

    return participants
  }

  const participants: TournamentParticipant[] = sourceMatches.slice(0, 2).map((match) => ({
    racerId: null,
    placeholder: `Winner of Match ${match.matchNumber}`,
    sourceMatchNumber: match.matchNumber
  }))

  while (participants.length < 2) {
    participants.push({ racerId: null, placeholder: heat || sourceMatches.length === 1 ? 'Bye' : 'TBD' })
  }

  return participants
}

function buildTournamentRounds(context: DisplayContext): TournamentRound[] {
  const matchCounts = tournamentRoundMatchCounts(context.race)
  const bracketRoundCount = matchCounts.length
  const heatsByRound = new Map<number, Heat[]>()

  for (const heat of context.race.heats) {
    const roundHeats = heatsByRound.get(heat.roundNumber) ?? []
    roundHeats.push(heat)
    heatsByRound.set(heat.roundNumber, roundHeats)
  }

  for (const roundHeats of heatsByRound.values()) {
    roundHeats.sort((first, second) => first.heatNumber - second.heatNumber)
  }

  const rounds: TournamentRound[] = []
  let previousMatches: TournamentMatch[] = []
  let fallbackMatchNumber = 1

  for (let roundIndex = 0; roundIndex < bracketRoundCount; roundIndex += 1) {
    const roundNumber = roundIndex + 1
    const matchCount = matchCounts[roundIndex]
    const roundHeats = heatsByRound.get(roundNumber) ?? []
    const matches: TournamentMatch[] = []

    for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
      const heat = roundHeats[matchIndex]
      const sourceMatches = previousMatches.slice(matchIndex * 2, matchIndex * 2 + 2)
      const matchNumber = heat?.heatNumber ?? fallbackMatchNumber
      const sourceMatchNumbers =
        heat?.sourceHeatIds
          ?.map((sourceHeatId) => previousMatches.find((match) => match.heat?.id === sourceHeatId)?.matchNumber)
          .filter((sourceMatchNumber): sourceMatchNumber is number => typeof sourceMatchNumber === 'number') ??
        sourceMatches.map((match) => match.matchNumber)

      matches.push({
        id: heat?.id ?? `round-${roundNumber}-match-${matchIndex + 1}`,
        heat,
        matchNumber,
        roundNumber,
        matchIndex,
        participants: heatParticipants(heat, sourceMatches),
        sourceMatchNumbers,
        status: heat?.status ?? 'pending',
        winnerId: heatWinnerId(heat),
        resultSummary: heatResultSummary(context, heat),
        isCurrent: Boolean(heat && heat.id === context.currentHeat?.id),
        isChampion: false
      })

      fallbackMatchNumber += 1
    }

    rounds.push({
      id: `round-${roundNumber}`,
      roundNumber,
      label: tournamentRoundLabel(roundIndex, bracketRoundCount),
      matches,
      isChampion: false
    })
    previousMatches = matches
  }

  const finalMatch = previousMatches[0]
  const championId = finalMatch?.winnerId
  const championMatch: TournamentMatch = {
    id: 'champion',
    matchNumber: finalMatch?.matchNumber ?? fallbackMatchNumber,
    roundNumber: bracketRoundCount + 1,
    matchIndex: 0,
    participants: [
      {
        racerId: championId ?? null,
        placeholder: championId ? '' : finalMatch ? `Winner of Match ${finalMatch.matchNumber}` : 'Champion'
      }
    ],
    sourceMatchNumbers: finalMatch ? [finalMatch.matchNumber] : [],
    status: championId ? 'complete' : 'pending',
    winnerId: championId,
    resultSummary: championId ? `${racerLabel(context.event.racers, championId)} wins` : 'Awaiting final winner',
    isCurrent: false,
    isChampion: true
  }

  rounds.push({
    id: 'champion',
    roundNumber: bracketRoundCount + 1,
    label: 'Champion',
    matches: [championMatch],
    isChampion: true
  })

  return rounds
}

function matchFromHeat(context: DisplayContext, heat: Heat, matchIndex: number): TournamentMatch {
  return {
    id: heat.id,
    heat,
    matchNumber: heat.heatNumber,
    roundNumber: heat.roundNumber,
    matchIndex,
    participants: heatParticipants(heat, []),
    sourceMatchNumbers: [],
    status: heat.status,
    winnerId: heatWinnerId(heat),
    resultSummary: heatResultSummary(context, heat),
    isCurrent: heat.id === context.currentHeat?.id,
    isChampion: false
  }
}

function bracketMatchStatusLabel(match: TournamentMatch): string {
  if (match.isChampion) {
    return match.winnerId ? 'Complete' : 'Pending'
  }

  return match.isCurrent ? 'Current' : formatStatus(match.status)
}

function participantDisplayLabel(context: DisplayContext, participant: TournamentParticipant): string {
  return participant.racerId ? racerLabel(context.event.racers, participant.racerId) : participant.placeholder
}

function buildSingleEliminationPages(rounds: TournamentRound[]): BracketPage[] {
  const competitionRounds = rounds.filter((round) => !round.isChampion)
  const pages: BracketPage[] = [
    {
      id: fullBracketPageId,
      label: 'Full Bracket',
      mode: 'full',
      roundIds: rounds.map((round) => round.id)
    }
  ]

  competitionRounds.forEach((round, roundIndex) => {
    const bracketRoundIds = rounds.slice(roundIndex).map((visibleRound) => visibleRound.id)

    pages.push({
      id: `round-${round.roundNumber}-bracket`,
      label: `${round.label} Bracket`,
      mode: 'focused',
      roundIds: bracketRoundIds
    })
  })

  return pages
}

function autoSingleEliminationPageId(context: DisplayContext, pages: BracketPage[], rounds: TournamentRound[]): string {
  if (context.raceFinished) {
    const finalRound = [...rounds].reverse().find((round) => !round.isChampion)

    return pages.find((page) => finalRound && page.id === `round-${finalRound.roundNumber}-bracket`)?.id ?? fullBracketPageId
  }

  if (!context.currentHeat) {
    return fullBracketPageId
  }

  const currentRound = rounds.find((round) => round.roundNumber === context.currentHeat?.roundNumber)

  return pages.find((page) => currentRound && page.id === `round-${currentRound.roundNumber}-bracket`)?.id ?? fullBracketPageId
}

function selectedBracketPage(pages: BracketPage[], selectedPageId: string): BracketPage {
  return pages.find((page) => page.id === selectedPageId) ?? pages[0]
}

function currentBracketDetail(context: DisplayContext, page: BracketPage | undefined, locationLabel: string): string {
  if (context.raceFinished) {
    return page ? `${page.label} - Complete` : 'Complete'
  }

  if (!context.currentHeat) {
    return page ? `${page.label} - No active match` : 'No active match'
  }

  return page ? `${page.label} - ${locationLabel}` : locationLabel
}

function eliminationRecordGroups(context: DisplayContext): Array<{ lossCount: number; label: string; standings: Standing[] }> {
  const lossLimit = eliminationLossLimit(context.race.format)
  const groups: Array<{ lossCount: number; label: string; standings: Standing[] }> = []

  for (let lossCount = 0; lossCount < lossLimit; lossCount += 1) {
    groups.push({
      lossCount,
      label: lossCount === 1 ? '1 Loss' : `${lossCount} Losses`,
      standings: context.standings.filter((standing) => (standing.losses ?? 0) === lossCount)
    })
  }

  groups.push({
    lossCount: lossLimit,
    label: 'Eliminated',
    standings: context.standings.filter((standing) => (standing.losses ?? 0) >= lossLimit)
  })

  return groups
}

function renderEliminationRecords(context: DisplayContext, options: { compact?: boolean } = {}) {
  return (
    <div className="record-group-grid" data-compact={options.compact}>
      {eliminationRecordGroups(context)
        .filter((group) => group.standings.length > 0 || !options.compact)
        .map((group) => (
          <article className="record-group" data-empty={group.standings.length === 0} key={group.label}>
            <span>{group.label}</span>
            <strong>{group.standings.length} racer{group.standings.length === 1 ? '' : 's'}</strong>
            <ol className="leader-list compact">
              {group.standings.map((standing) => (
                <li key={`${group.label}-${standing.racerId}`}>
                  <span>#{standing.racerNumber} {standing.racerName}</span>
                  <strong>{standing.wins ?? 0}-{standing.losses ?? 0}</strong>
                </li>
              ))}
            </ol>
            {group.standings.length === 0 ? <p className="empty-state">No racers in this group.</p> : null}
          </article>
        ))}
    </div>
  )
}

function renderLaneAssignments(context: DisplayContext, heat: Heat | undefined) {
  if (!heat) {
    return <p className="empty-state">No heat scheduled.</p>
  }

  return (
    <div className="lane-grid">
      {heat.laneAssignments.map((assignment) => {
        const isDisabledLane = !assignment.racerId && context.disabledLaneNumbers.has(assignment.lane)

        return (
          <div className="lane-row" data-disabled={isDisabledLane} key={assignment.lane}>
            <span>{isDisabledLane ? `Lane ${assignment.lane} disabled` : `Lane ${assignment.lane}`}</span>
            <strong>{isDisabledLane ? 'Disabled' : racerLabel(context.event.racers, assignment.racerId)}</strong>
          </div>
        )
      })}
    </div>
  )
}

function renderStandingList(standings: Standing[], options: { title: string; label?: string; limit?: number }) {
  const visibleStandings = standings.slice(0, options.limit ?? 8)

  return (
    <article>
      <span>{options.label ?? 'Leaders'}</span>
      <strong>{options.title}</strong>
      <ol className="leader-list">
        {visibleStandings.map((standing) => (
          <li key={standing.racerId}>
            <span>#{standing.racerNumber} {standing.racerName}</span>
            <strong>{standing.bestTimeMs ? formatTime(standing.bestTimeMs) : standing.scoreLabel}</strong>
          </li>
        ))}
      </ol>
      {visibleStandings.length === 0 ? <p className="empty-state">Results will appear after scoring starts.</p> : null}
    </article>
  )
}

function HeatDisplay({ context, label }: { context: DisplayContext; label: string }) {
  return (
    <div className="display-grid">
      <article>
        <span>{context.raceFinished ? 'Race Finished' : label}</span>
        <strong>{context.raceFinished ? context.race.name : currentHeatLabel(context.currentHeat)}</strong>
        {context.raceFinished ? <p className="empty-state">All heats are complete.</p> : renderLaneAssignments(context, context.currentHeat)}
      </article>

      {renderStandingList(context.standings, {
        title: context.race.name,
        label: context.raceFinished ? 'Final Results' : context.race.format === 'points-heats' ? 'Points Standings' : 'Leaders'
      })}
    </div>
  )
}

function StandingsDisplay({ context, label }: { context: DisplayContext; label: string }) {
  return (
    <div className="display-grid standings-display">
      {renderStandingList(context.standings, {
        title: context.race.name,
        label,
        limit: 16
      })}
      <article>
        <span>{context.raceFinished ? 'Race Finished' : 'Current'}</span>
        <strong>{context.raceFinished ? context.race.name : currentHeatLabel(context.currentHeat)}</strong>
        {context.raceFinished ? <p className="empty-state">All heats are complete.</p> : renderLaneAssignments(context, context.currentHeat)}
      </article>
    </div>
  )
}

function RoundRobinDisplay({ context }: { context: DisplayContext }) {
  const currentRound = context.currentHeat?.roundNumber ?? context.race.heats.find(isUnfinishedHeat)?.roundNumber ?? 1
  const totalRounds = Math.max(...context.race.heats.map((heat) => heat.roundNumber), 0)

  return (
    <div className="display-grid round-robin-display">
      <article className="match-focus">
        <span>{context.raceFinished ? 'Round Robin Complete' : `Round ${currentRound} of ${Math.max(totalRounds, 1)}`}</span>
        <strong>{context.raceFinished ? context.race.name : currentHeatLabel(context.currentHeat)}</strong>
        {context.raceFinished ? <p className="empty-state">All matchups are complete.</p> : renderLaneAssignments(context, context.currentHeat)}
      </article>

      <article>
        <span>Records</span>
        <strong>{context.race.name}</strong>
        <ol className="leader-list record-list">
          {context.standings.map((standing) => (
            <li key={standing.racerId}>
              <span>#{standing.racerNumber} {standing.racerName}</span>
              <strong>{standing.wins ?? 0}-{standing.losses ?? 0}</strong>
            </li>
          ))}
        </ol>
      </article>
    </div>
  )
}

function RoundRobinRecordsDisplay({ context }: { context: DisplayContext }) {
  return (
    <div className="display-grid round-robin-display">
      <article>
        <span>Records</span>
        <strong>{context.race.name}</strong>
        <ol className="leader-list record-list">
          {context.standings.map((standing) => (
            <li key={standing.racerId}>
              <span>#{standing.racerNumber} {standing.racerName}</span>
              <strong>{standing.wins ?? 0}-{standing.losses ?? 0}</strong>
            </li>
          ))}
        </ol>
      </article>
      <article>
        <span>{context.raceFinished ? 'Complete' : 'Current Match'}</span>
        <strong>{context.raceFinished ? context.race.name : currentHeatLabel(context.currentHeat)}</strong>
        {context.raceFinished ? <p className="empty-state">All matchups are complete.</p> : renderLaneAssignments(context, context.currentHeat)}
      </article>
    </div>
  )
}

function RoundRobinScheduleDisplay({ context }: { context: DisplayContext }) {
  const rounds = new Map<number, Heat[]>()

  for (const heat of context.race.heats) {
    const roundHeats = rounds.get(heat.roundNumber) ?? []
    roundHeats.push(heat)
    rounds.set(heat.roundNumber, roundHeats)
  }

  for (const roundHeats of rounds.values()) {
    roundHeats.sort((first, second) => first.heatNumber - second.heatNumber)
  }

  return (
    <div className="schedule-board">
      {[...rounds.entries()].map(([roundNumber, heats]) => (
        <article className="schedule-round" key={roundNumber}>
          <span>Round {roundNumber}</span>
          <strong>{heats.length} match{heats.length === 1 ? '' : 'es'}</strong>
          <ol className="schedule-match-list">
            {heats.map((heat) => (
              <li data-current={heat.id === context.currentHeat?.id} key={heat.id}>
                <span>Heat {heat.heatNumber}</span>
                <strong>{heatResultSummary(context, heat)}</strong>
                <small>{formatStatus(heat.status)}</small>
              </li>
            ))}
          </ol>
        </article>
      ))}
      {context.race.heats.length === 0 ? <p className="empty-state">Generate heats to show the round robin schedule.</p> : null}
    </div>
  )
}

function EliminationCurrentDisplay({ context }: { context: DisplayContext }) {
  const champion = context.raceFinished ? context.standings[0] : undefined

  return (
    <div className="display-grid elimination-current-grid">
      <article className="match-focus elimination-current">
        <span>{context.raceFinished ? 'Champion' : 'Current Match'}</span>
        <strong>{context.raceFinished ? 'Final Result' : currentHeatLabel(context.currentHeat)}</strong>
        {champion ? (
          <div className="champion-callout">
            <span>Champion</span>
            <strong>#{champion.racerNumber} {champion.racerName}</strong>
          </div>
        ) : (
          renderLaneAssignments(context, context.currentHeat)
        )}
      </article>
      <article>
        <span>Records</span>
        <strong>{context.race.name}</strong>
        <ol className="leader-list record-list">
          {context.standings.slice(0, 10).map((standing) => (
            <li key={standing.racerId}>
              <span>#{standing.racerNumber} {standing.racerName}</span>
              <strong>{standing.scoreLabel}</strong>
            </li>
          ))}
        </ol>
      </article>
    </div>
  )
}

function currentMatchDisplayCode(context: DisplayContext): string {
  const heat = context.currentHeat

  if (!heat) {
    return 'No match'
  }

  const bracket = heat.eliminationBracket

  if (context.race.format === 'double-elimination') {
    if (bracket?.isFinal) {
      return `GF${bracket.sequence}`
    }

    if ((bracket?.lossCount ?? 0) > 0 || bracket?.isCrossLoss) {
      return `L${heat.heatNumber}`
    }

    return `W${heat.heatNumber}`
  }

  return `M${heat.heatNumber}`
}

function heatParticipantSummary(context: DisplayContext, heat: Heat | undefined): string {
  if (!heat) {
    return 'No active match'
  }

  const participants = heat.laneAssignments
    .filter((assignment) => assignment.racerId || assignment.seed)
    .slice(0, 2)
    .map((assignment) =>
      assignment.racerId
        ? racerLabel(context.event.racers, assignment.racerId)
        : assignment.seed
          ? `Seed ${assignment.seed}`
          : 'Bye'
    )

  return participants.length > 0 ? participants.join(' vs ') : heatResultSummary(context, heat)
}

function matchStatusKey(match: TournamentMatch): Heat['status'] | 'current' | 'pending' {
  return match.isCurrent ? 'current' : match.status
}

function participantMetaLabel(participant: TournamentParticipant, isChampion: boolean): string {
  if (participant.sourceLabel) {
    return participant.sourceLabel
  }

  if (typeof participant.lossCount === 'number') {
    return participant.lossCount === 1 ? '1 loss' : `${participant.lossCount} losses`
  }

  if (participant.seed) {
    return `Seed ${participant.seed}`
  }

  if (participant.sourceMatchNumber) {
    return `From M${participant.sourceMatchNumber}`
  }

  return isChampion ? 'Champion' : 'Entry'
}

function participantResultLabel(match: TournamentMatch, participant: TournamentParticipant): string {
  if (!participant.racerId) {
    return participant.placeholder === 'Bye' ? 'Bye' : '-'
  }

  const result = match.heat?.results.find((candidate) => candidate.racerId === participant.racerId)

  if (!result || result.excludedFromScoring) {
    return '-'
  }

  if (typeof result.timeMs === 'number' && result.status === 'ok') {
    return formatTime(result.timeMs)
  }

  if (typeof result.finishPosition === 'number' && result.status === 'ok') {
    return `#${result.finishPosition}`
  }

  return result.status.toUpperCase()
}

function withParticipantDetails(
  match: TournamentMatch,
  details: (participant: TournamentParticipant) => Partial<TournamentParticipant>
): TournamentMatch {
  return {
    ...match,
    participants: match.participants.map((participant) => ({
      ...participant,
      ...details(participant)
    }))
  }
}

function matchCardGridStyle(matchIndex: number, matchCount: number, totalSlots: number): CSSProperties {
  const safeMatchCount = Math.max(matchCount, 1)
  const safeTotalSlots = Math.max(totalSlots, 1)
  const centerRow = ((matchIndex + 0.5) * safeTotalSlots * bracketRowsPerSlot) / safeMatchCount
  const rowStart = Math.max(1, Math.round(centerRow - bracketCardRowSpan / 2) + 1)

  return { gridRow: `${rowStart} / span ${bracketCardRowSpan}` }
}

function setCardRef(cardRefs: CardRefMap, cardId: string) {
  return (element: HTMLElement | null) => {
    if (element) {
      cardRefs.current.set(cardId, element)
    } else {
      cardRefs.current.delete(cardId)
    }
  }
}

function MatchCard({
  cardRefs,
  context,
  match,
  style
}: {
  cardRefs: CardRefMap
  context: DisplayContext
  match: TournamentMatch
  style?: CSSProperties
}) {
  const statusLabel = bracketMatchStatusLabel(match)
  const displayCode = match.displayCode ?? `M${match.matchNumber}`

  return (
    <div className="bracket-match-slot" style={style}>
      <article
        className="bracket-match-card"
        data-current={match.isCurrent}
        data-reset={match.isReset}
        data-status={matchStatusKey(match)}
        ref={setCardRef(cardRefs, match.id)}
      >
        <div className="bracket-match-heading">
          <span>{match.isReset ? <RotateCcw aria-hidden="true" size={15} /> : null}{displayCode}</span>
          <strong>{statusLabel}</strong>
        </div>

        {match.supportingLabel ? <span className="bracket-match-supporting">{match.supportingLabel}</span> : null}

        <div className="bracket-entrant-list">
          {match.participants.map((participant, index) => {
            const isWinner = Boolean(participant.racerId && participant.racerId === match.winnerId)
            const isBye = participant.placeholder === 'Bye'

            return (
              <div
                className="bracket-entrant-row"
                data-bye={isBye}
                data-empty={!participant.racerId}
                data-winner={isWinner}
                key={`${match.id}:participant:${participant.racerId ?? participant.placeholder}:${index}`}
              >
                <span>{participantMetaLabel(participant, false)}</span>
                <strong>{participantDisplayLabel(context, participant)}</strong>
                <small>{participantResultLabel(match, participant)}</small>
              </div>
            )
          })}
        </div>

        <div className="bracket-match-result">{tournamentResultText(context, match)}</div>
      </article>
    </div>
  )
}

function ChampionCard({
  cardRefs,
  context,
  match,
  style
}: {
  cardRefs: CardRefMap
  context: DisplayContext
  match: TournamentMatch
  style?: CSSProperties
}) {
  const participant = match.participants[0]
  const championLabel = participant ? participantDisplayLabel(context, participant) : 'Champion'

  return (
    <div className="bracket-match-slot" style={style}>
      <article
        className="bracket-champion-card"
        data-status={matchStatusKey(match)}
        ref={setCardRef(cardRefs, match.id)}
      >
        <div className="bracket-champion-icon" aria-hidden="true">
          <Trophy size={28} />
        </div>
        <div>
          <span>Champion</span>
          <strong>{championLabel}</strong>
          <small>{match.resultSummary}</small>
        </div>
      </article>
    </div>
  )
}

function RoundColumn({
  cardRefs,
  context,
  round,
  totalSlots
}: {
  cardRefs: CardRefMap
  context: DisplayContext
  round: TournamentRound
  totalSlots: number
}) {
  const rowCount = Math.max(bracketCardRowSpan, Math.max(totalSlots, 1) * bracketRowsPerSlot)
  const trackStyle = { '--bracket-rows': rowCount } as CSSProperties

  return (
    <div className="bracket-round-column" data-champion={round.isChampion}>
      <div className="bracket-round-heading">
        <span>{round.label}</span>
        <strong>
          {round.isChampion
            ? '1 winner'
            : `${round.matches.length} match${round.matches.length === 1 ? '' : 'es'}`}
        </strong>
      </div>
      <div className="bracket-round-track" style={trackStyle}>
        {round.matches.map((match) => {
          const cardStyle = matchCardGridStyle(match.matchIndex, round.matches.length, totalSlots)

          return match.isChampion ? (
            <ChampionCard cardRefs={cardRefs} context={context} key={match.id} match={match} style={cardStyle} />
          ) : (
            <MatchCard cardRefs={cardRefs} context={context} key={match.id} match={match} style={cardStyle} />
          )
        })}
      </div>
    </div>
  )
}

function BracketConnectorLayer({
  cardRefs,
  connectors,
  containerRef,
  refreshKey
}: {
  cardRefs: CardRefMap
  connectors: BracketConnector[]
  containerRef: RefObject<HTMLDivElement | null>
  refreshKey: string
}) {
  const [paths, setPaths] = useState<{ height: number; paths: ConnectorPath[]; width: number }>({
    height: 0,
    paths: [],
    width: 0
  })

  useEffect(() => {
    let animationFrameId = 0

    const measure = () => {
      animationFrameId = 0
      const container = containerRef.current

      if (!container) {
        setPaths({ height: 0, paths: [], width: 0 })
        return
      }

      const containerBounds = container.getBoundingClientRect()
      const nextPaths: ConnectorPath[] = []

      for (const connector of connectors) {
        const fromElement = cardRefs.current.get(connector.fromId)
        const toElement = cardRefs.current.get(connector.toId)

        if (!fromElement || !toElement) {
          continue
        }

        const fromBounds = fromElement.getBoundingClientRect()
        const toBounds = toElement.getBoundingClientRect()
        const startX = fromBounds.right - containerBounds.left
        const startY = fromBounds.top - containerBounds.top + fromBounds.height / 2
        const endX = toBounds.left - containerBounds.left
        const endY = toBounds.top - containerBounds.top + toBounds.height / 2
        const distance = Math.max(32, Math.abs(endX - startX))
        const direction = endX >= startX ? 1 : -1
        const midX = startX + direction * Math.max(32, distance / 2)
        const d = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`

        nextPaths.push({
          id: connector.id,
          d,
          variant: connector.variant,
          label: connector.label,
          labelX: midX,
          labelY: startY + (endY - startY) / 2 - 8
        })
      }

      setPaths({
        height: Math.max(container.scrollHeight, containerBounds.height),
        paths: nextPaths,
        width: Math.max(container.scrollWidth, containerBounds.width)
      })
    }

    const scheduleMeasure = () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      animationFrameId = window.requestAnimationFrame(measure)
    }

    const resizeObserver = new ResizeObserver(scheduleMeasure)
    const container = containerRef.current

    if (container) {
      resizeObserver.observe(container)
    }

    for (const connector of connectors) {
      const fromElement = cardRefs.current.get(connector.fromId)
      const toElement = cardRefs.current.get(connector.toId)

      if (fromElement) {
        resizeObserver.observe(fromElement)
      }

      if (toElement) {
        resizeObserver.observe(toElement)
      }
    }

    window.addEventListener('resize', scheduleMeasure)
    scheduleMeasure()

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [cardRefs, connectors, containerRef, refreshKey])

  if (paths.paths.length === 0 || paths.width === 0 || paths.height === 0) {
    return null
  }

  return (
    <svg
      aria-hidden="true"
      className="bracket-connector-layer"
      height={paths.height}
      viewBox={`0 0 ${paths.width} ${paths.height}`}
      width={paths.width}
    >
      <defs>
        <marker id="bracket-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
          <path d="M 0 0 L 8 4 L 0 8 z" />
        </marker>
      </defs>
      {paths.paths.map((path) => (
        <g data-variant={path.variant} key={path.id}>
          <path d={path.d} markerEnd="url(#bracket-arrow)" />
          {path.label ? (
            <text x={path.labelX} y={path.labelY}>
              {path.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  )
}

function BracketSectionView({
  cardRefs,
  context,
  section
}: {
  cardRefs: CardRefMap
  context: DisplayContext
  section: BracketSection
}) {
  const totalSlots = Math.max(...section.columns.map((round) => round.matches.length), 1)

  return (
    <section className="bracket-section" data-kind={section.kind}>
      <div className="bracket-section-heading">
        <div>
          <span>{section.title}</span>
          {section.subtitle ? <strong>{section.subtitle}</strong> : null}
        </div>
        {section.kind === 'grand-final' || section.kind === 'single' ? <Trophy aria-hidden="true" size={22} /> : null}
      </div>
      <div className="bracket-column-grid">
        {section.columns.map((round) => (
          <RoundColumn cardRefs={cardRefs} context={context} key={round.id} round={round} totalSlots={totalSlots} />
        ))}
      </div>
    </section>
  )
}

function BracketCanvas({
  context,
  layout,
  refreshKey,
  sections
}: {
  context: DisplayContext
  layout: 'single' | 'double' | 'triple'
  refreshKey: string
  sections: BracketSection[]
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const connectors = sections.flatMap((section) => section.connectors)

  return (
    <div className="bracket-scroll">
      <div className="bracket-canvas" data-layout={layout} ref={canvasRef}>
        <BracketConnectorLayer
          cardRefs={cardRefs}
          connectors={connectors}
          containerRef={canvasRef}
          refreshKey={refreshKey}
        />
        {sections.map((section) => (
          <BracketSectionView cardRefs={cardRefs} context={context} key={section.id} section={section} />
        ))}
      </div>
    </div>
  )
}

function BracketLegend() {
  return (
    <div className="bracket-legend" aria-label="Bracket legend">
      <span data-legend="current">Current Match</span>
      <span data-legend="pending">Pending</span>
      <span data-legend="complete">Complete</span>
      <span data-legend="bye">Bye</span>
    </div>
  )
}

function BracketDisplay({
  activePage,
  children,
  context,
  isPagePinned,
  locationLabel,
  pages,
  setIsPagePinned,
  setSelectedPageId
}: {
  activePage: BracketPage
  children: ReactNode
  context: DisplayContext
  isPagePinned: boolean
  locationLabel: string
  pages: BracketPage[]
  setIsPagePinned: (isPinned: boolean) => void
  setSelectedPageId: (pageId: string) => void
}) {
  return (
    <div className="elimination-display" data-page-mode={activePage.mode}>
      <BracketStatusBar
        activePage={activePage}
        context={context}
        isPagePinned={isPagePinned}
        locationLabel={locationLabel}
        pages={pages}
        setIsPagePinned={setIsPagePinned}
        setSelectedPageId={setSelectedPageId}
      />
      <div className="bracket-stage">{children}</div>
      <BracketLegend />
    </div>
  )
}

function BracketStatusBar({
  activePage,
  context,
  isPagePinned,
  locationLabel,
  pages,
  setIsPagePinned,
  setSelectedPageId
}: {
  activePage: BracketPage
  context: DisplayContext
  isPagePinned: boolean
  locationLabel: string
  pages: BracketPage[]
  setIsPagePinned: (isPinned: boolean) => void
  setSelectedPageId: (pageId: string) => void
}) {
  const currentLabel = context.raceFinished ? 'Final Result' : currentMatchDisplayCode(context)
  const PinIcon = isPagePinned ? PinOff : Pin

  return (
    <section className="bracket-status-bar" aria-label="Bracket display controls">
      <div className="bracket-status-primary">
        <span>{context.raceFinished ? 'Bracket Complete' : 'Current Match'}</span>
        <strong>{currentLabel}</strong>
        <small>{heatParticipantSummary(context, context.currentHeat)}</small>
        <small>{currentBracketDetail(context, activePage, locationLabel)}</small>
      </div>

      <label className="bracket-page-selector">
        <span>Page</span>
        <select value={activePage.id} onChange={(inputEvent) => setSelectedPageId(inputEvent.target.value)}>
          {pages.map((page) => (
            <option key={page.id} value={page.id}>
              {page.label}
            </option>
          ))}
        </select>
      </label>

      <button
        aria-label={isPagePinned ? 'Resume following current match' : 'Pin selected bracket page'}
        aria-pressed={isPagePinned}
        className="bracket-pin-button"
        data-active={isPagePinned}
        onClick={() => setIsPagePinned(!isPagePinned)}
        type="button"
      >
        <PinIcon aria-hidden="true" size={18} />
        <span>{isPagePinned ? 'Pinned' : 'Follow'}</span>
      </button>
    </section>
  )
}

function visibleRoundsForPage(rounds: TournamentRound[], activePage: BracketPage): TournamentRound[] {
  return activePage.roundIds ? rounds.filter((round) => activePage.roundIds?.includes(round.id)) : rounds
}

function allRoundMatches(rounds: TournamentRound[]): TournamentMatch[] {
  return rounds.flatMap((round) => round.matches)
}

function filterConnectorsToVisibleMatches(connectors: BracketConnector[], rounds: TournamentRound[]): BracketConnector[] {
  const visibleMatchIds = new Set(allRoundMatches(rounds).map((match) => match.id))

  return connectors.filter((connector) => visibleMatchIds.has(connector.fromId) && visibleMatchIds.has(connector.toId))
}

function buildSingleEliminationConnectors(rounds: TournamentRound[]): BracketConnector[] {
  const connectors: BracketConnector[] = []

  rounds.forEach((round, roundIndex) => {
    const nextRound = rounds[roundIndex + 1]

    if (!nextRound) {
      return
    }

    round.matches.forEach((match) => {
      const targetMatch =
        nextRound.matches.find((candidate) => candidate.sourceMatchNumbers.includes(match.matchNumber)) ??
        nextRound.matches[Math.min(nextRound.matches.length - 1, Math.floor(match.matchIndex / 2))]

      if (!targetMatch) {
        return
      }

      connectors.push({
        id: `single:${match.id}:${targetMatch.id}`,
        fromId: match.id,
        toId: targetMatch.id,
        variant: 'winner'
      })
    })
  })

  return connectors
}

function buildSingleEliminationSections(rounds: TournamentRound[], activePage: BracketPage): BracketSection[] {
  const visibleRounds = visibleRoundsForPage(rounds, activePage)

  return [
    {
      id: 'single-winners',
      title: 'Winners Bracket',
      subtitle: activePage.mode === 'full' ? 'Full tournament path' : activePage.label,
      kind: 'single',
      columns: visibleRounds,
      connectors: filterConnectorsToVisibleMatches(buildSingleEliminationConnectors(rounds), visibleRounds)
    }
  ]
}

function buildRacerLossCounts(context: DisplayContext): Map<string, number> {
  const lossesByRacerId = new Map<string, number>()

  for (const standing of context.standings) {
    lossesByRacerId.set(standing.racerId, standing.losses ?? 0)
  }

  for (const entry of context.race.entries) {
    if (!lossesByRacerId.has(entry.racerId)) {
      lossesByRacerId.set(entry.racerId, 0)
    }
  }

  return lossesByRacerId
}

function buildLossSourceHeatByRacerId(race: Race): Map<string, Heat> {
  const sourceHeatByRacerId = new Map<string, Heat>()

  for (const heat of race.heats.filter((candidate) => candidate.status === 'complete')) {
    const winnerId = heatWinnerId(heat)

    for (const result of heat.results) {
      if (result.excludedFromScoring || result.racerId === winnerId) {
        continue
      }

      sourceHeatByRacerId.set(result.racerId, heat)
    }
  }

  return sourceHeatByRacerId
}

function heatCodeFromMap(heat: Heat | undefined, heatCodeById: Map<string, string>): string {
  if (!heat) {
    return 'M?'
  }

  return heatCodeById.get(heat.id) ?? `M${heat.heatNumber}`
}

function codedMatchFromHeat(
  context: DisplayContext,
  heat: Heat,
  matchIndex: number,
  displayCode: string,
  details: (participant: TournamentParticipant) => Partial<TournamentParticipant> = () => ({})
): TournamentMatch {
  return {
    ...withParticipantDetails(matchFromHeat(context, heat, matchIndex), details),
    displayCode
  }
}

function groupMatchesByRound(idPrefix: string, labelPrefix: string, matches: TournamentMatch[]): TournamentRound[] {
  const roundNumbers = [...new Set(matches.map((match) => match.roundNumber))].sort((first, second) => first - second)

  return roundNumbers.map((roundNumber, roundIndex) => {
    const roundMatches = matches
      .filter((match) => match.roundNumber === roundNumber)
      .sort((first, second) => first.matchNumber - second.matchNumber)
      .map((match, matchIndex) => ({ ...match, matchIndex }))

    return {
      id: `${idPrefix}-round-${roundNumber}`,
      roundNumber,
      label: `${labelPrefix} ${roundIndex + 1}`,
      matches: roundMatches,
      isChampion: false
    }
  })
}

function buildRoundProgressionConnectors(
  idPrefix: string,
  rounds: TournamentRound[],
  variant: BracketConnectorVariant = 'winner'
): BracketConnector[] {
  const connectors: BracketConnector[] = []

  rounds.forEach((round, roundIndex) => {
    const nextRound = rounds[roundIndex + 1]

    if (!nextRound || nextRound.matches.length === 0) {
      return
    }

    round.matches.forEach((match) => {
      const targetMatch = nextRound.matches[Math.min(nextRound.matches.length - 1, Math.floor(match.matchIndex / 2))]

      if (!targetMatch) {
        return
      }

      connectors.push({
        id: `${idPrefix}:${match.id}:${targetMatch.id}`,
        fromId: match.id,
        toId: targetMatch.id,
        variant
      })
    })
  })

  return connectors
}

function finalRoundFromMatches(idPrefix: string, label: string, matches: TournamentMatch[]): TournamentRound {
  return {
    id: `${idPrefix}-round`,
    roundNumber: Math.max(1, ...matches.map((match) => match.roundNumber)),
    label,
    matches: matches.map((match, matchIndex) => ({ ...match, matchIndex })),
    isChampion: false
  }
}

function resetFinalMatch(context: DisplayContext, finalMatch: TournamentMatch | undefined): TournamentMatch {
  return {
    id: 'double-reset-final',
    displayCode: 'GF2',
    supportingLabel: 'If necessary',
    matchNumber: (finalMatch?.matchNumber ?? 0) + 1,
    roundNumber: (finalMatch?.roundNumber ?? 0) + 1,
    matchIndex: 1,
    participants: [
      { racerId: null, placeholder: 'If Necessary', sourceLabel: 'Bracket reset' },
      { racerId: null, placeholder: 'If Necessary', sourceLabel: 'First final loser' }
    ],
    sourceMatchNumbers: finalMatch ? [finalMatch.matchNumber] : [],
    status: 'pending',
    resultSummary: 'First to 1 win',
    isCurrent: false,
    isChampion: false,
    isReset: true,
    winnerId: undefined,
    heat: undefined
  }
}

function buildDoubleEliminationModel(context: DisplayContext): { pages: BracketPage[]; sections: BracketSection[] } {
  const winnersHeats = context.race.heats
    .filter(
      (heat) =>
        (heat.eliminationBracket?.lossCount ?? 0) === 0 &&
        !heat.eliminationBracket?.isFinal &&
        !heat.eliminationBracket?.isCrossLoss
    )
    .sort((first, second) => first.roundNumber - second.roundNumber || first.heatNumber - second.heatNumber)
  const losersHeats = context.race.heats
    .filter(
      (heat) =>
        !heat.eliminationBracket?.isFinal &&
        ((heat.eliminationBracket?.lossCount ?? 0) > 0 || heat.eliminationBracket?.isCrossLoss)
    )
    .sort((first, second) => first.roundNumber - second.roundNumber || first.heatNumber - second.heatNumber)
  const finalHeats = context.race.heats
    .filter((heat) => heat.eliminationBracket?.isFinal)
    .sort((first, second) => first.roundNumber - second.roundNumber || first.heatNumber - second.heatNumber)
  const heatCodeById = new Map<string, string>()

  winnersHeats.forEach((heat, index) => heatCodeById.set(heat.id, `W${index + 1}`))
  losersHeats.forEach((heat, index) => heatCodeById.set(heat.id, `L${index + 1}`))
  finalHeats.forEach((heat, index) => heatCodeById.set(heat.id, `GF${index + 1}`))

  const lossesByRacerId = buildRacerLossCounts(context)
  const lossSourceHeatByRacerId = buildLossSourceHeatByRacerId(context.race)
  const participantLossDetails = (participant: TournamentParticipant): Partial<TournamentParticipant> => ({
    lossCount: participant.racerId ? lossesByRacerId.get(participant.racerId) ?? 0 : participant.lossCount
  })
  const loserParticipantDetails = (participant: TournamentParticipant): Partial<TournamentParticipant> => {
    if (!participant.racerId) {
      return { lossCount: 1 }
    }

    const sourceHeat = lossSourceHeatByRacerId.get(participant.racerId)

    return {
      lossCount: lossesByRacerId.get(participant.racerId) ?? 1,
      sourceLabel: `Loser of ${heatCodeFromMap(sourceHeat, heatCodeById)}`
    }
  }
  const finalParticipantDetails = (participant: TournamentParticipant): Partial<TournamentParticipant> => {
    const lossCount = participant.racerId ? lossesByRacerId.get(participant.racerId) ?? 0 : participant.lossCount

    return {
      lossCount,
      sourceLabel: lossCount === 0 ? 'Winners Bracket' : 'Losers Bracket'
    }
  }
  const winnerMatches = winnersHeats.map((heat, matchIndex) =>
    codedMatchFromHeat(context, heat, matchIndex, heatCodeFromMap(heat, heatCodeById), participantLossDetails)
  )
  const loserMatches = losersHeats.map((heat, matchIndex) =>
    codedMatchFromHeat(context, heat, matchIndex, heatCodeFromMap(heat, heatCodeById), loserParticipantDetails)
  )
  const finalMatches = finalHeats.map((heat, matchIndex) =>
    codedMatchFromHeat(context, heat, matchIndex, heatCodeFromMap(heat, heatCodeById), finalParticipantDetails)
  )
  const resetMatch = resetFinalMatch(context, finalMatches[0])
  const winnersRounds = groupMatchesByRound('double-winners', 'Round', winnerMatches)
  const losersRounds = groupMatchesByRound('double-losers', 'Round', loserMatches)
  const grandFinalRounds = [
    finalRoundFromMatches('double-grand-final', 'Grand Final', finalMatches.length > 0 ? [finalMatches[0]] : []),
    finalRoundFromMatches('double-reset-final', 'Bracket Reset', [finalMatches[1] ?? resetMatch])
  ].filter((round) => round.matches.length > 0)
  const winnersConnectors = buildRoundProgressionConnectors('double-winners', winnersRounds, 'winner')
  const losersConnectors = buildRoundProgressionConnectors('double-losers', losersRounds, 'progression')
  const dropConnectors: BracketConnector[] = []

  winnerMatches.forEach((winnerMatch) => {
    const targetMatch = loserMatches.find((loserMatch) =>
      loserMatch.participants.some((participant) => participant.sourceLabel === `Loser of ${winnerMatch.displayCode}`)
    )

    if (!targetMatch) {
      return
    }

    dropConnectors.push({
      id: `drop:${winnerMatch.id}:${targetMatch.id}`,
      fromId: winnerMatch.id,
      toId: targetMatch.id,
      variant: 'drop',
      label: `Loser of ${winnerMatch.displayCode}`
    })
  })

  const lastWinnerMatch = winnerMatches[winnerMatches.length - 1]
  const lastLoserMatch = loserMatches[loserMatches.length - 1]
  const firstFinalMatch = finalMatches[0]
  const finalConnectors: BracketConnector[] = []
  const grandFinalConnectors: BracketConnector[] = []

  if (lastWinnerMatch && firstFinalMatch) {
    finalConnectors.push({
      id: `final-winner:${lastWinnerMatch.id}:${firstFinalMatch.id}`,
      fromId: lastWinnerMatch.id,
      toId: firstFinalMatch.id,
      variant: 'winner',
      label: `Winner of ${lastWinnerMatch.displayCode}`
    })
  }

  if (lastLoserMatch && firstFinalMatch) {
    finalConnectors.push({
      id: `final-loser:${lastLoserMatch.id}:${firstFinalMatch.id}`,
      fromId: lastLoserMatch.id,
      toId: firstFinalMatch.id,
      variant: 'winner',
      label: `Winner of ${lastLoserMatch.displayCode}`
    })
  }

  if (firstFinalMatch) {
    grandFinalConnectors.push({
      id: `final-reset:${firstFinalMatch.id}:${(finalMatches[1] ?? resetMatch).id}`,
      fromId: firstFinalMatch.id,
      toId: (finalMatches[1] ?? resetMatch).id,
      variant: 'drop',
      label: 'Reset if necessary'
    })
  }

  return {
    pages: [
      { id: fullBracketPageId, label: 'Double Elimination', mode: 'full' },
      { id: 'winners', label: 'Winners Bracket', mode: 'section', sectionIds: ['double-winners'] },
      { id: 'losers', label: 'Losers Bracket', mode: 'section', sectionIds: ['double-losers'] },
      { id: 'grand-final', label: 'Grand Final', mode: 'section', sectionIds: ['double-grand-final'] }
    ],
    sections: [
      {
        id: 'double-winners',
        title: 'Winners Bracket',
        subtitle: `${winnerMatches.length} match${winnerMatches.length === 1 ? '' : 'es'}`,
        kind: 'winners',
        columns: winnersRounds,
        connectors: [...winnersConnectors, ...dropConnectors, ...finalConnectors]
      },
      {
        id: 'double-losers',
        title: 'Losers Bracket',
        subtitle: `${loserMatches.length} match${loserMatches.length === 1 ? '' : 'es'}`,
        kind: 'losers',
        columns: losersRounds,
        connectors: losersConnectors
      },
      {
        id: 'double-grand-final',
        title: 'Grand Final',
        subtitle: 'Final destination',
        kind: 'grand-final',
        columns: grandFinalRounds,
        connectors: grandFinalConnectors
      }
    ]
  }
}

function activeDoublePageId(context: DisplayContext): string {
  const currentHeat = context.currentHeat

  if (context.raceFinished) {
    return 'grand-final'
  }

  if (!currentHeat) {
    return fullBracketPageId
  }

  if (currentHeat.eliminationBracket?.isFinal) {
    return 'grand-final'
  }

  if ((currentHeat.eliminationBracket?.lossCount ?? 0) > 0 || currentHeat.eliminationBracket?.isCrossLoss) {
    return 'losers'
  }

  return 'winners'
}

function buildTripleEliminationStatusGroups(context: DisplayContext): BracketStatusGroup[] {
  const lossLimit = eliminationLossLimit(context.race.format)
  const lossesByRacerId = buildRacerLossCounts(context)
  const activeEntryIds = new Set(context.race.entries.filter((entry) => entry.status === 'active').map((entry) => entry.racerId))
  const groups: BracketStatusGroup[] = []

  for (let lossCount = 0; lossCount < lossLimit; lossCount += 1) {
    groups.push({
      id: `loss-${lossCount}`,
      label: lossCount === 1 ? '1 Loss' : `${lossCount} Losses`,
      racerIds: [...activeEntryIds].filter((racerId) => (lossesByRacerId.get(racerId) ?? 0) === lossCount),
      eliminated: false
    })
  }

  groups.push({
    id: 'eliminated',
    label: 'Eliminated',
    racerIds: [...activeEntryIds].filter((racerId) => (lossesByRacerId.get(racerId) ?? 0) >= lossLimit),
    eliminated: true
  })

  return groups
}

function TripleEliminationStatusPanel({ context }: { context: DisplayContext }) {
  const groups = buildTripleEliminationStatusGroups(context)

  return (
    <aside className="elimination-status-panel">
      <div className="bracket-section-heading">
        <div>
          <span>Status</span>
          <strong>Racers by loss count</strong>
        </div>
      </div>
      <div className="elimination-status-grid">
        {groups.map((group) => (
          <section className="elimination-status-group" data-eliminated={group.eliminated} key={group.id}>
            <span>{group.label}</span>
            <strong>{group.racerIds.length}</strong>
            <ol>
              {group.racerIds.slice(0, 8).map((racerId) => (
                <li key={racerId}>{racerLabel(context.event.racers, racerId)}</li>
              ))}
            </ol>
            {group.racerIds.length > 8 ? <small>+{group.racerIds.length - 8} more</small> : null}
          </section>
        ))}
      </div>
    </aside>
  )
}

function buildTripleEliminationModel(context: DisplayContext): { pages: BracketPage[]; sections: BracketSection[] } {
  const lossesByRacerId = buildRacerLossCounts(context)
  const sections: BracketSection[] = []

  for (let lossCount = 0; lossCount < 3; lossCount += 1) {
    const laneHeats = context.race.heats
      .filter((heat) => (heat.eliminationBracket?.lossCount ?? 0) === lossCount)
      .sort((first, second) => first.roundNumber - second.roundNumber || first.heatNumber - second.heatNumber)
    const laneMatches = laneHeats.map((heat, matchIndex) =>
      codedMatchFromHeat(context, heat, matchIndex, `M${heat.heatNumber}`, (participant) => ({
        lossCount: participant.racerId ? lossesByRacerId.get(participant.racerId) ?? lossCount : lossCount
      }))
    )
    const laneRounds = groupMatchesByRound(
      `triple-loss-${lossCount}`,
      'Round',
      laneMatches
    )

    sections.push({
      id: `triple-loss-${lossCount}`,
      title: lossCount === 1 ? '1-Loss Lane' : `${lossCount}-Loss Lane`,
      subtitle: `${laneMatches.length} match${laneMatches.length === 1 ? '' : 'es'}`,
      kind: 'loss-lane',
      columns: laneRounds,
      connectors: buildRoundProgressionConnectors(`triple-loss-${lossCount}`, laneRounds, 'progression')
    })
  }

  return {
    pages: [
      { id: fullBracketPageId, label: 'Triple Elimination', mode: 'full' },
      { id: 'loss-0', label: '0-Loss Lane', mode: 'section', sectionIds: ['triple-loss-0'] },
      { id: 'loss-1', label: '1-Loss Lane', mode: 'section', sectionIds: ['triple-loss-1'] },
      { id: 'loss-2', label: '2-Loss Lane', mode: 'section', sectionIds: ['triple-loss-2'] },
      { id: 'status', label: 'Status Panel', mode: 'status' }
    ],
    sections
  }
}

function activeTriplePageId(context: DisplayContext): string {
  const currentHeat = context.currentHeat

  if (!currentHeat) {
    return fullBracketPageId
  }

  return `loss-${Math.min(currentHeat.eliminationBracket?.lossCount ?? 0, 2)}`
}

function SingleEliminationDisplay({ context }: { context: DisplayContext }) {
  const [selectedPageId, setSelectedPageId] = useState(fullBracketPageId)
  const [isPagePinned, setIsPagePinned] = useState(false)
  const rounds = buildTournamentRounds(context)
  const currentRound = context.currentHeat
    ? rounds.find((round) => round.roundNumber === context.currentHeat?.roundNumber)
    : undefined
  const pages = buildSingleEliminationPages(rounds)
  const autoPageId = autoSingleEliminationPageId(context, pages, rounds)
  const activePage = selectedBracketPage(pages, selectedPageId)
  const locationLabel = context.raceFinished ? 'Champion' : currentRound?.label ?? 'Current Match'
  const sections = buildSingleEliminationSections(rounds, activePage)

  useEffect(() => {
    setIsPagePinned(false)
    setSelectedPageId(fullBracketPageId)
  }, [context.race.id])

  useEffect(() => {
    if (!isPagePinned) {
      setSelectedPageId(autoPageId)
    }
  }, [autoPageId, context.currentHeat?.id, context.raceFinished, isPagePinned])

  return (
    <BracketDisplay
      activePage={activePage}
      context={context}
      isPagePinned={isPagePinned}
      locationLabel={locationLabel}
      pages={pages}
      setIsPagePinned={setIsPagePinned}
      setSelectedPageId={setSelectedPageId}
    >
      <BracketCanvas
        context={context}
        layout="single"
        refreshKey={`${context.race.id}:${context.race.updatedAt}:${activePage.id}:${context.currentHeat?.id ?? ''}`}
        sections={sections}
      />
    </BracketDisplay>
  )
}

function DoubleEliminationBracketDisplay({ context }: { context: DisplayContext }) {
  const [selectedPageId, setSelectedPageId] = useState(fullBracketPageId)
  const [isPagePinned, setIsPagePinned] = useState(false)
  const model = buildDoubleEliminationModel(context)
  const pages = model.pages
  const autoPageId = activeDoublePageId(context)
  const activePage = selectedBracketPage(pages, selectedPageId)
  const locationLabel = context.raceFinished ? 'Grand Final' : activePage.label
  const sections = activePage.sectionIds
    ? model.sections.filter((section) => activePage.sectionIds?.includes(section.id))
    : model.sections

  useEffect(() => {
    setIsPagePinned(false)
    setSelectedPageId(fullBracketPageId)
  }, [context.race.id])

  useEffect(() => {
    if (!isPagePinned) {
      setSelectedPageId(autoPageId)
    }
  }, [autoPageId, context.currentHeat?.id, context.raceFinished, isPagePinned])

  return (
    <BracketDisplay
      activePage={activePage}
      context={context}
      isPagePinned={isPagePinned}
      locationLabel={locationLabel}
      pages={pages}
      setIsPagePinned={setIsPagePinned}
      setSelectedPageId={setSelectedPageId}
    >
      <BracketCanvas
        context={context}
        layout="double"
        refreshKey={`${context.race.id}:${context.race.updatedAt}:${activePage.id}:${context.currentHeat?.id ?? ''}`}
        sections={sections}
      />
    </BracketDisplay>
  )
}

function TripleEliminationBracketDisplay({ context }: { context: DisplayContext }) {
  const [selectedPageId, setSelectedPageId] = useState(fullBracketPageId)
  const [isPagePinned, setIsPagePinned] = useState(false)
  const model = buildTripleEliminationModel(context)
  const pages = model.pages
  const autoPageId = activeTriplePageId(context)
  const activePage = selectedBracketPage(pages, selectedPageId)
  const sections = activePage.sectionIds
    ? model.sections.filter((section) => activePage.sectionIds?.includes(section.id))
    : model.sections
  const locationLabel = activePage.mode === 'status' ? 'Status Panel' : activePage.label

  useEffect(() => {
    setIsPagePinned(false)
    setSelectedPageId(fullBracketPageId)
  }, [context.race.id])

  useEffect(() => {
    if (!isPagePinned) {
      setSelectedPageId(autoPageId)
    }
  }, [autoPageId, context.currentHeat?.id, context.raceFinished, isPagePinned])

  return (
    <BracketDisplay
      activePage={activePage}
      context={context}
      isPagePinned={isPagePinned}
      locationLabel={locationLabel}
      pages={pages}
      setIsPagePinned={setIsPagePinned}
      setSelectedPageId={setSelectedPageId}
    >
      {activePage.mode === 'status' ? (
        <TripleEliminationStatusPanel context={context} />
      ) : (
        <div className="triple-bracket-layout">
          <BracketCanvas
            context={context}
            layout="triple"
            refreshKey={`${context.race.id}:${context.race.updatedAt}:${activePage.id}:${context.currentHeat?.id ?? ''}`}
            sections={sections}
          />
          <TripleEliminationStatusPanel context={context} />
        </div>
      )}
    </BracketDisplay>
  )
}

function EliminationRecordsDisplay({ context }: { context: DisplayContext }) {
  return <div className="elimination-display">{renderEliminationRecords(context)}</div>
}

function RaceSpecificDisplay({ context, viewId }: { context: DisplayContext; viewId: DisplayViewId }) {
  switch (context.race.format) {
    case 'single-elimination':
      return viewId === 'current' ? <EliminationCurrentDisplay context={context} /> : <SingleEliminationDisplay context={context} />
    case 'double-elimination':
    case 'triple-elimination':
      if (viewId === 'records') {
        return <EliminationRecordsDisplay context={context} />
      }

      if (viewId === 'current') {
        return <EliminationCurrentDisplay context={context} />
      }

      return context.race.format === 'double-elimination' ? (
        <DoubleEliminationBracketDisplay context={context} />
      ) : (
        <TripleEliminationBracketDisplay context={context} />
      )
    case 'round-robin':
      if (viewId === 'records') {
        return <RoundRobinRecordsDisplay context={context} />
      }

      if (viewId === 'schedule') {
        return <RoundRobinScheduleDisplay context={context} />
      }

      return <RoundRobinDisplay context={context} />
    case 'points-heats':
      return viewId === 'standings' ? (
        <StandingsDisplay context={context} label="Points Standings" />
      ) : (
        <HeatDisplay context={context} label="Current Heat" />
      )
    case 'timed-heats':
    default:
      return viewId === 'standings' ? (
        <StandingsDisplay context={context} label="Standings" />
      ) : (
        <HeatDisplay context={context} label="Current Heat" />
      )
  }
}

export function DisplayMode({ event, currentRace, selectedRaceId, setSelectedRaceId }: SectionProps) {
  const [displayViewId, setDisplayViewId] = useState<DisplayViewId>('current')
  const pendingHeat = currentRace?.heats.find((heat) => heat.status === 'pending')
  const currentHeat = currentRace?.heats.find((heat) => heat.id === currentRace.currentHeatId) ?? pendingHeat
  const raceFinished = Boolean(
    currentRace &&
      currentRace.heats.length > 0 &&
      !currentRace.heats.some(isUnfinishedHeat) &&
      !currentHeat
  )
  const standings = useMemo(
    () => (event && currentRace ? calculateStandings(event, currentRace.id) : []),
    [event, currentRace]
  )
  const disabledLaneNumbers = useMemo(
    () => new Set(currentRace?.disabledLaneNumbers ?? []),
    [currentRace?.disabledLaneNumbers]
  )
  const displayViews = useMemo(() => (currentRace ? displayViewsForRace(currentRace) : []), [currentRace?.format])

  useEffect(() => {
    setDisplayViewId(displayViews[0]?.id ?? 'current')
  }, [currentRace?.id, currentRace?.format, displayViews])

  const activeDisplayViewId = displayViews.some((view) => view.id === displayViewId)
    ? displayViewId
    : displayViews[0]?.id ?? 'current'

  if (!event) {
    return <p className="empty-state full-width-message">Create an event to use display mode.</p>
  }

  if (!currentRace) {
    return <p className="empty-state full-width-message">Add a race to use display mode.</p>
  }

  const context: DisplayContext = {
    event,
    race: currentRace,
    currentHeat,
    raceFinished,
    standings,
    disabledLaneNumbers
  }

  return (
    <section className="display-board" data-format={currentRace.format}>
      <div className="display-heading">
        <div>
          <p className="eyebrow">Display Mode</p>
          <h3>{event.name}</h3>
          <span>{currentRace.name}</span>
        </div>
        <label className="display-race-selector">
          <span>Race</span>
          <select value={selectedRaceId} onChange={(inputEvent) => setSelectedRaceId(inputEvent.target.value)}>
            {event.races.map((race) => (
              <option key={race.id} value={race.id}>
                {race.name}
              </option>
            ))}
          </select>
        </label>
        {displayViews.length > 1 ? (
          <div className="display-view-selector" role="group" aria-label="Display visualization">
            {displayViews.map((view) => (
              <button
                data-active={view.id === activeDisplayViewId}
                key={view.id}
                onClick={() => setDisplayViewId(view.id)}
                type="button"
              >
                {view.label}
              </button>
            ))}
          </div>
        ) : null}
        <Monitor aria-hidden="true" size={30} />
      </div>

      <RaceSpecificDisplay context={context} viewId={activeDisplayViewId} />
    </section>
  )
}
