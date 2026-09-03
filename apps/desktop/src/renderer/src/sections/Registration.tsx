import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Save, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'

import {
  getRacerDeletionStatus,
  sortRacers,
  type Division,
  type RaceEntry,
  type RaceEvent,
  type Racer,
  type RacerDeletionStatus
} from '@packracer/race-engine'

import { formatStatus } from '../formatters'
import type { SectionProps } from './types'

function parseBulkNames(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function DivisionPicker({
  divisions,
  selectedDivisionIds,
  setSelectedDivisionIds,
  disabledDivisionIds = [],
  disabledReason
}: {
  divisions: Division[]
  selectedDivisionIds: string[]
  setSelectedDivisionIds: (divisionIds: string[]) => void
  disabledDivisionIds?: string[]
  disabledReason?: (division: Division) => string | undefined
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
      {divisions.map((division) => {
        const isDisabled = disabledDivisionIds.includes(division.id)

        return (
          <label className="inline-toggle" data-locked={isDisabled || undefined} key={division.id} title={disabledReason?.(division)}>
            <input
              checked={selectedDivisionIds.includes(division.id)}
              disabled={isDisabled}
              onChange={() => toggleDivision(division.id)}
              type="checkbox"
            />
            <span>{division.name}</span>
          </label>
        )
      })}
    </div>
  )
}

type RaceEntryRowProps = {
  entry: RaceEntry
  raceId: string
  racer: Racer
  actions: SectionProps['actions']
  requestConfirmation: SectionProps['requestConfirmation']
}

function RaceEntryRow({ entry, raceId, racer, actions, requestConfirmation }: RaceEntryRowProps) {
  const [name, setName] = useState(racer.name)

  useEffect(() => {
    setName(racer.name)
  }, [racer.name])

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
      <td><strong>#{racer.racerNumber}</strong></td>
      <td>
        <input aria-label={`Name for racer ${racer.racerNumber}`} value={name} onChange={(inputEvent) => setName(inputEvent.target.value)} />
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
          <button
            className="mini-action"
            disabled={!name.trim() || name.trim() === racer.name}
            onClick={() => void actions.updateRacer(racer.id, { name })}
            type="button"
          >
            <Save aria-hidden="true" size={14} />
            <span>Save</span>
          </button>
          <button className="danger-action" onClick={removeEntry} type="button"><span>Remove</span></button>
        </div>
      </td>
    </tr>
  )
}

type FullRosterRowProps = {
  actions: SectionProps['actions']
  deletionStatus: RacerDeletionStatus
  event: RaceEvent
  racer: Racer
  requestConfirmation: SectionProps['requestConfirmation']
}

