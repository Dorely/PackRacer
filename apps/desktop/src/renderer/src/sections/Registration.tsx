import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Save, ShieldCheck, UserPlus } from 'lucide-react'

import type { RaceEntry, Racer } from '@packracer/race-engine'

import { formatStatus } from '../formatters'
import type { SectionProps } from './types'

type EntryRowProps = {
  entry: RaceEntry
  raceId: string
  racer: Racer
  actions: SectionProps['actions']
  requestConfirmation: SectionProps['requestConfirmation']
}

function EntryRow({ entry, raceId, racer, actions, requestConfirmation }: EntryRowProps) {
  const [name, setName] = useState(racer.name)

  const saveRacer = () => {
    void actions.updateRacer(racer.id, { name })
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
      <td>{formatStatus(entry.status)}</td>
      <td>
        <button
          className="mini-action"
          onClick={() => void actions.updateRaceEntry(raceId, entry.id, { checkedIn: !entry.checkedIn })}
          type="button"
        >
          {entry.checkedIn ? 'Checked In' : 'Check In'}
        </button>
        <button
          className="mini-action"
          onClick={() => void actions.updateRaceEntry(raceId, entry.id, { inspectionPassed: !entry.inspectionPassed })}
          type="button"
        >
          {entry.inspectionPassed ? 'Inspected' : 'Inspect'}
        </button>
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
  const [existingRacerId, setExistingRacerId] = useState('')

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
    () => event?.racers.filter((racer) => racer.status === 'active' && !registeredRacerIds.has(racer.id)) ?? [],
    [event, registeredRacerIds]
  )

  useEffect(() => {
    if (registrationRace && registrationRace.id !== selectedRaceId) {
      setSelectedRaceId(registrationRace.id)
    }
  }, [registrationRace, selectedRaceId, setSelectedRaceId])

  const submitRacer = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!registrationRace || registrationLocked) {
      return
    }

    void actions.registerRacerForRace(registrationRace.id, { name, division: 'Open', vehicleName: '', checkedIn: true, inspectionPassed: true })
    setName('')
  }

  const submitExisting = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!registrationRace || !existingRacerId || registrationLocked) {
      return
    }

    void actions.addRaceEntry(registrationRace.id, { racerId: existingRacerId, checkedIn: true, inspectionPassed: true })
    setExistingRacerId('')
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
          <p className="empty-state">This race format cannot accept new racers after heats are generated.</p>
        ) : null}

        <form className="form-grid" onSubmit={submitRacer}>
          <label>
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} disabled={registrationLocked} required />
          </label>

          <button className="primary-action" disabled={registrationLocked} type="submit">
            <UserPlus aria-hidden="true" size={18} />
            <span>Create And Register</span>
          </button>
        </form>

        <form className="form-grid" onSubmit={submitExisting}>
          <label>
            <span>Existing racer</span>
            <select value={existingRacerId} onChange={(event) => setExistingRacerId(event.target.value)} disabled={registrationLocked}>
              <option value="">Select racer</option>
              {availableRacers.map((racer) => (
                <option key={racer.id} value={racer.id}>
                  #{racer.racerNumber} {racer.name}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-action" disabled={!existingRacerId || registrationLocked} type="submit">
            Add To Race
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
                    entry={entry}
                    key={entry.id}
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
