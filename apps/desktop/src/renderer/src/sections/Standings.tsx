import { FormEvent, useMemo, useState } from 'react'
import { Award, Trophy } from 'lucide-react'

import { calculateStandings, type RaceFormat } from '@packracer/race-engine'

import { formatStatus, formatTime } from '../formatters'
import type { SectionProps } from './types'

const finalsFormats: RaceFormat[] = ['timed-heats', 'points-heats', 'round-robin', 'single-elimination']

export function Standings({ project, actions, selectedStageId, setSelectedStageId }: SectionProps) {
  const selectedStage = project?.stages.find((stage) => stage.id === selectedStageId) ?? project?.stages[0]
  const [topCount, setTopCount] = useState(4)
  const [finalsFormat, setFinalsFormat] = useState<RaceFormat>('single-elimination')

  const standings = useMemo(
    () => (project && selectedStage ? calculateStandings(project, selectedStage.id) : []),
    [project, selectedStage]
  )

  const submitFinals = (event: FormEvent) => {
    event.preventDefault()

    if (!selectedStage) {
      return
    }

    void actions.createFinalsStage({
      sourceStageId: selectedStage.id,
      name: `${selectedStage.name} Finals`,
      format: finalsFormat,
      topCount,
      laneCount: selectedStage.laneCount
    })
  }

  if (!project) {
    return <p className="empty-state full-width-message">Create or open a project to view standings.</p>
  }

  return (
    <section className="section-grid standings-grid">
      <div className="race-panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Standings</p>
            <h3>{selectedStage ? selectedStage.name : 'No stage'}</h3>
          </div>
          <Trophy aria-hidden="true" size={24} />
        </div>

        <div className="toolbar-row">
          <label>
            <span>Stage</span>
            <select value={selectedStage?.id ?? ''} onChange={(event) => setSelectedStageId(event.target.value)}>
              {project.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
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

      <form className="race-panel form-panel" onSubmit={submitFinals}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Advancement</p>
            <h3>Create finals</h3>
          </div>
          <Award aria-hidden="true" size={24} />
        </div>

        <div className="form-grid">
          <label>
            <span>Advance top</span>
            <input min={1} type="number" value={topCount} onChange={(event) => setTopCount(Number(event.target.value))} />
          </label>
          <label>
            <span>Finals format</span>
            <select value={finalsFormat} onChange={(event) => setFinalsFormat(event.target.value as RaceFormat)}>
              {finalsFormats.map((format) => (
                <option key={format} value={format}>
                  {formatStatus(format)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button className="primary-action" disabled={!selectedStage || standings.every((standing) => standing.score === null)} type="submit">
          Create Finals Stage
        </button>
      </form>
    </section>
  )
}