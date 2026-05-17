import { FormEvent, useMemo, useState } from 'react'
import { ShieldCheck, UserMinus, UserPlus } from 'lucide-react'

import { formatStatus } from '../formatters'
import type { SectionProps } from './types'

export function Registration({ project, actions }: SectionProps) {
  const [racerNumber, setRacerNumber] = useState('')
  const [name, setName] = useState('')
  const [division, setDivision] = useState('Open')
  const [vehicleName, setVehicleName] = useState('')

  const divisions = useMemo(() => {
    const knownDivisions = new Set(project?.racers.map((racer) => racer.division) ?? ['Open'])
    knownDivisions.add('Open')
    return [...knownDivisions]
  }, [project])

  const submitRacer = (event: FormEvent) => {
    event.preventDefault()
    void actions.addRacer({ racerNumber, name, division, vehicleName, checkedIn: true, inspectionPassed: true })
    setRacerNumber('')
    setName('')
    setVehicleName('')
  }

  if (!project) {
    return <p className="empty-state full-width-message">Create or open a project to begin registration.</p>
  }

  return (
    <section className="section-grid registration-grid">
      <form className="race-panel form-panel" onSubmit={submitRacer}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Registration</p>
            <h3>Add racer</h3>
          </div>
          <UserPlus aria-hidden="true" size={24} />
        </div>

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
          <span>Add Racer</span>
        </button>
      </form>

      <div className="race-panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Roster</p>
            <h3>{project.racers.length} registered</h3>
          </div>
          <ShieldCheck aria-hidden="true" size={24} />
        </div>

        {project.activeRemovalImpact ? (
          <div className="decision-panel">
            <strong>Resolve scratched racer schedule</strong>
            <span>
              {project.activeRemovalImpact.racerName} affected {project.activeRemovalImpact.affectedHeatIds.length} pending heat(s).
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
          <table className="data-table">
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
              {project.racers.map((racer) => (
                <tr key={racer.id} data-muted={racer.status !== 'active'}>
                  <td>{racer.racerNumber}</td>
                  <td>
                    <strong>{racer.name}</strong>
                    <small>{racer.vehicleName || 'No vehicle name'}</small>
                  </td>
                  <td>{racer.division}</td>
                  <td>{formatStatus(racer.status)}</td>
                  <td>
                    <button
                      className="mini-action"
                      onClick={() =>
                        void actions.updateRacer(racer.id, {
                          checkedIn: !racer.checkedIn
                        })
                      }
                      type="button"
                    >
                      {racer.checkedIn ? 'Checked In' : 'Check In'}
                    </button>
                    <button
                      className="mini-action"
                      onClick={() =>
                        void actions.updateRacer(racer.id, {
                          inspectionPassed: !racer.inspectionPassed
                        })
                      }
                      type="button"
                    >
                      {racer.inspectionPassed ? 'Inspected' : 'Inspect'}
                    </button>
                  </td>
                  <td>
                    <button
                      className="danger-action"
                      disabled={racer.status !== 'active'}
                      onClick={() => void actions.scratchRacer(racer.id)}
                      type="button"
                    >
                      <UserMinus aria-hidden="true" size={16} />
                      <span>Scratch</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}