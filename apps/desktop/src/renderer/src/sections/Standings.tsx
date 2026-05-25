import { useMemo } from 'react'
import { Award, Trophy } from 'lucide-react'

import { calculateStandings, getAdvancementTieBreakerStatuses, type Standing } from '@packracer/race-engine'

import { formatStatus, formatTime } from '../formatters'
import type { SectionProps } from './types'

export function Standings({ event, currentRace, selectedRaceId, setSelectedRaceId, actions }: SectionProps) {
  const standings = useMemo(
    () => (event && currentRace ? calculateStandings(event, currentRace.id) : []),
    [event, currentRace]
  )
  const dependentRaces = useMemo(
    () => event?.races.filter((race) => race.source?.sourceRaceId === currentRace?.id) ?? [],
    [event, currentRace]
  )
  const sourceRace = useMemo(
    () => event?.races.find((race) => race.id === currentRace?.source?.sourceRaceId) ?? null,
    [event, currentRace]
  )
  const eligibleStandings = useMemo(
    () => standings.filter((standing) => standing.score !== null && standing.racerStatus === 'active'),
    [standings]
  )
  const standingsByRacerId = useMemo(
    () => new Map(standings.map((standing) => [standing.racerId, standing])),
    [standings]
  )
  const advancementStatuses = useMemo(
    () => (event && currentRace ? getAdvancementTieBreakerStatuses(event, currentRace.id) : []),
    [event, currentRace]
  )
  const advancementStatusByRaceId = useMemo(
    () => new Map(advancementStatuses.map((status) => [status.dependentRaceId, status])),
    [advancementStatuses]
  )

  if (!event) {
    return <p className="empty-state full-width-message">Create an event to view standings.</p>
  }

  if (!currentRace) {
    return <p className="empty-state full-width-message">Add a race to view standings.</p>
  }

  return (
    <section className="section-grid standings-grid">
      <div className="race-panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Standings</p>
            <h3>{currentRace.name}</h3>
          </div>
          <Trophy aria-hidden="true" size={24} />
        </div>

        <div className="toolbar-row">
          <label>
            <span>Race</span>
            <select value={selectedRaceId} onChange={(inputEvent) => setSelectedRaceId(inputEvent.target.value)}>
              {event.races.map((race) => (
                <option key={race.id} value={race.id}>
                  {race.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="data-table-wrap">
          <table className="data-table standings-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Racer</th>
                <th>Division</th>
                <th>Score</th>
                <th>Best</th>
                <th>Average</th>
                <th>Runs</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing) => (
                <tr key={standing.racerId} data-muted={standing.racerStatus !== 'active'}>
                  <td>{standing.rank}</td>
                  <td>
                    <strong>#{standing.racerNumber} {standing.racerName}</strong>
                    <small>{formatStatus(standing.racerStatus)}</small>
                  </td>
                  <td>{standing.division}</td>
                  <td>{standing.scoreLabel}</td>
                  <td>{formatTime(standing.bestTimeMs)}</td>
                  <td>{formatTime(standing.averageTimeMs)}</td>
                  <td>{standing.completedHeats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="race-panel form-panel advancement-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Advancement</p>
            <h3>{dependentRaces.length > 0 ? 'Dependent races' : currentRace.source ? 'Populated roster' : 'No dependency'}</h3>
          </div>
          <Award aria-hidden="true" size={24} />
        </div>

        <div className="advancement-summary-list">
          {currentRace.source ? (
            <section className="advancement-summary">
              <strong>{sourceRace?.name ?? 'Source race'}</strong>
              <span>
                Top {currentRace.source.topCount} eligible racers populate this roster automatically when the source race is complete.
              </span>
              <span>{currentRace.entries.filter((entry) => entry.status === 'active').length} active entries currently populated.</span>
            </section>
          ) : null}

          {dependentRaces.map((race) => {
            const topCount = race.source?.topCount ?? 0
            const advancementStatus = advancementStatusByRaceId.get(race.id)
            const selectedStandings =
              advancementStatus && advancementStatus.selectedRacerIds.length > 0
                ? advancementStatus.selectedRacerIds
                    .map((racerId) => standingsByRacerId.get(racerId))
                    .filter((standing): standing is Standing => Boolean(standing))
                : []
            const advancingStandings = advancementStatus?.needsTieBreaker
              ? selectedStandings
              : selectedStandings.length > 0
                ? selectedStandings
                : eligibleStandings.slice(0, topCount)
            const unresolvedStandings =
              advancementStatus?.unresolvedRacerIds
                .map((racerId) => standingsByRacerId.get(racerId))
                .filter((standing): standing is Standing => Boolean(standing)) ?? []
            const populatedEntries = race.entries.filter((entry) => entry.status === 'active').length

            return (
              <section className="advancement-summary" key={race.id}>
                <strong>{race.name}</strong>
                <span>
                  {currentRace.status === 'complete'
                    ? `${populatedEntries}/${topCount} entries populated from these standings.`
                    : `Top ${topCount} advance when this race is complete.`}
                </span>
                {advancementStatus?.needsTieBreaker ? (
                  <span>
                    {advancementStatus.resolved
                      ? `${advancementStatus.selectedRacerIds.length}/${topCount} finalists resolved by tie-breaker.`
                      : `${advancementStatus.selectedRacerIds.length}/${topCount} finalists locked; cutoff tie needs ${advancementStatus.unresolvedContestedSlots} slot(s).`}
                  </span>
                ) : null}
                {advancingStandings.length > 0 ? (
                  <ol className="advancement-list">
                    {advancingStandings.map((standing) => (
                      <li key={`${race.id}-${standing.racerId}`}>
                        <span>#{standing.racerNumber} {standing.racerName}</span>
                        <strong>{standing.scoreLabel}</strong>
                      </li>
                    ))}
                  </ol>
                ) : advancementStatus?.needsTieBreaker ? (
                  <span>No finalists are locked until the cutoff tie is resolved.</span>
                ) : (
                  <span>No eligible standings yet.</span>
                )}
                {advancementStatus?.needsTieBreaker && !advancementStatus.resolved ? (
                  <div className="decision-panel">
                    <strong>Cutoff tie</strong>
                    <span>
                      {unresolvedStandings.length > 0
                        ? unresolvedStandings.map((standing) => `#${standing.racerNumber} ${standing.racerName}`).join(', ')
                        : 'Tied racers'}{' '}
                      are still contested.
                    </span>
                    {advancementStatus.pendingHeatIds.length > 0 ? (
                      <span>Complete the generated tie-breaker heat(s) before advancing.</span>
                    ) : advancementStatus.canGenerateTieBreaker ? (
                      <div className="button-row">
                        <button
                          className="secondary-action"
                          onClick={() => void actions.generateTieBreaker(currentRace.id, race.id)}
                          type="button"
                        >
                          Generate Tie-Breaker
                        </button>
                      </div>
                    ) : (
                      <span>{advancementStatus.message ?? 'Resolve this advancement tie manually.'}</span>
                    )}
                  </div>
                ) : null}
              </section>
            )
          })}

          {!currentRace.source && dependentRaces.length === 0 ? (
            <p className="empty-state">Configure a dependent race in Race Setup to advance racers from these standings.</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
