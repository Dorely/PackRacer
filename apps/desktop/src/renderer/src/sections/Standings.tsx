import { useMemo } from 'react'
import { Award, Trophy } from 'lucide-react'

import { calculateStandings } from '@packracer/race-engine'

import { formatStatus, formatTime } from '../formatters'
import type { SectionProps } from './types'

export function Standings({ event, currentRace, selectedRaceId, setSelectedRaceId }: SectionProps) {
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
            const advancingStandings = eligibleStandings.slice(0, topCount)
            const populatedEntries = race.entries.filter((entry) => entry.status === 'active').length

            return (
              <section className="advancement-summary" key={race.id}>
                <strong>{race.name}</strong>
                <span>
                  {currentRace.status === 'complete'
                    ? `${populatedEntries}/${topCount} entries populated from these standings.`
                    : `Top ${topCount} advance when this race is complete.`}
                </span>
                {advancingStandings.length > 0 ? (
                  <ol className="advancement-list">
                    {advancingStandings.map((standing) => (
                      <li key={`${race.id}-${standing.racerId}`}>
                        <span>#{standing.racerNumber} {standing.racerName}</span>
                        <strong>{standing.scoreLabel}</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <span>No eligible standings yet.</span>
                )}
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