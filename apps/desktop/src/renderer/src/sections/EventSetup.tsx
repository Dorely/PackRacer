import { Flag, ListPlus, Save, Trash2 } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'

import type { RaceFormat, ScoringMode } from '@packracer/race-engine'

import { formatStatus, raceSummary } from '../formatters'
import type { SectionProps } from './types'

const raceFormats: RaceFormat[] = ['timed-heats', 'points-heats', 'round-robin', 'single-elimination']
const timedScoringModes: ScoringMode[] = ['average-time', 'best-time', 'total-time']
const pointsScoringModes: ScoringMode[] = ['points-high', 'points-low']

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

function scoringOptions(format: RaceFormat): ScoringMode[] {
  if (format === 'timed-heats') {
    return timedScoringModes
  }

  if (format === 'points-heats') {
    return pointsScoringModes
  }

  return []
}

function supportsRunsPerRacer(format: RaceFormat): boolean {
  return format === 'timed-heats' || format === 'points-heats'
}

function supportsSchedulingOptions(format: RaceFormat): boolean {
  return format === 'timed-heats' || format === 'points-heats'
}

function selectedScoringMode(format: RaceFormat, scoringMode: ScoringMode): ScoringMode {
  const options = scoringOptions(format)
  return options.length === 0 || options.includes(scoringMode) ? scoringMode : defaultScoringMode(format)
}

