import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Flag, Play, RotateCcw } from 'lucide-react'

import { calculateStandings, type Heat, type LaneResultStatus } from '@packracer/race-engine'

import { formatStatus, formatTime, heatLabel, racerLabel } from '../formatters'
import type { SectionProps } from './types'

type ResultDraft = {
  status: LaneResultStatus
  timeSeconds: string
  finishPosition: string
}

function initialDraft(heat: Heat | undefined): Record<number, ResultDraft> {
  const draft: Record<number, ResultDraft> = {}

  for (const assignment of heat?.laneAssignments ?? []) {
    const result = heat?.results.find((candidate) => candidate.lane === assignment.lane)
    draft[assignment.lane] = {
      status: result?.status ?? 'ok',
      timeSeconds: typeof result?.timeMs === 'number' ? `${result.timeMs / 1000}` : '',
      finishPosition: typeof result?.finishPosition === 'number' ? `${result.finishPosition}` : assignment.racerId ? `${assignment.lane}` : ''
    }
  }

  return draft
}

export function RaceControl({
  event,
  currentRace,
  actions,
  selectedRaceId,
  setSelectedRaceId,
  selectedStageId,
  setSelectedStageId,
  requestConfirmation
}: SectionProps) {
  const selectedStage = currentRace?.stages.find((stage) => stage.id === selectedStageId) ?? currentRace?.stages[0]
  const allHeats = selectedStage?.heats ?? []
  const currentHeat =
    allHeats.find((heat) => heat.id === currentRace?.currentHeatId) ?? allHeats.find((heat) => heat.status === 'pending') ?? allHeats[0]
  const [resultDrafts, setResultDrafts] = useState<Record<number, ResultDraft>>(() => initialDraft(currentHeat))

  useEffect(() => {
    setResultDrafts(initialDraft(currentHeat))
  }, [currentHeat?.id])

  const completedHeats = useMemo(() => allHeats.filter((heat) => heat.status === 'complete').length, [allHeats])
  const entryByRacerId = useMemo(
    () => new Map(currentRace?.entries?.map((entry) => [entry.racerId, entry]) ?? []),
    [currentRace]
  )
  const liveStandings = useMemo(
    () => (event && currentRace && selectedStage ? calculateStandings(event, currentRace.id, selectedStage.id).slice(0, 6) : []),
    [event, currentRace, selectedStage]
  )

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

  const scratchLaneRacer = (racerId: string) => {
    const entry = entryByRacerId.get(racerId)

    if (currentRace && entry) {
      requestConfirmation({
        title: 'Scratch racer',
        message: 'Scratch this racer from the selected race?',
        confirmLabel: 'Scratch Racer',
        destructive: true,
        onConfirm: () => actions.scratchRaceEntry(currentRace.id, entry.id)
      })
    }
  }

  const clearHeat = (heatId: string) => {
    if (currentRace) {
      requestConfirmation({
        title: 'Clear heat result',
        message: 'Clear this heat result and mark it pending again?',
        confirmLabel: 'Clear Result',
        destructive: true,
        onConfirm: () => actions.clearHeatResults(currentRace.id, heatId)
      })
    }
  }

  const deleteHeat = (heatId: string) => {
    if (currentRace) {
      requestConfirmation({
        title: 'Delete heat',
        message: 'Delete this heat from the schedule?',
        confirmLabel: 'Delete Heat',
        destructive: true,
        onConfirm: () => actions.deleteHeat(currentRace.id, heatId)
      })
    }
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
                      <button className="danger-action" onClick={() => scratchLaneRacer(assignment.racerId as string)} type="button">
                        Scratch
                      </button>
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

        <div className="live-standings-panel">
          <strong>Live stats</strong>
          <ol className="leader-list compact">
            {liveStandings.map((standing) => (
              <li key={standing.racerId}>
                <span>
                  {standing.rank}. #{standing.racerNumber} {standing.racerName}
                </span>
                <strong>{standing.bestTimeMs ? formatTime(standing.bestTimeMs) : standing.scoreLabel}</strong>
              </li>
            ))}
          </ol>
          {liveStandings.length === 0 ? <p className="empty-state">Record a heat to start live stats.</p> : null}
        </div>
      </div>

      <div className="race-panel next-actions">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Heat Sheet</p>
            <h3>{completedHeats}/{allHeats.length} complete</h3>
          </div>
          <Flag aria-hidden="true" size={24} />
        </div>

        {event.activeRemovalImpact ? (
          <div className="decision-panel">
            <strong>Resolve scratched racer schedule</strong>
            <span>{event.activeRemovalImpact.affectedHeatIds.length} pending heat(s) need an operator decision.</span>
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

        <div className="heat-list">
          {allHeats.map((heat) => (
            <article className="heat-list-item" data-active={heat.id === currentHeat?.id} key={heat.id}>
              <button className="bare-select" onClick={() => void actions.setCurrentHeat(currentRace.id, heat.id)} type="button">
                <strong>Heat {heat.heatNumber}</strong>
                <span>{formatStatus(heat.status)}</span>
              </button>
              <div className="button-row nowrap">
                <button className="mini-action" disabled={heat.status !== 'complete'} onClick={() => clearHeat(heat.id)} type="button">
                  Clear
                </button>
                <button className="danger-action" onClick={() => deleteHeat(heat.id)} type="button">
                  Delete
                </button>
              </div>
            </article>
          ))}
          {allHeats.length === 0 ? <p className="empty-state">No heats scheduled yet.</p> : null}
        </div>
      </div>
    </section>
  )
}