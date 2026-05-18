import { Flag, ListPlus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'

import type { RaceFormat, ScoringMode, TournamentType } from '@packracer/race-engine'

import { formatStatus, raceSummary, stageSummary } from '../formatters'
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

export function EventSetup({
  event,
  currentRace,
  actions,
  selectedRaceId,
  setSelectedRaceId,
  selectedStageId,
  setSelectedStageId,
  requestConfirmation
}: SectionProps) {
  const [raceName, setRaceName] = useState('Main Tournament')
  const [raceType, setRaceType] = useState<TournamentType>('multi-stage')
  const [raceLaneCount, setRaceLaneCount] = useState(3)
  const [editRaceName, setEditRaceName] = useState(currentRace?.name ?? '')
  const [editRaceType, setEditRaceType] = useState<TournamentType>(currentRace?.tournamentType ?? 'timed-heats')
  const [editLaneCount, setEditLaneCount] = useState(currentRace?.laneCount ?? 3)
  const [avoidSameLane, setAvoidSameLane] = useState(currentRace?.schedulingOptions?.avoidSameLane ?? true)
  const [avoidSameOpponents, setAvoidSameOpponents] = useState(currentRace?.schedulingOptions?.avoidSameOpponents ?? true)
  const [usesSource, setUsesSource] = useState(Boolean(currentRace?.source))
  const [sourceRaceId, setSourceRaceId] = useState(currentRace?.source?.sourceRaceId ?? '')
  const [sourceStageId, setSourceStageId] = useState(currentRace?.source?.sourceStageId ?? '')
  const [sourceTopCount, setSourceTopCount] = useState(currentRace?.source?.topCount ?? 8)
  const [stageName, setStageName] = useState('Qualifying')
  const [stageFormat, setStageFormat] = useState<RaceFormat>('timed-heats')
  const [roundsPerRacer, setRoundsPerRacer] = useState(3)
  const selectedStage = currentRace?.stages.find((stage) => stage.id === selectedStageId) ?? currentRace?.stages[0]
  const [editStageName, setEditStageName] = useState(selectedStage?.name ?? '')
  const [editStageFormat, setEditStageFormat] = useState<RaceFormat>(selectedStage?.format ?? 'timed-heats')
  const [editStageLaneCount, setEditStageLaneCount] = useState(selectedStage?.laneCount ?? 3)
  const [editStageRounds, setEditStageRounds] = useState(selectedStage?.roundsPerRacer ?? 3)

  useEffect(() => {
    if (!currentRace) {
      return
    }

    setEditRaceName(currentRace.name)
    setEditRaceType(currentRace.tournamentType)
    setEditLaneCount(currentRace.laneCount)
    setAvoidSameLane(currentRace.schedulingOptions?.avoidSameLane ?? true)
    setAvoidSameOpponents(currentRace.schedulingOptions?.avoidSameOpponents ?? true)
    setUsesSource(Boolean(currentRace.source))
    setSourceRaceId(currentRace.source?.sourceRaceId ?? '')
    setSourceStageId(currentRace.source?.sourceStageId ?? '')
    setSourceTopCount(currentRace.source?.topCount ?? 8)
  }, [currentRace])

  useEffect(() => {
    if (!selectedStage) {
      return
    }

    setEditStageName(selectedStage.name)
    setEditStageFormat(selectedStage.format)
    setEditStageLaneCount(selectedStage.laneCount)
    setEditStageRounds(selectedStage.roundsPerRacer)
  }, [selectedStage])

  const sourceRaceOptions = useMemo(
    () => event?.races.filter((race) => race.id !== currentRace?.id) ?? [],
    [event, currentRace]
  )
  const sourceStageOptions = sourceRaceOptions.find((race) => race.id === sourceRaceId)?.stages ?? []

  const submitRace = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    void actions.createRace({
      name: raceName,
      tournamentType: raceType,
      laneCount: raceLaneCount,
      schedulingOptions: { avoidSameLane: true, avoidSameOpponents: true }
    })
    setRaceName('Additional Race')
  }

  const submitRaceSettings = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!currentRace) {
      return
    }

    void actions.updateRace(currentRace.id, {
      name: editRaceName,
      tournamentType: editRaceType,
      laneCount: editLaneCount,
      schedulingOptions: { avoidSameLane, avoidSameOpponents },
      source: usesSource && sourceRaceId ? { sourceRaceId, sourceStageId: sourceStageId || undefined, topCount: sourceTopCount } : undefined
    })
  }

  const submitStage = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!currentRace) {
      return
    }

    void actions.addStage(currentRace.id, {
      name: stageName,
      format: stageFormat,
      laneCount: currentRace.laneCount,
      roundsPerRacer,
      scoringMode: defaultScoringMode(stageFormat)
    })
    setStageName(stageFormat === 'single-elimination' ? 'Final Bracket' : 'Next Stage')
  }

  const submitStageSettings = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!currentRace || !selectedStage) {
      return
    }

    void actions.updateStage(currentRace.id, selectedStage.id, {
      name: editStageName,
      format: editStageFormat,
      laneCount: editStageLaneCount,
      roundsPerRacer: editStageRounds,
      scoringMode: defaultScoringMode(editStageFormat)
    })
  }

  const deleteRace = () => {
    if (currentRace) {
      requestConfirmation({
        title: 'Delete race',
        message: `Delete ${currentRace.name}? This permanently removes its stages, heats, and registrations.`,
        confirmLabel: 'Delete Race',
        destructive: true,
        onConfirm: () => actions.deleteRace(currentRace.id)
      })
    }
  }

  const deleteStage = (stageId: string, name: string) => {
    if (currentRace) {
      requestConfirmation({
        title: 'Delete stage',
        message: `Delete ${name}? This permanently removes its heats and results.`,
        confirmLabel: 'Delete Stage',
        destructive: true,
        onConfirm: () => actions.deleteStage(currentRace.id, stageId)
      })
    }
  }

  if (!event) {
    return <p className="empty-state full-width-message">Create or select an event before race setup.</p>
  }

  return (
    <section className="section-grid setup-grid">
      <div className="race-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Races</p>
            <h3>{event.races.length} configured</h3>
          </div>
          <Flag aria-hidden="true" size={24} />
        </div>

        <form className="form-grid" onSubmit={submitRace}>
          <label>
            <span>Race name</span>
            <input value={raceName} onChange={(inputEvent) => setRaceName(inputEvent.target.value)} />
          </label>
          <div className="form-grid two-column">
            <label>
              <span>Type</span>
              <select value={raceType} onChange={(inputEvent) => setRaceType(inputEvent.target.value as TournamentType)}>
                {tournamentTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatStatus(type)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Lanes</span>
              <input min={1} max={12} type="number" value={raceLaneCount} onChange={(inputEvent) => setRaceLaneCount(Number(inputEvent.target.value))} />
            </label>
          </div>
          <button className="primary-action" type="submit">
            <ListPlus aria-hidden="true" size={18} />
            <span>Add Race</span>
          </button>
        </form>

        <div className="stack-list">
          {event.races.map((race) => (
            <button
              className="list-card selectable-card"
              data-active={race.id === selectedRaceId}
              key={race.id}
              onClick={() => setSelectedRaceId(race.id)}
              type="button"
            >
              <div>
                <strong>{race.name}</strong>
                <span>{raceSummary(race)}</span>
              </div>
            </button>
          ))}
          {event.races.length === 0 ? <p className="empty-state">Add the first race to define formats and registrations.</p> : null}
        </div>
      </div>

      <div className="race-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Race setup</p>
            <h3>{currentRace ? currentRace.name : 'No race selected'}</h3>
          </div>
          {currentRace ? (
            <button className="danger-action" onClick={deleteRace} type="button">
              <Trash2 aria-hidden="true" size={16} />
              <span>Delete Race</span>
            </button>
          ) : null}
        </div>

        {currentRace ? (
          <>
            <form className="form-grid" onSubmit={submitRaceSettings}>
              <div className="form-grid two-column">
                <label>
                  <span>Race name</span>
                  <input value={editRaceName} onChange={(inputEvent) => setEditRaceName(inputEvent.target.value)} />
                </label>
                <label>
                  <span>Type</span>
                  <select value={editRaceType} onChange={(inputEvent) => setEditRaceType(inputEvent.target.value as TournamentType)}>
                    {tournamentTypes.map((type) => (
                      <option key={type} value={type}>
                        {formatStatus(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Lanes</span>
                  <input min={1} max={12} type="number" value={editLaneCount} onChange={(inputEvent) => setEditLaneCount(Number(inputEvent.target.value))} />
                </label>
                <label>
                  <span>Advance top</span>
                  <input disabled={!usesSource} min={1} type="number" value={sourceTopCount} onChange={(inputEvent) => setSourceTopCount(Number(inputEvent.target.value))} />
                </label>
              </div>

              <div className="toggle-grid">
                <label className="inline-toggle">
                  <input type="checkbox" checked={avoidSameLane} onChange={(inputEvent) => setAvoidSameLane(inputEvent.target.checked)} />
                  <span>Avoid repeated lanes</span>
                </label>
                <label className="inline-toggle">
                  <input type="checkbox" checked={avoidSameOpponents} onChange={(inputEvent) => setAvoidSameOpponents(inputEvent.target.checked)} />
                  <span>Avoid repeated opponents</span>
                </label>
                <label className="inline-toggle">
                  <input type="checkbox" checked={usesSource} onChange={(inputEvent) => setUsesSource(inputEvent.target.checked)} />
                  <span>Populate from another race</span>
                </label>
              </div>

              {usesSource ? (
                <div className="form-grid two-column">
                  <label>
                    <span>Source race</span>
                    <select value={sourceRaceId} onChange={(inputEvent) => setSourceRaceId(inputEvent.target.value)}>
                      <option value="">Select source race</option>
                      {sourceRaceOptions.map((race) => (
                        <option key={race.id} value={race.id}>
                          {race.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Source stage</span>
                    <select value={sourceStageId} onChange={(inputEvent) => setSourceStageId(inputEvent.target.value)}>
                      <option value="">Current source stage</option>
                      {sourceStageOptions.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="button-row">
                <button className="primary-action" type="submit">
                  <Save aria-hidden="true" size={18} />
                  <span>Save Race</span>
                </button>
                <button
                  className="secondary-action"
                  disabled={!currentRace.source}
                  onClick={() => void actions.populateRaceEntriesFromSource(currentRace.id)}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={18} />
                  <span>Populate Entries</span>
                </button>
              </div>
            </form>

            <form className="compact-form stage-form" onSubmit={submitStage}>
              <label>
                <span>Stage name</span>
                <input value={stageName} onChange={(inputEvent) => setStageName(inputEvent.target.value)} />
              </label>
              <label>
                <span>Format</span>
                <select value={stageFormat} onChange={(inputEvent) => setStageFormat(inputEvent.target.value as RaceFormat)}>
                  {raceFormats.map((format) => (
                    <option key={format} value={format}>
                      {formatStatus(format)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Runs per racer</span>
                <input min={1} max={24} type="number" value={roundsPerRacer} onChange={(inputEvent) => setRoundsPerRacer(Number(inputEvent.target.value))} />
              </label>
              <button className="secondary-action" type="submit">
                <ListPlus aria-hidden="true" size={18} />
                <span>Add Stage</span>
              </button>
            </form>

            {selectedStage ? (
              <form className="compact-form" onSubmit={submitStageSettings}>
                <label>
                  <span>Selected stage</span>
                  <input value={editStageName} onChange={(inputEvent) => setEditStageName(inputEvent.target.value)} />
                </label>
                <label>
                  <span>Format</span>
                  <select value={editStageFormat} onChange={(inputEvent) => setEditStageFormat(inputEvent.target.value as RaceFormat)}>
                    {raceFormats.map((format) => (
                      <option key={format} value={format}>
                        {formatStatus(format)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Lanes</span>
                  <input min={1} max={12} type="number" value={editStageLaneCount} onChange={(inputEvent) => setEditStageLaneCount(Number(inputEvent.target.value))} />
                </label>
                <label>
                  <span>Runs</span>
                  <input min={1} max={24} type="number" value={editStageRounds} onChange={(inputEvent) => setEditStageRounds(Number(inputEvent.target.value))} />
                </label>
                <button className="secondary-action" type="submit">
                  <Save aria-hidden="true" size={18} />
                  <span>Save Stage</span>
                </button>
              </form>
            ) : null}

            <div className="stack-list">
              {currentRace.stages.map((stage) => (
                <article className="list-card" data-active={stage.id === selectedStage?.id} key={stage.id}>
                  <button className="bare-select" onClick={() => setSelectedStageId(stage.id)} type="button">
                    <strong>{stage.name}</strong>
                    <span>{stageSummary(stage)}</span>
                  </button>
                  <div className="button-row nowrap">
                    <button className="secondary-action" onClick={() => void actions.generateHeats(currentRace.id, stage.id)} type="button">
                      Generate
                    </button>
                    <button className="danger-action" onClick={() => deleteStage(stage.id, stage.name)} type="button">
                      <Trash2 aria-hidden="true" size={16} />
                      <span>Delete</span>
                    </button>
                  </div>
                </article>
              ))}
              {currentRace.stages.length === 0 ? <p className="empty-state">Add a stage to generate the first heat sheet.</p> : null}
            </div>
          </>
        ) : (
          <p className="empty-state">Add or select a race to define rules.</p>
        )}
      </div>
    </section>
  )
}