import { Monitor } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

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
}

type TournamentMatch = {
  id: string
  heat?: Heat
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
}

type TournamentRound = {
  id: string
  roundNumber: number
  label: string
  matches: TournamentMatch[]
  isChampion: boolean
}

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

function nextPowerOfTwo(value: number): number {
  let size = 1

  while (size < value) {
    size *= 2
  }

  return size
}

function tournamentBracketSize(race: Race): number {
  const firstRoundHeats = race.heats.filter((heat) => heat.roundNumber === 1)
  const maxSeed = Math.max(
    ...firstRoundHeats.flatMap((heat) => heat.laneAssignments.map((assignment) => assignment.seed ?? 0)),
    0
  )
  const activeEntries = race.entries.filter((entry) => entry.status === 'active').length
  const seededSlots = Math.max(maxSeed, firstRoundHeats.length * 2, activeEntries, 2)
  const bracketSize = nextPowerOfTwo(seededSlots)

  if (bracketSize <= 4) {
    return 4
  }

  if (bracketSize <= 8) {
    return 8
  }

  if (bracketSize <= 16) {
    return 16
  }

  return 32
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

function participantLabel(
  heat: Heat | undefined,
  sourceMatches: TournamentMatch[],
  participantIndex: number
): string {
  const sourceHeatId = heat?.sourceHeatIds?.[participantIndex]
  const sourceMatch = sourceHeatId
    ? sourceMatches.find((match) => match.heat?.id === sourceHeatId)
    : sourceMatches[participantIndex]

  if (sourceMatch) {
    return `Winner of Match ${sourceMatch.matchNumber}`
  }

  return heat ? 'Bye' : 'TBD'
}

function heatParticipants(heat: Heat | undefined, sourceMatches: TournamentMatch[]): TournamentParticipant[] {
  const assignments = heat?.laneAssignments.filter((assignment) => assignment.racerId || assignment.seed).slice(0, 2) ?? []

  if (assignments.length > 0) {
    return assignments.map((assignment, index) => ({
      racerId: assignment.racerId,
      seed: assignment.seed,
      placeholder: assignment.racerId ? '' : participantLabel(heat, sourceMatches, index),
      sourceMatchNumber: sourceMatches[index]?.matchNumber
    }))
  }

  const participants: TournamentParticipant[] = sourceMatches.slice(0, 2).map((match) => ({
    racerId: null,
    placeholder: `Winner of Match ${match.matchNumber}`,
    sourceMatchNumber: match.matchNumber
  }))

  while (participants.length < 2) {
    participants.push({ racerId: null, placeholder: heat ? 'Bye' : 'TBD' })
  }

  return participants
}

function buildTournamentRounds(context: DisplayContext): TournamentRound[] {
  const bracketSize = tournamentBracketSize(context.race)
  const bracketRoundCount = Math.max(1, Math.log2(bracketSize))
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
    const matchCount = Math.max(1, bracketSize / 2 ** (roundIndex + 1))
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

function TournamentParticipantRow({
  context,
  participant,
  winnerId,
  isChampion
}: {
  context: DisplayContext
  participant: TournamentParticipant
  winnerId?: string
  isChampion: boolean
}) {
  const isWinner = Boolean(participant.racerId && participant.racerId === winnerId)
  const seedLabel = participant.seed
    ? `Seed ${participant.seed}`
    : participant.sourceMatchNumber
      ? `From Match ${participant.sourceMatchNumber}`
      : isChampion
        ? 'Champion'
        : 'Entry'

  return (
    <div className="tournament-participant" data-empty={!participant.racerId} data-winner={isWinner}>
      <span>{seedLabel}</span>
      <strong>{participant.racerId ? racerLabel(context.event.racers, participant.racerId) : participant.placeholder}</strong>
    </div>
  )
}

function TournamentMatchCard({
  context,
  hasPairConnector,
  match,
  isFirstRound,
  isLastRound
}: {
  context: DisplayContext
  hasPairConnector: boolean
  match: TournamentMatch
  isFirstRound: boolean
  isLastRound: boolean
}) {
  const statusLabel = match.isChampion
    ? match.winnerId
      ? 'Complete'
      : 'Pending'
    : match.isCurrent
      ? 'Current'
      : formatStatus(match.status)

  return (
    <div
      className="tournament-match-shell"
      data-current={match.isCurrent}
      data-first-round={isFirstRound}
      data-has-pair={hasPairConnector}
      data-last-round={isLastRound}
      data-pair-position={match.matchIndex % 2 === 0 ? 'top' : 'bottom'}
      data-status={match.isCurrent ? 'current' : match.status}
    >
      <article className="tournament-match-card" data-champion={match.isChampion}>
        <div className="tournament-match-heading">
          <span>{match.isChampion ? 'Champion' : `Match ${match.matchNumber}`}</span>
          <strong>{statusLabel}</strong>
        </div>

        <div className="tournament-participants">
          {match.participants.map((participant, index) => (
            <TournamentParticipantRow
              context={context}
              isChampion={match.isChampion}
              key={`${match.id}:${participant.racerId ?? participant.placeholder}:${index}`}
              participant={participant}
              winnerId={match.winnerId}
            />
          ))}
        </div>

        <div className="tournament-result">
          <span>{tournamentResultText(context, match)}</span>
          {match.sourceMatchNumbers.length > 0 && !match.isChampion ? (
            <small>{match.sourceMatchNumbers.map((matchNumber) => `M${matchNumber}`).join(' + ')}</small>
          ) : null}
        </div>
      </article>
    </div>
  )
}

function SingleEliminationDisplay({ context }: { context: DisplayContext }) {
  const rounds = buildTournamentRounds(context)
  const currentRound = context.currentHeat
    ? rounds.find((round) => round.roundNumber === context.currentHeat?.roundNumber)
    : undefined
  const championMatch = rounds.find((round) => round.isChampion)?.matches[0]
  const championId = championMatch?.winnerId

  return (
    <div className="elimination-display">
      <article className="match-focus elimination-current">
        <span>{context.raceFinished ? 'Champion' : currentRound?.label ?? 'Current Match'}</span>
        <strong>{context.raceFinished ? 'Final Result' : currentHeatLabel(context.currentHeat)}</strong>
        {context.raceFinished && championId ? (
          <div className="champion-callout">
            <span>Champion</span>
            <strong>{racerLabel(context.event.racers, championId)}</strong>
          </div>
        ) : (
          renderLaneAssignments(context, context.currentHeat)
        )}
      </article>

      <section className="tournament-bracket" aria-label="Single elimination tournament bracket">
        {rounds.map((round, roundIndex) => (
          <div className="tournament-round" data-champion={round.isChampion} key={round.id}>
            <div className="tournament-round-heading">
              <span>{round.label}</span>
              <strong>
                {round.isChampion
                  ? '1 winner'
                  : `${round.matches.length} match${round.matches.length === 1 ? '' : 'es'}`}
              </strong>
            </div>
            <div className="tournament-match-list">
              {round.matches.map((match) => (
                <TournamentMatchCard
                  context={context}
                  hasPairConnector={round.matches.length > 1 && !round.isChampion}
                  isFirstRound={roundIndex === 0}
                  isLastRound={roundIndex === rounds.length - 1}
                  key={match.id}
                  match={match}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

function MultiLossEliminationBracketDisplay({ context }: { context: DisplayContext }) {
  const lossLimit = eliminationLossLimit(context.race.format)
  const columns: Array<{ id: string; label: string; heats: Heat[] }> = []
  const finalHeats = context.race.heats.filter(
    (heat) => heat.eliminationBracket?.isFinal || heat.eliminationBracket?.isCrossLoss
  )

  for (let lossCount = 0; lossCount < lossLimit; lossCount += 1) {
    columns.push({
      id: `loss-${lossCount}`,
      label: lossCount === 1 ? '1 Loss' : `${lossCount} Losses`,
      heats: context.race.heats
        .filter(
          (heat) =>
            heat.eliminationBracket?.lossCount === lossCount &&
            !heat.eliminationBracket.isFinal &&
            !heat.eliminationBracket.isCrossLoss
        )
        .sort((first, second) => first.roundNumber - second.roundNumber || first.heatNumber - second.heatNumber)
    })
  }

  columns.push({
    id: 'finals',
    label: 'Finals',
    heats: finalHeats.sort((first, second) => first.roundNumber - second.roundNumber || first.heatNumber - second.heatNumber)
  })

  return (
    <div className="elimination-display multi-loss-display">
      <EliminationCurrentDisplay context={context} />
      <section className="tournament-bracket multi-loss-bracket" aria-label={`${formatStatus(context.race.format)} bracket`}>
        {columns.map((column) => (
          <div className="tournament-round" data-empty={column.heats.length === 0} key={column.id}>
            <div className="tournament-round-heading">
              <span>{column.label}</span>
              <strong>{column.heats.length} match{column.heats.length === 1 ? '' : 'es'}</strong>
            </div>
            <div className="tournament-match-list">
              {column.heats.map((heat, matchIndex) => (
                <TournamentMatchCard
                  context={context}
                  hasPairConnector={false}
                  isFirstRound={column.id === 'loss-0'}
                  isLastRound={column.id === 'finals'}
                  key={heat.id}
                  match={matchFromHeat(context, heat, matchIndex)}
                />
              ))}
              {column.heats.length === 0 ? <p className="empty-state">No matches yet.</p> : null}
            </div>
          </div>
        ))}
      </section>
    </div>
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

      return <MultiLossEliminationBracketDisplay context={context} />
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
