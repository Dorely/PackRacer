import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Flag, Play, RotateCcw } from 'lucide-react'

import type { Heat, LaneResultStatus } from '@packracer/race-engine'

import { formatStatus, heatLabel, racerLabel } from '../formatters'
import type { SectionProps } from './types'

type ResultDraft = {
  status: LaneResultStatus
  timeSeconds: string
  finishPosition: string
}

function initialDraft(heat: Heat | undefined): Record<number, ResultDraft> {
  const draft: Record<number, ResultDraft> = {}

  for (const assignment of heat?.laneAssignments ?? []) {
    draft[assignment.lane] = {
      status: 'ok',
      timeSeconds: '',
      finishPosition: assignment.racerId ? `${assignment.lane}` : ''
    }
  }

  return draft
}

export function RaceControl({ event, currentRace, actions, selectedRaceId, setSelectedRaceId, selectedStageId, setSelectedStageId }: SectionProps) {
  const selectedStage = currentRace?.stages.find((stage) => stage.id === selectedStageId) ?? currentRace?.stages[0]
  const allHeats = selectedStage?.heats ?? []
  const currentHeat =
    allHeats.find((heat) => heat.id === currentRace?.currentHeatId) ?? allHeats.find((heat) => heat.status === 'pending') ?? allHeats[0]
  const [resultDrafts, setResultDrafts] = useState<Record<number, ResultDraft>>(() => initialDraft(currentHeat))

  useEffect(() => {
    setResultDrafts(initialDraft(currentHeat))
  }, [currentHeat?.id])

  const completedHeats = useMemo(() => allHeats.filter((heat) => heat.status === 'complete').length, [allHeats])

  const updateDraft = (lane: number, patch: Partial<ResultDraft>) => {
    setResultDrafts((previous) => ({
      ...previous,
      [lane]: {
        ...previous[lane],
        ...patch
      }
    }))
  }

  const submitResults = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!currentRace || !currentHeat) {
      return
    }

    const results = currentHeat.laneAssignments
      .filter((assignment) => assignment.racerId)
      .map((assignment) => {
        const draft = resultDrafts[assignment.lane]
        const timeMs = draft.timeSeconds ? Number(draft.timeSeconds) * 1000 : undefined
        const finishPosition = draft.finishPosition ? Number(draft.finishPosition) : undefined

        return {
          lane: assignment.lane,
          racerId: assignment.racerId as string,
          status: draft.status,
          timeMs,
          finishPosition
        }
      })

    void actions.recordHeatResults(currentRace.id, { heatId: currentHeat.id, results })
  }

  if (!event) {
    return <p className="empty-state full-width-message">Create an event before race control.</p>
  }

  if (!currentRace) {
    return <p className="empty-state full-width-message">Add a race in Event Setup before race control.</p>
  }

  if (currentRace.stages.length === 0) {
    return <p className="empty-state full-width-message">Add a stage in Event Setup before generating heats.</p>
  }

  return (
    <section className="control-surface race-control-layout">
      <div className="race-panel current-state">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Current Heat</p>
            <h3>{currentHeat ? heatLabel(currentHeat) : 'No heat selected'}</h3>
          </div>
          <button
            className="icon-action"
            onClick={() => void actions.advanceHeat(currentRace.id)}
            aria-label="Jump to next pending heat"
            type="button"
          >
            <ChevronRight aria-hidden="true" size={24} />
          </button>
        </div>

        <div className="toolbar-row">
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
          <label>
            <span>Stage</span>
            <select value={selectedStage?.id ?? ''} onChange={(inputEvent) => setSelectedStageId(inputEvent.target.value)}>
              {currentRace.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-action"
            onClick={() => selectedStage && void actions.generateHeats(currentRace.id, selectedStage.id)}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} />
            <span>Generate</span>
          </button>
        </div>

        {currentHeat ? (
          <form className="result-entry" onSubmit={submitResults}>
            <div className="lane-grid" aria-label="Lane assignments and results">
              {currentHeat.laneAssignments.map((assignment) => (
                <div className="lane-row result-row" key={assignment.lane} data-muted={!assignment.racerId}>
                  <span>Lane {assignment.lane}</span>
                  <strong>{racerLabel(event.racers, assignment.racerId)}</strong>
                  {assignment.racerId ? (
                    <>
                      <input
                        aria-label={`Lane ${assignment.lane} time`}
                        inputMode="decimal"
                        placeholder="0.000s"
                        value={resultDrafts[assignment.lane]?.timeSeconds ?? ''}
                        onChange={(inputEvent) => updateDraft(assignment.lane, { timeSeconds: inputEvent.target.value })}
                      />
                      <input
                        aria-label={`Lane ${assignment.lane} finish position`}
                        inputMode="numeric"
                        min={1}
                        placeholder="Place"
                        type="number"
                        value={resultDrafts[assignment.lane]?.finishPosition ?? ''}
                        onChange={(inputEvent) => updateDraft(assignment.lane, { finishPosition: inputEvent.target.value })}
                      />
                      <select
                        aria-label={`Lane ${assignment.lane} status`}
                        value={resultDrafts[assignment.lane]?.status ?? 'ok'}
                        onChange={(inputEvent) => updateDraft(assignment.lane, { status: inputEvent.target.value as LaneResultStatus })}
                      >
                        <option value="ok">OK</option>
                        <option value="dns">DNS</option>
                        <option value="dnf">DNF</option>
                        <option value="dq">DQ</option>
                      </select>
                    </>
                  ) : null}
                </div>
              ))}
            </div>

            <button className="primary-action" disabled={currentHeat.status === 'invalidated'} type="submit">
              <Play aria-hidden="true" size={18} fill="currentColor" />
              <span>Record And Advance</span>
            </button>
          </form>
        ) : (
          <p className="empty-state">Generate heats to start this stage.</p>
        )}
      </div>

      <div className="race-panel next-actions">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Heat Sheet</p>
            <h3>{completedHeats}/{allHeats.length} complete</h3>
          </div>
          <Flag aria-hidden="true" size={24} />
        </div>

        <div className="heat-list">
          {allHeats.map((heat) => (
            <button
              className="heat-list-item"
              data-active={heat.id === currentHeat?.id}
              key={heat.id}
              onClick={() => void actions.setCurrentHeat(currentRace.id, heat.id)}
              type="button"
            >
              <strong>Heat {heat.heatNumber}</strong>
              <span>{formatStatus(heat.status)}</span>
            </button>
          ))}
          {allHeats.length === 0 ? <p className="empty-state">No heats scheduled yet.</p> : null}
        </div>
      </div>
    </section>
  )
}