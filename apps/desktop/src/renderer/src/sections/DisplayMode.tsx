import { Monitor } from 'lucide-react'
import { useMemo } from 'react'

import { calculateStandings } from '@packracer/race-engine'

import { formatTime, racerLabel } from '../formatters'
import type { SectionProps } from './types'

export function DisplayMode({ event, currentRace, selectedRaceId, setSelectedRaceId }: SectionProps) {
  const pendingHeat = currentRace?.heats.find((heat) => heat.status === 'pending')
  const currentHeat = currentRace?.heats.find((heat) => heat.id === currentRace.currentHeatId) ?? pendingHeat
  const raceFinished = Boolean(
    currentRace &&
      currentRace.heats.length > 0 &&
      !currentRace.heats.some((heat) => heat.status === 'pending' || heat.status === 'running' || heat.status === 'invalidated') &&
      !currentHeat
  )
  const standings = useMemo(
    () => (event && currentRace ? calculateStandings(event, currentRace.id).slice(0, 8) : []),
    [event, currentRace]
  )

  if (!event) {
    return <p className="empty-state full-width-message">Create an event to use display mode.</p>
  }

  if (!currentRace) {
    return <p className="empty-state full-width-message">Add a race to use display mode.</p>
  }

  return (
    <section className="display-board">
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
        <Monitor aria-hidden="true" size={30} />
      </div>

      <div className="display-grid">
        <article>
          <span>{raceFinished ? 'Race Finished' : 'Current Heat'}</span>
          <strong>
            {raceFinished
              ? currentRace.name
              : currentHeat?.tieBreakerSource
                ? `Tie-Breaker Round ${currentHeat.tieBreakerSource.roundNumber}`
                : currentHeat
                  ? `Heat ${currentHeat.heatNumber}`
                  : 'No heat'}
          </strong>
          {raceFinished ? (
            <p className="empty-state">All heats are complete.</p>
          ) : (
            <div className="lane-grid">
              {currentHeat?.laneAssignments.map((assignment) => (
                <div className="lane-row" key={assignment.lane}>
                  <span>Lane {assignment.lane}</span>
                  <strong>{racerLabel(event.racers, assignment.racerId)}</strong>
                </div>
              )) ?? null}
            </div>
          )}
        </article>

        <article>
          <span>{raceFinished ? 'Final Results' : 'Leaders'}</span>
          <strong>{currentRace.name}</strong>
          <ol className="leader-list">
            {standings.map((standing) => (
              <li key={standing.racerId}>
                <span>#{standing.racerNumber} {standing.racerName}</span>
                <strong>{standing.bestTimeMs ? formatTime(standing.bestTimeMs) : standing.scoreLabel}</strong>
              </li>
            ))}
          </ol>
        </article>
      </div>
    </section>
  )
}