function FullRosterRow({ actions, deletionStatus, event, racer, requestConfirmation }: FullRosterRowProps) {
  const [racerNumber, setRacerNumber] = useState(racer.racerNumber)
  const [name, setName] = useState(racer.name)
  const [divisionIds, setDivisionIds] = useState(racer.divisionIds)
  const assignedRaces = event.races.filter((race) => deletionStatus.assignedRaceIds.includes(race.id))
  const blockingRaces = event.races.filter((race) => deletionStatus.blockingRaceIds.includes(race.id))
  const requiredDivisionIds = event.races
    .filter(
      (race) =>
        !race.source &&
        Boolean(race.divisionId) &&
        race.entries.some((entry) => entry.racerId === racer.id)
    )
    .map((race) => race.divisionId as string)
  const finalDivisionId = divisionIds.length === 1 ? divisionIds[0] : undefined
  const disabledDivisionIds = [...new Set([...requiredDivisionIds, ...(finalDivisionId ? [finalDivisionId] : [])])]
  const identityChanged = racerNumber.trim() !== racer.racerNumber || name.trim() !== racer.name

  useEffect(() => {
    setRacerNumber(racer.racerNumber)
    setName(racer.name)
    setDivisionIds(racer.divisionIds)
  }, [racer.divisionIds, racer.name, racer.racerNumber])

  const divisionLockReason = (division: Division) => {
    if (requiredDivisionIds.includes(division.id)) {
      const raceNames = event.races
        .filter(
          (race) =>
            !race.source &&
            race.divisionId === division.id &&
            race.entries.some((entry) => entry.racerId === racer.id)
        )
        .map((race) => race.name)
      return `Remove this racer from ${raceNames.join(', ')} before removing this division.`
    }

    if (finalDivisionId === division.id) {
      return 'Every racer must belong to at least one division.'
    }

    return undefined
  }

  const deleteRacer = () => {
    const raceSummary = assignedRaces.length > 0
      ? ` This will also remove the racer from: ${assignedRaces.map((race) => race.name).join(', ')}.`
      : ' This racer is not assigned to any race.'

    requestConfirmation({
      title: `Delete ${racer.name}?`,
      message: `Permanently delete #${racer.racerNumber} ${racer.name} from the event?${raceSummary}`,
      confirmLabel: `Delete ${racer.name}`,
      destructive: true,
      onConfirm: () => actions.deleteRacer(racer.id)
    })
  }

  return (
    <tr data-muted={racer.status !== 'active'}>
      <td>
        <div className="full-roster-identity">
          <label className="full-roster-number-field">
            <span aria-hidden="true">#</span>
            <input
              aria-label={`Number for ${racer.name}`}
              className="racer-number-input"
              onChange={(inputEvent) => setRacerNumber(inputEvent.target.value)}
              value={racerNumber}
            />
          </label>
          <input aria-label={`Name for racer ${racer.racerNumber}`} value={name} onChange={(inputEvent) => setName(inputEvent.target.value)} />
        </div>
        <div className="full-roster-context">
          <span>{formatStatus(racer.status)}</span>
          <span>{assignedRaces.length > 0 ? assignedRaces.map((race) => race.name).join(', ') : 'Not assigned to a race'}</span>
        </div>
      </td>
      <td>
        <DivisionPicker
          disabledDivisionIds={disabledDivisionIds}
          disabledReason={divisionLockReason}
          divisions={event.divisions}
          selectedDivisionIds={divisionIds}
          setSelectedDivisionIds={(nextDivisionIds) => {
            setDivisionIds(nextDivisionIds)
            void actions.updateRacer(racer.id, { divisionIds: nextDivisionIds })
          }}
        />
      </td>
      <td>
        <div className="full-roster-actions">
          <button
            className="mini-action"
            disabled={!identityChanged || !racerNumber.trim() || !name.trim()}
            onClick={() => void actions.updateRacer(racer.id, { racerNumber, name })}
            type="button"
          >
            <Save aria-hidden="true" size={14} />
            <span>Save</span>
          </button>
          <button
            className="danger-action"
            disabled={!deletionStatus.canDelete}
            onClick={deleteRacer}
            title={deletionStatus.canDelete ? `Permanently delete ${racer.name}` : `Scheduled in ${blockingRaces.map((race) => race.name).join(', ')}; use race removal and scratch instead.`}
            type="button"
          >
            <Trash2 aria-hidden="true" size={14} />
            <span>Delete</span>
          </button>
          {!deletionStatus.canDelete ? <small>Use race removal / scratch</small> : null}
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
  const [rosterView, setRosterView] = useState<'race' | 'full'>('race')
  const [rosterSearch, setRosterSearch] = useState('')
  const [rosterDivisionId, setRosterDivisionId] = useState('')

  const registrationRaceOptions = useMemo(() => event?.races.filter((race) => !race.source) ?? [], [event])
  const registrationRace = useMemo(
    () => registrationRaceOptions.find((race) => race.id === selectedRaceId) ?? registrationRaceOptions[0] ?? null,
    [registrationRaceOptions, selectedRaceId]
  )
  const registrationLocked = Boolean(
    registrationRace && registrationRace.heats.length > 0 && registrationRace.format !== 'timed-heats' && registrationRace.format !== 'points-heats'
  )
  const racerById = useMemo(() => new Map(event?.racers.map((racer) => [racer.id, racer]) ?? []), [event])
  const registeredRacerIds = useMemo(() => new Set(registrationRace?.entries.map((entry) => entry.racerId) ?? []), [registrationRace])
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
  const fullRoster = useMemo(() => {
    const search = rosterSearch.trim().toLocaleLowerCase()

    return sortRacers(
      event?.racers.filter(
        (racer) =>
          (!rosterDivisionId || racer.divisionIds.includes(rosterDivisionId)) &&
          (!search || `${racer.racerNumber} ${racer.name}`.toLocaleLowerCase().includes(search))
      ) ?? []
    )
  }, [event, rosterDivisionId, rosterSearch])
  const deletionStatuses = useMemo(
    () => new Map(event?.racers.map((racer) => [racer.id, getRacerDeletionStatus(event, racer.id)]) ?? []),
    [event]
  )

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

  useEffect(() => {
    if (rosterDivisionId && !event?.divisions.some((division) => division.id === rosterDivisionId)) {
      setRosterDivisionId('')
    }
  }, [event, rosterDivisionId])

  const submitRacer = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!registrationRace || selectedDivisionIds.length === 0) return

    void actions.addRacer({ name, divisionIds: selectedDivisionIds, vehicleName: '', checkedIn: true, inspectionPassed: true })
    setName('')
  }

  const submitBulkRacers = async (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!registrationRace || parsedBulkNames.length === 0 || selectedDivisionIds.length === 0) return

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

    if (!registrationRace || selectedExistingRacerIds.length === 0 || registrationLocked) return

    await actions.addRaceEntries(registrationRace.id, {
      racerIds: selectedExistingRacerIds,
      checkedIn: true,
      inspectionPassed: true
    })
    setSelectedExistingRacerIds([])
  }

  const addAllEligible = () => {
    if (!registrationRace || availableRacers.length === 0 || registrationLocked) return

    void actions.addRaceEntries(registrationRace.id, {
      racerIds: availableRacers.map((racer) => racer.id),
      checkedIn: true,
      inspectionPassed: true
    })
  }

  if (!event) {
    return <p className="empty-state full-width-message">Create or select an event to begin registration.</p>
  }

  return (
    <section className="section-grid registration-grid">
      <div className="race-panel form-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Registration</p>
            <h3>{registrationRace?.name ?? 'No direct race'}</h3>
          </div>
          <UserPlus aria-hidden="true" size={24} />
        </div>

        {registrationRace ? (
          <>
            <label>
              <span>Race</span>
              <select value={registrationRace.id} onChange={(inputEvent) => setSelectedRaceId(inputEvent.target.value)}>
                {registrationRaceOptions.map((race) => <option key={race.id} value={race.id}>{race.name}</option>)}
              </select>
            </label>

            {registrationLocked ? (
              <p className="empty-state">This race format cannot accept more race entries after heats are generated. You can still create racers.</p>
            ) : null}

            <fieldset className="division-fieldset">
              <legend>Racer divisions</legend>
              <DivisionPicker divisions={event.divisions} selectedDivisionIds={selectedDivisionIds} setSelectedDivisionIds={setSelectedDivisionIds} />
            </fieldset>

            <form className="form-grid" onSubmit={submitRacer}>
              <label>
                <span>Name</span>
                <input value={name} onChange={(inputEvent) => setName(inputEvent.target.value)} required />
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
                      onChange={(inputEvent) => setBulkNames(inputEvent.target.value)}
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
                  <button className="mini-action" disabled={registrationLocked || availableRacers.length === 0} onClick={addAllEligible} type="button">
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
                    <input checked={selectedExistingRacerIds.includes(racer.id)} disabled={registrationLocked} onChange={() => toggleExistingRacer(racer.id)} type="checkbox" />
                    <span>#{racer.racerNumber} {racer.name}</span>
                  </label>
                ))}
                {availableRacers.length === 0 ? <p className="empty-state">Every eligible racer is already assigned to this race.</p> : null}
              </div>

              <button className="secondary-action" disabled={selectedExistingRacerIds.length === 0 || registrationLocked} type="submit">
                Add Selected ({selectedExistingRacerIds.length})
              </button>
            </form>
          </>
        ) : (
          <p className="empty-state">Add a manually registered race before creating racers or assigning them to a race.</p>
        )}
      </div>

      <div className="race-panel table-panel registration-roster-panel">
        <div className="registration-roster-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{rosterView === 'race' ? 'Race roster' : 'Event roster'}</p>
              <h3>{rosterView === 'race' ? `${registrationRace?.entries.length ?? 0} registered` : `${event.racers.length} racers`}</h3>
            </div>
            {rosterView === 'race' ? <ShieldCheck aria-hidden="true" size={24} /> : <Users aria-hidden="true" size={24} />}
          </div>

          <div aria-label="Roster view" className="roster-view-tabs" role="tablist">
            <button aria-controls="race-roster-panel" aria-selected={rosterView === 'race'} id="race-roster-tab" onClick={() => setRosterView('race')} role="tab" type="button">
              Race Roster
            </button>
            <button aria-controls="full-roster-panel" aria-selected={rosterView === 'full'} id="full-roster-tab" onClick={() => setRosterView('full')} role="tab" type="button">
              Full Roster
            </button>
          </div>
        </div>

        {event.activeRemovalImpact ? (
          <div className="decision-panel">
            <strong>Resolve scratched racer schedule</strong>
            <span>{event.activeRemovalImpact.racerName} affected {event.activeRemovalImpact.affectedHeatIds.length} pending heat(s).</span>
            <div className="button-row">
              <button className="secondary-action" onClick={() => void actions.resolveRacerRemoval('keep-empty-lanes')} type="button">Keep Empty Lanes</button>
              <button className="secondary-action" onClick={() => void actions.resolveRacerRemoval('regenerate-pending')} type="button">Regenerate Pending</button>
            </div>
          </div>
        ) : null}

        {rosterView === 'race' ? (
          <div aria-labelledby="race-roster-tab" id="race-roster-panel" role="tabpanel">
            <div className="data-table-wrap">
              <table className="data-table registration-table race-roster-table">
                <thead><tr><th>#</th><th>Racer</th><th>Status</th><th>Ready</th><th>Actions</th></tr></thead>
                <tbody>
                  {registrationRace?.entries.map((entry) => {
                    const racer = racerById.get(entry.racerId)
                    return racer ? (
                      <RaceEntryRow actions={actions} entry={entry} key={entry.id} raceId={registrationRace.id} racer={racer} requestConfirmation={requestConfirmation} />
                    ) : null
                  })}
                  {!registrationRace || registrationRace.entries.length === 0 ? (
                    <tr><td className="table-empty-state" colSpan={5}>No racers are assigned to this race yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div aria-labelledby="full-roster-tab" className="full-roster-view" id="full-roster-panel" role="tabpanel">
            <div className="roster-filter-bar">
              <label>
                <span>Search racers</span>
                <input onChange={(inputEvent) => setRosterSearch(inputEvent.target.value)} placeholder="Name or racer number" type="search" value={rosterSearch} />
              </label>
              <label>
                <span>Division</span>
                <select value={rosterDivisionId} onChange={(inputEvent) => setRosterDivisionId(inputEvent.target.value)}>
                  <option value="">All divisions</option>
                  {event.divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
                </select>
              </label>
              <span className="filter-result-count">Showing {fullRoster.length} of {event.racers.length}</span>
            </div>

            <div className="data-table-wrap">
              <table className="data-table registration-table full-roster-table">
                <thead><tr><th>Racer</th><th>Divisions</th><th>Actions</th></tr></thead>
                <tbody>
                  {fullRoster.map((racer) => (
                    <FullRosterRow
                      actions={actions}
                      deletionStatus={deletionStatuses.get(racer.id) as RacerDeletionStatus}
                      event={event}
                      key={racer.id}
                      racer={racer}
                      requestConfirmation={requestConfirmation}
                    />
                  ))}
                  {fullRoster.length === 0 ? (
                    <tr><td className="table-empty-state" colSpan={3}>{event.racers.length === 0 ? 'No racers have been created yet.' : 'No racers match these filters.'}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
