import { FormEvent, useMemo, useState } from 'react'
import { Save, ShieldCheck, Trash2, UserMinus, UserPlus } from 'lucide-react'

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
  const [racerNumber, setRacerNumber] = useState(racer.racerNumber)
  const [name, setName] = useState(racer.name)
  const [division, setDivision] = useState(racer.division)
  const [vehicleName, setVehicleName] = useState(racer.vehicleName)

  const saveRacer = () => {
    void actions.updateRacer(racer.id, { racerNumber, name, division, vehicleName })
  }

  const removeEntry = () => {
    requestConfirmation({
      title: 'Remove racer from race',
      message: `Remove ${racer.name} from this race?`,
      confirmLabel: 'Remove Racer',
      destructive: true,
      onConfirm: () => actions.removeRaceEntry(raceId, entry.id)
    })
  }

  const scratchEntry = () => {
    requestConfirmation({
      title: 'Scratch racer',
      message: `Scratch ${racer.name} from this race? Pending heats will need a resolution.`,
      confirmLabel: 'Scratch Racer',
      destructive: true,
      onConfirm: () => actions.scratchRaceEntry(raceId, entry.id)
    })
  }

  const deleteRacer = () => {
    requestConfirmation({
      title: 'Delete racer',
      message: `Delete ${racer.name} from the event? This removes the racer from every race.`,
      confirmLabel: 'Delete Racer',
      destructive: true,
      onConfirm: () => actions.deleteRacer(racer.id)
    })
  }

  return (
    <tr data-muted={entry.status !== 'active'}>
      <td>
        <input aria-label="Racer number" value={racerNumber} onChange={(event) => setRacerNumber(event.target.value)} />
      </td>
      <td>
        <input aria-label="Racer name" value={name} onChange={(event) => setName(event.target.value)} />
        <input aria-label="Vehicle name" value={vehicleName} onChange={(event) => setVehicleName(event.target.value)} />
      </td>
      <td>
        <input aria-label="Division" value={division} onChange={(event) => setDivision(event.target.value)} />
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
          <button className="danger-action" disabled={entry.status !== 'active'} onClick={scratchEntry} type="button">
            <UserMinus aria-hidden="true" size={16} />
            <span>Scratch</span>
          </button>
          <button className="danger-action" onClick={removeEntry} type="button">
            <span>Remove</span>
          </button>
          <button className="danger-action" onClick={deleteRacer} type="button">
            <Trash2 aria-hidden="true" size={16} />
            <span>Delete</span>
          </button>
        </div>
      </td>
    </tr>
  )
}

export function Registration({ event, currentRace, actions, selectedRaceId, setSelectedRaceId, requestConfirmation }: SectionProps) {
  const [racerNumber, setRacerNumber] = useState('')
  const [name, setName] = useState('')
  const [division, setDivision] = useState('Open')
  const [vehicleName, setVehicleName] = useState('')
  const [existingRacerId, setExistingRacerId] = useState('')

  const racerById = useMemo(() => new Map(event?.racers.map((racer) => [racer.id, racer]) ?? []), [event])
  const registeredRacerIds = useMemo(() => new Set(currentRace?.entries?.map((entry) => entry.racerId) ?? []), [currentRace])
  const availableRacers = useMemo(
    () => event?.racers.filter((racer) => racer.status === 'active' && !registeredRacerIds.has(racer.id)) ?? [],
    [event, registeredRacerIds]
  )
  const divisions = useMemo(() => {
    const knownDivisions = new Set(event?.racers.map((racer) => racer.division) ?? ['Open'])
    knownDivisions.add('Open')
    return [...knownDivisions]
  }, [event])

  const submitRacer = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!currentRace) {
      return
    }

    void actions.registerRacerForRace(currentRace.id, { racerNumber, name, division, vehicleName, checkedIn: true, inspectionPassed: true })
    setRacerNumber('')
    setName('')
    setVehicleName('')
  }

  const submitExisting = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!currentRace || !existingRacerId) {
      return
    }

    void actions.addRaceEntry(currentRace.id, { racerId: existingRacerId, checkedIn: true, inspectionPassed: true })
    setExistingRacerId('')
  }

  if (!event) {
    return <p className="empty-state full-width-message">Create or select an event to begin registration.</p>
  }

  if (!currentRace) {
    return <p className="empty-state full-width-message">Add a race before registering racers.</p>
  }

  return (
    <section className="section-grid registration-grid">
      <div className="race-panel form-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Registration</p>
            <h3>{currentRace.name}</h3>
          </div>
          <UserPlus aria-hidden="true" size={24} />
        </div>

        <label>
          <span>Race</span>
          <select value={selectedRaceId} onChange={(inputEvent) => setSelectedRaceId(inputEvent.target.value)}>
            {event.races.map((race) => (
              <option key={race.id} value={race.id}>
                {race.name}
              </option>
            ))}
          </select>
        </label>

        <form className="form-grid" onSubmit={submitRacer}>
          <div className="form-grid two-column">
            <label>
              <span>Number</span>
              <input value={racerNumber} onChange={(event) => setRacerNumber(event.target.value)} required />
            </label>
            <label>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              <span>Division</span>
              <input list="division-options" value={division} onChange={(event) => setDivision(event.target.value)} />
              <datalist id="division-options">
                {divisions.map((divisionName) => (
                  <option key={divisionName} value={divisionName} />
                ))}
              </datalist>
            </label>
            <label>
              <span>Vehicle</span>
              <input value={vehicleName} onChange={(event) => setVehicleName(event.target.value)} />
            </label>
          </div>

          <button className="primary-action" type="submit">
            <UserPlus aria-hidden="true" size={18} />
            <span>Create And Register</span>
          </button>
        </form>

        <form className="form-grid" onSubmit={submitExisting}>
          <label>
            <span>Existing racer</span>
            <select value={existingRacerId} onChange={(event) => setExistingRacerId(event.target.value)}>
              <option value="">Select racer</option>
              {availableRacers.map((racer) => (
                <option key={racer.id} value={racer.id}>
                  #{racer.racerNumber} {racer.name}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-action" disabled={!existingRacerId} type="submit">
            Add To Race
          </button>
        </form>
      </div>

      <div className="race-panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Race roster</p>
            <h3>{currentRace.entries?.length ?? 0} registered</h3>
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
              <button className="secondary-action" onClick={() => void actions.resolveRacerRemoval('invalidate-pending')} type="button">
                Leave Flagged
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
                <th>Division</th>
                <th>Status</th>
                <th>Ready</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentRace.entries?.map((entry) => {
                const racer = racerById.get(entry.racerId)

                return racer ? (
                  <EntryRow
                    actions={actions}
                    entry={entry}
                    key={entry.id}
                    raceId={currentRace.id}
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