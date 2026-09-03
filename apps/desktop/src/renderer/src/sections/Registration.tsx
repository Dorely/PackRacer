import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Save, ShieldCheck, UserPlus } from 'lucide-react'

import type { Division, RaceEntry, Racer } from '@packracer/race-engine'

import { formatStatus } from '../formatters'
import type { SectionProps } from './types'

function parseBulkNames(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

type EntryRowProps = {
  divisions: Division[]
  entry: RaceEntry
  raceDivisionId: string
  raceId: string
  racer: Racer
  actions: SectionProps['actions']
  requestConfirmation: SectionProps['requestConfirmation']
}

function DivisionPicker({
  divisions,
  selectedDivisionIds,
  setSelectedDivisionIds,
  disabledDivisionIds = []
}: {
  divisions: Division[]
  selectedDivisionIds: string[]
  setSelectedDivisionIds: (divisionIds: string[]) => void
  disabledDivisionIds?: string[]
}) {
  const toggleDivision = (divisionId: string) => {
    setSelectedDivisionIds(
      selectedDivisionIds.includes(divisionId)
        ? selectedDivisionIds.filter((selectedDivisionId) => selectedDivisionId !== divisionId)
        : [...selectedDivisionIds, divisionId]
    )
  }

  return (
    <div className="division-picker">
      {divisions.map((division) => (
        <label className="inline-toggle" key={division.id}>
          <input
            checked={selectedDivisionIds.includes(division.id)}
            disabled={disabledDivisionIds.includes(division.id)}
            onChange={() => toggleDivision(division.id)}
            type="checkbox"
          />
          <span>{division.name}</span>
        </label>
      ))}
    </div>
  )
}

function EntryRow({ divisions, entry, raceDivisionId, raceId, racer, actions, requestConfirmation }: EntryRowProps) {
  const [name, setName] = useState(racer.name)
  const [divisionIds, setDivisionIds] = useState(racer.divisionIds)

  useEffect(() => {
    setName(racer.name)
    setDivisionIds(racer.divisionIds)
  }, [racer.name, racer.divisionIds])

  const saveRacer = () => {
    void actions.updateRacer(racer.id, { name, divisionIds })
  }

  const removeEntry = () => {
    requestConfirmation({
      title: 'Remove racer from race',
      message: `Remove ${racer.name} from this race? If heats are already generated, pending heats will need a resolution.`,
      confirmLabel: 'Remove Racer',
      destructive: true,
      onConfirm: () => actions.removeRaceEntry(raceId, entry.id)
    })
  }

  return (
    <tr data-muted={entry.status !== 'active'}>
      <td>
        <strong>#{racer.racerNumber}</strong>
      </td>
      <td>
        <input aria-label="Racer name" value={name} onChange={(event) => setName(event.target.value)} />
      </td>
      <td>
        <details className="division-membership-editor">
          <summary>{divisions.filter((division) => divisionIds.includes(division.id)).map((division) => division.name).join(', ')}</summary>
          <DivisionPicker
            disabledDivisionIds={[raceDivisionId]}
            divisions={divisions}
            selectedDivisionIds={divisionIds}
            setSelectedDivisionIds={setDivisionIds}
          />
        </details>
      </td>
      <td>{formatStatus(entry.status)}</td>
      <td>
        <div className="readiness-actions">
          <button
            aria-pressed={entry.checkedIn}
            className="mini-action readiness-toggle"
            onClick={() => void actions.updateRaceEntry(raceId, entry.id, { checkedIn: !entry.checkedIn })}
            type="button"
          >
            Checked In
          </button>
          <button
            aria-pressed={entry.inspectionPassed}
            className="mini-action readiness-toggle"
            onClick={() => void actions.updateRaceEntry(raceId, entry.id, { inspectionPassed: !entry.inspectionPassed })}
            type="button"
          >
            Inspected
          </button>
        </div>
      </td>
      <td>
        <div className="button-row nowrap">
          <button className="mini-action" onClick={saveRacer} type="button">
            <Save aria-hidden="true" size={14} />
            <span>Save</span>
          </button>
          <button className="danger-action" onClick={removeEntry} type="button">
            <span>Remove</span>
          </button>
        </div>
      </td>
    </tr>
  )
}

export function Registration({ event, actions, selectedRaceId, setSelectedRaceId, requestConfirmation }: SectionProps) {
  const [name, setName] = useState('')
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([])
  const [bulkAddOpen, setBulkAddOpen] = useState(false)
  const [bulkNames, setBulkNames] = useState('')
  const [selectedExistingRacerIds, setSelectedExistingRacerIds] = useState<string[]>([])

  const registrationRaceOptions = useMemo(() => event?.races.filter((race) => !race.source) ?? [], [event])
  const registrationRace = useMemo(
    () => registrationRaceOptions.find((race) => race.id === selectedRaceId) ?? registrationRaceOptions[0] ?? null,
    [registrationRaceOptions, selectedRaceId]
  )
  const registrationLocked = Boolean(
    registrationRace && registrationRace.heats.length > 0 && registrationRace.format !== 'timed-heats' && registrationRace.format !== 'points-heats'
  )
  const racerById = useMemo(() => new Map(event?.racers.map((racer) => [racer.id, racer]) ?? []), [event])
  const registeredRacerIds = useMemo(() => new Set(registrationRace?.entries?.map((entry) => entry.racerId) ?? []), [registrationRace])
  const availableRacers = useMemo(
    () =>
      event?.racers.filter(
        (racer) =>
          racer.status === 'active' &&
          Boolean(registrationRace?.divisionId && racer.divisionIds.includes(registrationRace.divisionId)) &&
          !registeredRacerIds.has(racer.id)
      ) ?? [],
    [event, registeredRacerIds, registrationRace?.divisionId]
  )
  const availableRacerIds = useMemo(() => new Set(availableRacers.map((racer) => racer.id)), [availableRacers])
  const parsedBulkNames = useMemo(() => parseBulkNames(bulkNames), [bulkNames])

  useEffect(() => {
    if (registrationRace && registrationRace.id !== selectedRaceId) {
      setSelectedRaceId(registrationRace.id)
    }
  }, [registrationRace, selectedRaceId, setSelectedRaceId])

  useEffect(() => {
    setBulkNames('')
    setSelectedExistingRacerIds([])
    setSelectedDivisionIds(registrationRace?.divisionId ? [registrationRace.divisionId] : [])
  }, [registrationRace?.id, registrationRace?.divisionId])

  useEffect(() => {
    setSelectedExistingRacerIds((previousIds) => previousIds.filter((racerId) => availableRacerIds.has(racerId)))
  }, [availableRacerIds])

  const submitRacer = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!registrationRace || selectedDivisionIds.length === 0) {
      return
    }

    void actions.addRacer({ name, divisionIds: selectedDivisionIds, vehicleName: '', checkedIn: true, inspectionPassed: true })
    setName('')
  }

  const submitBulkRacers = async (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!registrationRace || parsedBulkNames.length === 0 || selectedDivisionIds.length === 0) {
      return
    }

    for (const bulkName of parsedBulkNames) {
      await actions.addRacer({
        name: bulkName,
        divisionIds: selectedDivisionIds,
        vehicleName: '',
        checkedIn: true,
        inspectionPassed: true
      })
    }

    setBulkNames('')
  }

  const toggleExistingRacer = (racerId: string) => {
    setSelectedExistingRacerIds((previousIds) =>
      previousIds.includes(racerId)
        ? previousIds.filter((selectedRacerId) => selectedRacerId !== racerId)
        : [...previousIds, racerId]
    )
  }

  const submitExisting = async (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!registrationRace || selectedExistingRacerIds.length === 0 || registrationLocked) {
      return
    }

    await actions.addRaceEntries(registrationRace.id, {
      racerIds: selectedExistingRacerIds,
      checkedIn: true,
      inspectionPassed: true
    })

    setSelectedExistingRacerIds([])
  }

  const addAllEligible = () => {
    if (!registrationRace || availableRacers.length === 0 || registrationLocked) {
      return
    }

    void actions.addRaceEntries(registrationRace.id, {
      racerIds: availableRacers.map((racer) => racer.id),
      checkedIn: true,
      inspectionPassed: true
    })
  }

  if (!event) {
    return <p className="empty-state full-width-message">Create or select an event to begin registration.</p>
  }

  if (!registrationRace) {
    return <p className="empty-state full-width-message">Add a manually registered race before registering racers.</p>
  }

  return (
    <section className="section-grid registration-grid">
      <div className="race-panel form-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Registration</p>
            <h3>{registrationRace.name}</h3>
          </div>
          <UserPlus aria-hidden="true" size={24} />
        </div>

        <label>
          <span>Race</span>
          <select value={registrationRace.id} onChange={(inputEvent) => setSelectedRaceId(inputEvent.target.value)}>
            {registrationRaceOptions.map((race) => (
              <option key={race.id} value={race.id}>
                {race.name}
              </option>
            ))}
          </select>
        </label>

        {registrationLocked ? (
          <p className="empty-state">This race format cannot accept more race entries after heats are generated. You can still create racers.</p>
        ) : null}

        <fieldset className="division-fieldset">
          <legend>Racer divisions</legend>
          <DivisionPicker
            divisions={event.divisions}
            selectedDivisionIds={selectedDivisionIds}
            setSelectedDivisionIds={setSelectedDivisionIds}
          />
        </fieldset>

        <form className="form-grid" onSubmit={submitRacer}>
          <label>
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>

          <button className="primary-action" disabled={selectedDivisionIds.length === 0} type="submit">
            <UserPlus aria-hidden="true" size={18} />
            <span>Create Racer</span>
          </button>
        </form>

        <div className="registration-bulk-panel">
          <button className="secondary-action" onClick={() => setBulkAddOpen((isOpen) => !isOpen)} type="button">
            {bulkAddOpen ? 'Hide Bulk Add' : 'Bulk Add'}
          </button>

          {bulkAddOpen ? (
            <form className="form-grid" onSubmit={(formEvent) => void submitBulkRacers(formEvent)}>
              <label>
                <span>Names</span>
                <textarea
                  onChange={(event) => setBulkNames(event.target.value)}
                  placeholder="Alex Rivera, Jordan Lee"
                  rows={7}
                  value={bulkNames}
                />
              </label>

              <button className="primary-action" disabled={parsedBulkNames.length === 0 || selectedDivisionIds.length === 0} type="submit">
                <UserPlus aria-hidden="true" size={18} />
                <span>
                  {parsedBulkNames.length === 1
                    ? 'Create 1 Racer'
                    : parsedBulkNames.length > 1
                      ? `Create ${parsedBulkNames.length} Racers`
                      : 'Create Racers'}
                </span>
              </button>
            </form>
          ) : null}
        </div>

        <form className="form-grid" onSubmit={(formEvent) => void submitExisting(formEvent)}>
          <div className="registration-existing-heading">
            <span>Eligible racers not yet added</span>
            <div className="button-row">
              <button
                className="mini-action"
                disabled={registrationLocked || availableRacers.length === 0}
                onClick={addAllEligible}
                type="button"
              >
                Add All Eligible ({availableRacers.length})
              </button>
              <button
                className="mini-action"
                disabled={registrationLocked || availableRacers.length === 0}
                onClick={() => setSelectedExistingRacerIds(availableRacers.map((racer) => racer.id))}
                type="button"
              >
                Select All
              </button>
              <button
                className="mini-action"
                disabled={registrationLocked || selectedExistingRacerIds.length === 0}
                onClick={() => setSelectedExistingRacerIds([])}
                type="button"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="existing-racer-list">
            {availableRacers.map((racer) => (
              <label className="inline-toggle" key={racer.id}>
                <input
                  checked={selectedExistingRacerIds.includes(racer.id)}
                  disabled={registrationLocked}
                  onChange={() => toggleExistingRacer(racer.id)}
                  type="checkbox"
                />
                <span>
                  #{racer.racerNumber} {racer.name}
                </span>
              </label>
            ))}
            {availableRacers.length === 0 ? <p className="empty-state">Every eligible racer is already assigned to this race.</p> : null}
          </div>

          <button className="secondary-action" disabled={selectedExistingRacerIds.length === 0 || registrationLocked} type="submit">
            Add Selected ({selectedExistingRacerIds.length})
          </button>
        </form>
      </div>

      <div className="race-panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Race roster</p>
            <h3>{registrationRace.entries?.length ?? 0} registered</h3>
          </div>
          <ShieldCheck aria-hidden="true" size={24} />
        </div>

        {event.activeRemovalImpact ? (
          <div className="decision-panel">
            <strong>Resolve scratched racer schedule</strong>
            <span>
              {event.activeRemovalImpact.racerName} affected {event.activeRemovalImpact.affectedHeatIds.length} pending heat(s).
            </span>
            <div className="button-row">
              <button className="secondary-action" onClick={() => void actions.resolveRacerRemoval('keep-empty-lanes')} type="button">
                Keep Empty Lanes
              </button>
              <button className="secondary-action" onClick={() => void actions.resolveRacerRemoval('regenerate-pending')} type="button">
                Regenerate Pending
              </button>
            </div>
          </div>
        ) : null}

        <div className="data-table-wrap">
          <table className="data-table registration-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Racer</th>
                <th>Divisions</th>
                <th>Status</th>
                <th>Ready</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {registrationRace.entries?.map((entry) => {
                const racer = racerById.get(entry.racerId)

                return racer ? (
                  <EntryRow
                    actions={actions}
                    divisions={event.divisions}
                    entry={entry}
                    key={entry.id}
                    raceDivisionId={registrationRace.divisionId as string}
                    raceId={registrationRace.id}
                    racer={racer}
                    requestConfirmation={requestConfirmation}
                  />
                ) : null
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
