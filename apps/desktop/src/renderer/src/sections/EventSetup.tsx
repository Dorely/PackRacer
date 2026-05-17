import { CalendarDays, Flag, ListPlus, Save } from 'lucide-react'
import { FormEvent, useState } from 'react'

import type { RaceFormat, ScoringMode, TournamentType } from '@packracer/race-engine'

import { formatStatus, stageSummary } from '../formatters'
import type { SectionProps } from './types'

const raceFormats: RaceFormat[] = ['timed-heats', 'points-heats', 'round-robin', 'single-elimination']
const tournamentTypes: TournamentType[] = ['timed-heats', 'points-heats', 'round-robin', 'single-elimination', 'multi-stage']

function defaultScoringMode(format: RaceFormat): ScoringMode {
  if (format === 'points-heats') {
    return 'points-high'
  }

  if (format === 'round-robin') {
    return 'round-robin-record'
  }

  if (format === 'single-elimination') {
    return 'elimination'
  }

  return 'average-time'
}

export function EventSetup({ project, actions }: SectionProps) {
  const [eventName, setEventName] = useState(project?.name ?? 'Pack Championship')
  const [eventDate, setEventDate] = useState(project?.eventDate ?? new Date().toISOString().slice(0, 10))
  const [trackName, setTrackName] = useState(project?.trackName ?? 'Main Track')
  const [laneCount, setLaneCount] = useState(project?.laneCount ?? 4)
  const [tournamentType, setTournamentType] = useState<TournamentType>(project?.tournamentType ?? 'multi-stage')
  const [stageName, setStageName] = useState('Qualifying')
  const [stageFormat, setStageFormat] = useState<RaceFormat>('timed-heats')
  const [roundsPerRacer, setRoundsPerRacer] = useState(4)

  const submitProject = (event: FormEvent) => {
    event.preventDefault()

    if (project) {
      void actions.updateProject({ name: eventName, eventDate, trackName, laneCount, tournamentType })
      return
    }

    void actions.createProject({ name: eventName, eventDate, trackName, laneCount, tournamentType })
  }

  const submitStage = (event: FormEvent) => {
    event.preventDefault()
    void actions.addStage({
      name: stageName,
      format: stageFormat,
      laneCount,
      roundsPerRacer,
      scoringMode: defaultScoringMode(stageFormat)
    })
    setStageName(stageFormat === 'single-elimination' ? 'Final Bracket' : 'Next Stage')
  }

  return (
    <section className="section-grid">
      <form className="race-panel form-panel" onSubmit={submitProject}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Project</p>
            <h3>{project ? 'Event settings' : 'Create race project'}</h3>
          </div>
          <CalendarDays aria-hidden="true" size={24} />
        </div>

        <div className="form-grid two-column">
          <label>
            <span>Event name</span>
            <input value={eventName} onChange={(event) => setEventName(event.target.value)} required />
          </label>
          <label>
            <span>Event date</span>
            <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
          </label>
          <label>
            <span>Track name</span>
            <input value={trackName} onChange={(event) => setTrackName(event.target.value)} />
          </label>
          <label>
            <span>Lanes</span>
            <input
              type="number"
              min={1}
              max={12}
              value={laneCount}
              onChange={(event) => setLaneCount(Number(event.target.value))}
            />
          </label>
          <label className="wide-field">
            <span>Tournament type</span>
            <select value={tournamentType} onChange={(event) => setTournamentType(event.target.value as TournamentType)}>
              {tournamentTypes.map((type) => (
                <option key={type} value={type}>
                  {formatStatus(type)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="button-row">
          <button className="primary-action" type="submit">
            <Save aria-hidden="true" size={18} />
            <span>{project ? 'Save Settings' : 'Create Project'}</span>
          </button>
          {!project ? (
            <button className="secondary-action" onClick={actions.openProject} type="button">
              Open Existing
            </button>
          ) : null}
        </div>
      </form>

      <div className="race-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Stages</p>
            <h3>Race structure</h3>
          </div>
          <Flag aria-hidden="true" size={24} />
        </div>

        {project ? (
          <>
            <form className="compact-form" onSubmit={submitStage}>
              <label>
                <span>Stage name</span>
                <input value={stageName} onChange={(event) => setStageName(event.target.value)} />
              </label>
              <label>
                <span>Format</span>
                <select value={stageFormat} onChange={(event) => setStageFormat(event.target.value as RaceFormat)}>
                  {raceFormats.map((format) => (
                    <option key={format} value={format}>
                      {formatStatus(format)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Runs per racer</span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={roundsPerRacer}
                  onChange={(event) => setRoundsPerRacer(Number(event.target.value))}
                />
              </label>
              <button className="secondary-action" type="submit">
                <ListPlus aria-hidden="true" size={18} />
                <span>Add Stage</span>
              </button>
            </form>

            <div className="stack-list">
              {project.stages.map((stage) => (
                <article className="list-card" key={stage.id}>
                  <div>
                    <strong>{stage.name}</strong>
                    <span>{stageSummary(stage)}</span>
                  </div>
                  <button className="secondary-action" onClick={() => void actions.generateHeats(stage.id)} type="button">
                    Generate Heats
                  </button>
                </article>
              ))}
              {project.stages.length === 0 ? <p className="empty-state">Add a stage to generate the first heat sheet.</p> : null}
            </div>
          </>
        ) : (
          <p className="empty-state">Create or open a project before adding race stages.</p>
        )}
      </div>
    </section>
  )
}