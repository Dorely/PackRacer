import { ChevronRight, Flag, ListPlus, Plus, Save, Trash2 } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'

import { getRaceDivision, isEliminationFormat, type Division, type RaceFormat, type ScoringMode } from '@packracer/race-engine'

import { formatStatus, raceSummary, suggestedUniqueName } from '../formatters'
import type { SectionProps } from './types'

const raceFormats: RaceFormat[] = [
  'timed-heats',
  'points-heats',
  'round-robin',
  'single-elimination',
  'double-elimination',
  'triple-elimination'
]
const timedScoringModes: ScoringMode[] = ['average-time', 'best-time', 'total-time']
const pointsScoringModes: ScoringMode[] = ['points-high', 'points-low']

function defaultScoringMode(format: RaceFormat): ScoringMode {
  if (format === 'points-heats') return 'points-high'
  if (format === 'round-robin') return 'round-robin-record'
  if (isEliminationFormat(format)) return 'elimination'
  return 'average-time'
}

function scoringOptions(format: RaceFormat): ScoringMode[] {
  if (format === 'timed-heats') return timedScoringModes
  if (format === 'points-heats') return pointsScoringModes
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

function FormatOptions() {
  return raceFormats.map((format) => <option key={format} value={format}>{formatStatus(format)}</option>)
}

function ScoringOptions({ modes }: { modes: ScoringMode[] }) {
  return modes.map((mode) => <option key={mode} value={mode}>{formatStatus(mode)}</option>)
}

function DivisionRow({ division, actions, requestConfirmation }: {
  division: Division
  actions: SectionProps['actions']
  requestConfirmation: SectionProps['requestConfirmation']
}) {
  const [name, setName] = useState(division.name)

  useEffect(() => setName(division.name), [division.name])

  const removeDivision = () => {
    requestConfirmation({
      title: 'Delete division',
      message: `Delete ${division.name}? A division in use by a racer or race cannot be deleted.`,
      confirmLabel: 'Delete Division',
      destructive: true,
      onConfirm: () => actions.deleteDivision(division.id)
    })
  }

  return (
    <div className="division-management-row">
      <span className="division-management-label">Division</span>
      <input aria-label={`${division.name} division name`} value={name} onChange={(event) => setName(event.target.value)} />
      <div className="division-management-actions">
        <button className="mini-action" disabled={!name.trim()} onClick={() => void actions.updateDivision(division.id, { name })} type="button">
          <Save aria-hidden="true" size={14} />
          <span>Save</span>
        </button>
        <button className="division-delete-action" onClick={removeDivision} type="button">
          <Trash2 aria-hidden="true" size={14} />
          <span>Delete</span>
        </button>
      </div>
    </div>
  )
}

type RaceEditorMode = 'create' | 'edit'

export function EventSetup({ event, currentRace, actions, selectedRaceId, setSelectedRaceId, requestConfirmation }: SectionProps) {
  const [newDivisionName, setNewDivisionName] = useState('')
  const [editorMode, setEditorMode] = useState<RaceEditorMode>(event?.races.length ? 'edit' : 'create')
  const suggestedRaceName = suggestedUniqueName('Main Tournament', event?.races.map((race) => race.name) ?? [])
  const [raceName, setRaceName] = useState(suggestedRaceName)
  const [raceDivisionId, setRaceDivisionId] = useState(event?.divisions[0]?.id ?? '')
  const [raceFormat, setRaceFormat] = useState<RaceFormat>('timed-heats')
  const [raceLaneCount, setRaceLaneCount] = useState(3)
  const [raceRounds, setRaceRounds] = useState(3)
  const [raceScoringMode, setRaceScoringMode] = useState<ScoringMode>('average-time')
  const [editRaceName, setEditRaceName] = useState(currentRace?.name ?? '')
  const [editRaceFormat, setEditRaceFormat] = useState<RaceFormat>(currentRace?.format ?? 'timed-heats')
  const [editLaneCount, setEditLaneCount] = useState(currentRace?.laneCount ?? 3)
  const [editRaceRounds, setEditRaceRounds] = useState(currentRace?.roundsPerRacer ?? 3)
  const [editScoringMode, setEditScoringMode] = useState<ScoringMode>(currentRace?.scoringMode ?? 'average-time')
  const [editDropWorstTime, setEditDropWorstTime] = useState(currentRace?.dropWorstTime ?? false)
  const [avoidSameLane, setAvoidSameLane] = useState(currentRace?.schedulingOptions?.avoidSameLane ?? true)
  const [avoidSameOpponents, setAvoidSameOpponents] = useState(currentRace?.schedulingOptions?.avoidSameOpponents ?? true)
  const [fillPartialHeats, setFillPartialHeats] = useState(currentRace?.schedulingOptions?.fillPartialHeats ?? true)
  const [usesSource, setUsesSource] = useState(Boolean(currentRace?.source))
  const [sourceRaceId, setSourceRaceId] = useState(currentRace?.source?.sourceRaceId ?? '')
  const [sourceTopCount, setSourceTopCount] = useState(currentRace?.source?.topCount ?? 8)
  const [editDivisionId, setEditDivisionId] = useState(currentRace?.divisionId ?? '')

  useEffect(() => {
    if (event?.divisions[0] && !event.divisions.some((division) => division.id === raceDivisionId)) {
      setRaceDivisionId(event.divisions[0].id)
    }
  }, [event?.id, event?.divisions, raceDivisionId])

  useEffect(() => setRaceName(suggestedRaceName), [event?.id, suggestedRaceName])

  useEffect(() => {
    setEditorMode(event?.races.length ? 'edit' : 'create')
  }, [event?.id])

  useEffect(() => {
    if (!event?.races.length) setEditorMode('create')
  }, [event?.id, event?.races.length])

  useEffect(() => {
    if (!currentRace) return
    setEditRaceName(currentRace.name)
    setEditRaceFormat(currentRace.format)
    setEditLaneCount(currentRace.laneCount)
    setEditRaceRounds(currentRace.roundsPerRacer)
    setEditScoringMode(currentRace.scoringMode)
    setEditDropWorstTime(currentRace.dropWorstTime ?? false)
    setAvoidSameLane(currentRace.schedulingOptions?.avoidSameLane ?? true)
    setAvoidSameOpponents(currentRace.schedulingOptions?.avoidSameOpponents ?? true)
    setFillPartialHeats(currentRace.schedulingOptions?.fillPartialHeats ?? true)
    setUsesSource(Boolean(currentRace.source))
    setSourceRaceId(currentRace.source?.sourceRaceId ?? '')
    setSourceTopCount(currentRace.source?.topCount ?? 8)
    setEditDivisionId(event ? getRaceDivision(event, currentRace)?.id ?? event.divisions[0]?.id ?? '' : '')
  }, [currentRace, event])

  const sourceRaceOptions = useMemo(
    () => event?.races.filter((race) => race.id !== currentRace?.id) ?? [],
    [event, currentRace]
  )
  const selectedSourceRace = sourceRaceOptions.find((race) => race.id === sourceRaceId)
  const inheritedDivision = event ? getRaceDivision(event, selectedSourceRace) : undefined
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

  const submitDivision = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!newDivisionName.trim()) return
    void actions.addDivision({ name: newDivisionName })
    setNewDivisionName('')
  }

  const submitRace = async (formEvent: FormEvent) => {
    formEvent.preventDefault()
    const nextSession = await actions.createRace({
      name: raceName,
      format: raceFormat,
      laneCount: raceLaneCount,
      roundsPerRacer: createSupportsRuns ? raceRounds : 1,
      scoringMode: selectedScoringMode(raceFormat, raceScoringMode),
      dropWorstTime: false,
      divisionId: raceDivisionId,
      schedulingOptions: { avoidSameLane: true, avoidSameOpponents: true, fillPartialHeats: true }
    })
    const nextEvent = nextSession?.event
    const createdRace = nextEvent?.races[nextEvent.races.length - 1]
    if (createdRace && nextEvent) {
      setSelectedRaceId(createdRace.id)
      setEditorMode('edit')
      setRaceName(suggestedUniqueName('Main Tournament', nextEvent.races.map((race) => race.name)))
    }
  }

  const submitRaceSettings = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!currentRace) return

    const input = {
      name: editRaceName,
      format: editRaceFormat,
      laneCount: editLaneCount,
      roundsPerRacer: editSupportsRuns ? editRaceRounds : 1,
      scoringMode: selectedScoringMode(editRaceFormat, editScoringMode),
      dropWorstTime: editRaceFormat === 'timed-heats' && editScoringMode === 'average-time' && editDropWorstTime,
      schedulingOptions: { avoidSameLane, avoidSameOpponents, fillPartialHeats },
      source: usesSource && sourceRaceId ? { sourceRaceId, topCount: sourceTopCount } : undefined,
      divisionId: usesSource ? undefined : editDivisionId
    }
    const structuralInput = {
      format: input.format,
      laneCount: input.laneCount,
      roundsPerRacer: input.roundsPerRacer,
      scoringMode: input.scoringMode,
      dropWorstTime: input.dropWorstTime,
      schedulingOptions: input.schedulingOptions,
      source: input.source,
      divisionId: input.divisionId
    }
    const structuralCurrent = {
      format: currentRace.format,
      laneCount: currentRace.laneCount,
      roundsPerRacer: currentRace.roundsPerRacer,
      scoringMode: currentRace.scoringMode,
      dropWorstTime: currentRace.dropWorstTime,
      schedulingOptions: currentRace.schedulingOptions,
      source: currentRace.source,
      divisionId: currentRace.divisionId
    }
    const structuralChanged = JSON.stringify(structuralInput) !== JSON.stringify(structuralCurrent)

    if (structuralChanged && currentRace.heats.length > 0) {
      requestConfirmation({
        title: 'Regenerate race schedule',
        message: 'Saving these schedule settings will replace every unrecorded heat. Settings are locked if an operator result has already been recorded.',
        confirmLabel: 'Save and Regenerate',
        onConfirm: () => actions.updateRace(currentRace.id, { ...input, confirmRegenerateHeats: true })
      })
      return
    }
    void actions.updateRace(currentRace.id, input)
  }

  const deleteRace = () => {
    if (!currentRace) return
    requestConfirmation({
      title: 'Delete race',
      message: `Delete ${currentRace.name}? This permanently removes its heats and registrations.`,
      confirmLabel: 'Delete Race',
      destructive: true,
      onConfirm: () => actions.deleteRace(currentRace.id)
    })
  }

  const beginRaceCreation = () => {
    setRaceName(suggestedRaceName)
    setEditorMode('create')
  }

  const selectRaceForEditing = (raceId: string) => {
    setSelectedRaceId(raceId)
    setEditorMode('edit')
  }

  if (!event) return <p className="empty-state full-width-message">Create or select an event before race setup.</p>

  return (
    <section className="section-grid setup-grid">
      <div className="race-panel division-management-panel">
        <div className="division-management-header">
          <div className="panel-heading">
            <div><p className="eyebrow">Event divisions</p><h3>{event.divisions.length} configured</h3></div>
            <ListPlus aria-hidden="true" size={24} />
          </div>
          <form className="compact-form division-create-form" onSubmit={submitDivision}>
            <label>
              <span>Add division</span>
              <input placeholder="New division name" value={newDivisionName} onChange={(inputEvent) => setNewDivisionName(inputEvent.target.value)} />
            </label>
            <button className="primary-action" disabled={!newDivisionName.trim()} type="submit"><ListPlus aria-hidden="true" size={18} /><span>Add Division</span></button>
          </form>
        </div>
        <div className="division-management-list">
          {event.divisions.map((division) => <DivisionRow actions={actions} division={division} key={division.id} requestConfirmation={requestConfirmation} />)}
        </div>
      </div>

      <div className="race-panel race-list-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Races</p><h3>{event.races.length} configured</h3></div>
          <button className="primary-action new-race-action" onClick={beginRaceCreation} type="button"><Plus aria-hidden="true" size={18} /><span>New Race</span></button>
        </div>
        {event.races.length > 0 ? <div className="race-list-columns" aria-hidden="true"><span>Race &amp; format</span><span>Entries</span><span>Heats</span></div> : null}
        <div className="stack-list race-list-scroll">
          {event.races.map((race) => (
            <button className="race-selector-card" data-active={editorMode === 'edit' && race.id === selectedRaceId} key={race.id} onClick={() => selectRaceForEditing(race.id)} type="button">
              <Flag aria-hidden="true" size={19} />
              <div className="race-selector-identity"><strong>{race.name}</strong><span>{formatStatus(race.format)}</span></div>
              <strong className="race-selector-count">{race.entries.length}</strong>
              <strong className="race-selector-count">{race.heats.length}</strong>
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          ))}
          {event.races.length === 0 ? <p className="empty-state">Create the first race to define its format and registration roster.</p> : null}
        </div>
      </div>

      <div className="race-panel race-settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Race setup</p>
            <h3>{editorMode === 'create' ? 'Create Race' : currentRace?.name ?? 'No race selected'}</h3>
            <span className="race-editor-summary">{editorMode === 'create' ? 'Configure the race, then add racers from Registration.' : currentRace ? raceSummary(currentRace, event.races) : 'Select a race to edit its rules.'}</span>
          </div>
          {editorMode === 'edit' && currentRace ? <button className="danger-action" onClick={deleteRace} type="button"><Trash2 aria-hidden="true" size={16} /><span>Delete Race</span></button> : null}
        </div>

        {editorMode === 'create' ? (
          <form className="race-editor-form" onSubmit={submitRace}>
            <section className="race-editor-section">
              <h4>Basics</h4>
              <div className="race-editor-fields basics-fields">
                <label><span>Race name</span><input required value={raceName} onChange={(inputEvent) => setRaceName(inputEvent.target.value)} /></label>
                <label><span>Format</span><select value={raceFormat} onChange={(inputEvent) => changeCreateFormat(inputEvent.target.value as RaceFormat)}><FormatOptions /></select></label>
                <label><span>Lanes</span><input min={1} max={12} type="number" value={raceLaneCount} onChange={(inputEvent) => setRaceLaneCount(Number(inputEvent.target.value))} /></label>
                {createSupportsRuns ? <label><span>Runs per racer</span><input min={1} max={24} type="number" value={raceRounds} onChange={(inputEvent) => setRaceRounds(Number(inputEvent.target.value))} /></label> : null}
                {createScoringOptions.length > 0 ? <label><span>Scoring</span><select value={selectedScoringMode(raceFormat, raceScoringMode)} onChange={(inputEvent) => setRaceScoringMode(inputEvent.target.value as ScoringMode)}><ScoringOptions modes={createScoringOptions} /></select></label> : null}
              </div>
            </section>
            <section className="race-editor-section">
              <h4>Eligibility</h4>
              <div className="race-editor-fields"><label><span>Division</span><select required value={raceDivisionId} onChange={(inputEvent) => setRaceDivisionId(inputEvent.target.value)}>{event.divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label></div>
            </section>
            <div className="button-row">
              <button className="primary-action" disabled={!raceName.trim() || !raceDivisionId} type="submit"><ListPlus aria-hidden="true" size={18} /><span>Create Race</span></button>
              {event.races.length > 0 ? <button className="secondary-action" onClick={() => setEditorMode('edit')} type="button">Cancel</button> : null}
            </div>
          </form>
        ) : currentRace ? (
          <form className="race-editor-form" onSubmit={submitRaceSettings}>
            <section className="race-editor-section">
              <h4>Basics</h4>
              <div className="race-editor-fields basics-fields">
                <label><span>Race name</span><input value={editRaceName} onChange={(inputEvent) => setEditRaceName(inputEvent.target.value)} /></label>
                <label><span>Format</span><select value={editRaceFormat} onChange={(inputEvent) => changeEditFormat(inputEvent.target.value as RaceFormat)}><FormatOptions /></select></label>
                <label><span>Lanes</span><input min={1} max={12} type="number" value={editLaneCount} onChange={(inputEvent) => setEditLaneCount(Number(inputEvent.target.value))} /></label>
                {editSupportsRuns ? <label><span>Runs per racer</span><input min={1} max={24} type="number" value={editRaceRounds} onChange={(inputEvent) => setEditRaceRounds(Number(inputEvent.target.value))} /></label> : null}
                {editScoringOptions.length > 0 ? <label><span>Scoring</span><select value={selectedScoringMode(editRaceFormat, editScoringMode)} onChange={(inputEvent) => setEditScoringMode(inputEvent.target.value as ScoringMode)}><ScoringOptions modes={editScoringOptions} /></select></label> : null}
              </div>
            </section>

            <section className="race-editor-section">
              <h4>Eligibility &amp; advancement</h4>
              <div className="race-editor-fields eligibility-fields">
                {usesSource ? <label><span>Division</span><input readOnly value={inheritedDivision ? `${inheritedDivision.name} (inherited)` : 'Select a source race'} /></label> : <label><span>Division</span><select disabled={currentRace.entries.length > 0 || currentRace.heats.length > 0} required value={editDivisionId} onChange={(inputEvent) => setEditDivisionId(inputEvent.target.value)}>{event.divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label>}
                <label className="inline-toggle source-race-toggle"><input type="checkbox" checked={usesSource} onChange={(inputEvent) => setUsesSource(inputEvent.target.checked)} /><span>Populate from another race</span></label>
                {usesSource ? <><label><span>Source race</span><select value={sourceRaceId} onChange={(inputEvent) => setSourceRaceId(inputEvent.target.value)}><option value="">Select source race</option>{sourceRaceOptions.map((race) => <option key={race.id} value={race.id}>{race.name}</option>)}</select></label><label><span>Advance top</span><input min={1} type="number" value={sourceTopCount} onChange={(inputEvent) => setSourceTopCount(Number(inputEvent.target.value))} /></label></> : null}
              </div>
            </section>

            {editSupportsScheduling ? (
              <section className="race-editor-section scheduling-section">
                <h4>Scheduling &amp; scoring options</h4>
                <div className="toggle-grid">
                  <label className="inline-toggle"><input type="checkbox" checked={avoidSameLane} onChange={(inputEvent) => setAvoidSameLane(inputEvent.target.checked)} /><span>Avoid repeated lanes</span></label>
                  <label className="inline-toggle"><input type="checkbox" checked={avoidSameOpponents} onChange={(inputEvent) => setAvoidSameOpponents(inputEvent.target.checked)} /><span>Avoid repeated opponents</span></label>
                  <label className="inline-toggle"><input type="checkbox" checked={fillPartialHeats} onChange={(inputEvent) => setFillPartialHeats(inputEvent.target.checked)} /><span>Fill partial heats</span></label>
                  {editRaceFormat === 'timed-heats' && editScoringMode === 'average-time' ? <label className="inline-toggle drop-worst-toggle"><input checked={editDropWorstTime} onChange={(inputEvent) => setEditDropWorstTime(inputEvent.target.checked)} type="checkbox" /><span>Drop slowest successful time</span></label> : null}
                </div>
              </section>
            ) : null}

            <div className="button-row"><button className="primary-action" disabled={usesSource && !sourceRaceId} type="submit"><Save aria-hidden="true" size={18} /><span>Save Race</span></button></div>
          </form>
        ) : <p className="empty-state">Select a race to edit its rules.</p>}
      </div>
    </section>
  )
}