export function EventSetup({ event, currentRace, actions, selectedRaceId, setSelectedRaceId, requestConfirmation }: SectionProps) {
  const [raceName, setRaceName] = useState('Main Tournament')
  const [raceFormat, setRaceFormat] = useState<RaceFormat>('timed-heats')
  const [raceLaneCount, setRaceLaneCount] = useState(3)
  const [raceRounds, setRaceRounds] = useState(3)
  const [raceScoringMode, setRaceScoringMode] = useState<ScoringMode>('average-time')
  const [editRaceName, setEditRaceName] = useState(currentRace?.name ?? '')
  const [editRaceFormat, setEditRaceFormat] = useState<RaceFormat>(currentRace?.format ?? 'timed-heats')
  const [editLaneCount, setEditLaneCount] = useState(currentRace?.laneCount ?? 3)
  const [editRaceRounds, setEditRaceRounds] = useState(currentRace?.roundsPerRacer ?? 3)
  const [editScoringMode, setEditScoringMode] = useState<ScoringMode>(currentRace?.scoringMode ?? 'average-time')
  const [avoidSameLane, setAvoidSameLane] = useState(currentRace?.schedulingOptions?.avoidSameLane ?? true)
  const [avoidSameOpponents, setAvoidSameOpponents] = useState(currentRace?.schedulingOptions?.avoidSameOpponents ?? true)
  const [usesSource, setUsesSource] = useState(Boolean(currentRace?.source))
  const [sourceRaceId, setSourceRaceId] = useState(currentRace?.source?.sourceRaceId ?? '')
  const [sourceTopCount, setSourceTopCount] = useState(currentRace?.source?.topCount ?? 8)

  useEffect(() => {
    if (!currentRace) {
      return
    }

    setEditRaceName(currentRace.name)
    setEditRaceFormat(currentRace.format)
    setEditLaneCount(currentRace.laneCount)
    setEditRaceRounds(currentRace.roundsPerRacer)
    setEditScoringMode(currentRace.scoringMode)
    setAvoidSameLane(currentRace.schedulingOptions?.avoidSameLane ?? true)
    setAvoidSameOpponents(currentRace.schedulingOptions?.avoidSameOpponents ?? true)
    setUsesSource(Boolean(currentRace.source))
    setSourceRaceId(currentRace.source?.sourceRaceId ?? '')
    setSourceTopCount(currentRace.source?.topCount ?? 8)
  }, [currentRace])

  const sourceRaceOptions = useMemo(
    () => event?.races.filter((race) => race.id !== currentRace?.id) ?? [],
    [event, currentRace]
  )

  const createScoringOptions = scoringOptions(raceFormat)
  const editScoringOptions = scoringOptions(editRaceFormat)
  const createSupportsRuns = supportsRunsPerRacer(raceFormat)
  const editSupportsRuns = supportsRunsPerRacer(editRaceFormat)
  const editSupportsScheduling = supportsSchedulingOptions(editRaceFormat)

  const changeCreateFormat = (format: RaceFormat) => {
    setRaceFormat(format)
    setRaceScoringMode(defaultScoringMode(format))
  }

  const changeEditFormat = (format: RaceFormat) => {
    setEditRaceFormat(format)
    setEditScoringMode(defaultScoringMode(format))
  }

  const submitRace = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    void actions.createRace({
      name: raceName,
      format: raceFormat,
      laneCount: raceLaneCount,
      roundsPerRacer: createSupportsRuns ? raceRounds : 1,
      scoringMode: selectedScoringMode(raceFormat, raceScoringMode),
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
      format: editRaceFormat,
      laneCount: editLaneCount,
      roundsPerRacer: editSupportsRuns ? editRaceRounds : 1,
      scoringMode: selectedScoringMode(editRaceFormat, editScoringMode),
      schedulingOptions: { avoidSameLane, avoidSameOpponents },
      source: usesSource && sourceRaceId ? { sourceRaceId, topCount: sourceTopCount } : undefined
    })
  }

  const deleteRace = () => {
    if (currentRace) {
      requestConfirmation({
        title: 'Delete race',
        message: `Delete ${currentRace.name}? This permanently removes its heats and registrations.`,
        confirmLabel: 'Delete Race',
        destructive: true,
        onConfirm: () => actions.deleteRace(currentRace.id)
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
              <span>Format</span>
              <select value={raceFormat} onChange={(inputEvent) => changeCreateFormat(inputEvent.target.value as RaceFormat)}>
                {raceFormats.map((format) => (
                  <option key={format} value={format}>
                    {formatStatus(format)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Lanes</span>
              <input min={1} max={12} type="number" value={raceLaneCount} onChange={(inputEvent) => setRaceLaneCount(Number(inputEvent.target.value))} />
            </label>
            {createSupportsRuns ? (
              <label>
                <span>Runs per racer</span>
                <input min={1} max={24} type="number" value={raceRounds} onChange={(inputEvent) => setRaceRounds(Number(inputEvent.target.value))} />
              </label>
            ) : null}
            {createScoringOptions.length > 0 ? (
              <label>
                <span>Scoring</span>
                <select value={selectedScoringMode(raceFormat, raceScoringMode)} onChange={(inputEvent) => setRaceScoringMode(inputEvent.target.value as ScoringMode)}>
                  {createScoringOptions.map((mode) => (
                    <option key={mode} value={mode}>
                      {formatStatus(mode)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
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
          <form className="form-grid" onSubmit={submitRaceSettings}>
            <div className="form-grid two-column">
              <label>
                <span>Race name</span>
                <input value={editRaceName} onChange={(inputEvent) => setEditRaceName(inputEvent.target.value)} />
              </label>
              <label>
                <span>Format</span>
                <select value={editRaceFormat} onChange={(inputEvent) => changeEditFormat(inputEvent.target.value as RaceFormat)}>
                  {raceFormats.map((format) => (
                    <option key={format} value={format}>
                      {formatStatus(format)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Lanes</span>
                <input min={1} max={12} type="number" value={editLaneCount} onChange={(inputEvent) => setEditLaneCount(Number(inputEvent.target.value))} />
              </label>
              {editSupportsRuns ? (
                <label>
                  <span>Runs per racer</span>
                  <input min={1} max={24} type="number" value={editRaceRounds} onChange={(inputEvent) => setEditRaceRounds(Number(inputEvent.target.value))} />
                </label>
              ) : null}
              {editScoringOptions.length > 0 ? (
                <label>
                  <span>Scoring</span>
                  <select value={selectedScoringMode(editRaceFormat, editScoringMode)} onChange={(inputEvent) => setEditScoringMode(inputEvent.target.value as ScoringMode)}>
                    {editScoringOptions.map((mode) => (
                      <option key={mode} value={mode}>
                        {formatStatus(mode)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {usesSource ? (
                <label>
                  <span>Advance top</span>
                  <input min={1} type="number" value={sourceTopCount} onChange={(inputEvent) => setSourceTopCount(Number(inputEvent.target.value))} />
                </label>
              ) : null}
            </div>

            <div className="toggle-grid">
              {editSupportsScheduling ? (
                <>
                  <label className="inline-toggle">
                    <input type="checkbox" checked={avoidSameLane} onChange={(inputEvent) => setAvoidSameLane(inputEvent.target.checked)} />
                    <span>Avoid repeated lanes</span>
                  </label>
                  <label className="inline-toggle">
                    <input type="checkbox" checked={avoidSameOpponents} onChange={(inputEvent) => setAvoidSameOpponents(inputEvent.target.checked)} />
                    <span>Avoid repeated opponents</span>
                  </label>
                </>
              ) : null}
              <label className="inline-toggle">
                <input type="checkbox" checked={usesSource} onChange={(inputEvent) => setUsesSource(inputEvent.target.checked)} />
                <span>Populate from another race</span>
              </label>
            </div>

            {usesSource ? (
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
            ) : null}

            <div className="button-row">
              <button className="primary-action" type="submit">
                <Save aria-hidden="true" size={18} />
                <span>Save Race</span>
              </button>
            </div>
          </form>
        ) : (
          <p className="empty-state">Add or select a race to define rules.</p>
        )}
      </div>
    </section>
  )
}