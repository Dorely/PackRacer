import { Monitor } from 'lucide-react'
import { useMemo } from 'react'

import { calculateStandings } from '@packracer/race-engine'

import { formatTime, racerLabel } from '../formatters'
import type { SectionProps } from './types'

export function DisplayMode({ project, selectedStageId }: SectionProps) {
  const selectedStage = project?.stages.find((stage) => stage.id === selectedStageId) ?? project?.stages[0]
  const currentHeat = selectedStage?.heats.find((heat) => heat.id === project?.currentHeatId) ?? selectedStage?.heats[0]
  const standings = useMemo(
    () => (project && selectedStage ? calculateStandings(project, selectedStage.id).slice(0, 8) : []),
    [project, selectedStage]
  )

  if (!project) {
    return <p className="empty-state full-width-message">Open a project to use display mode.</p>
  }

  return (
    <section className="display-board">
      <div className="display-heading">
        <div>
          <p className="eyebrow">Display Mode</p>
          <h3>{project.name}</h3>
        </div>
        <Monitor aria-hidden="true" size={30} />
      </div>

      <div className="display-grid">
        <article>
          <span>Current Heat</span>
          <strong>{currentHeat ? `Heat ${currentHeat.heatNumber}` : 'No heat'}</strong>
          <div className="lane-grid">
            {currentHeat?.laneAssignments.map((assignment) => (
              <div className="lane-row" key={assignment.lane}>
                <span>Lane {assignment.lane}</span>
                <strong>{racerLabel(project.racers, assignment.racerId)}</strong>
              </div>
            )) ?? null}
          </div>
        </article>

        <article>
          <span>Leaders</span>
          <strong>{selectedStage?.name ?? 'No stage'}</strong>
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