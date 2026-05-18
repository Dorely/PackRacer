import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Flag, Play, RotateCcw, Save } from 'lucide-react'

import {
  areRaceResultsLockedByStartedDependents,
  calculateStandings,
  type Heat,
  type LaneResultStatus,
  type ScoringMode
} from '@packracer/race-engine'

import { formatStatus, formatTime, heatLabel, racerLabel } from '../formatters'
import type { SectionProps } from './types'

type ResultDraft = {
  status: LaneResultStatus
  timeSeconds: string
  finishPosition: string
  rescheduleMakeup: boolean
}

function usesTimeResults(scoringMode: ScoringMode): boolean {
  return scoringMode === 'average-time' || scoringMode === 'best-time' || scoringMode === 'total-time'
}

function supportsMakeupResults(format: string | undefined): boolean {
  return format === 'timed-heats' || format === 'points-heats'
}

function canMakeupStatus(status: LaneResultStatus): boolean {
  return status === 'dns' || status === 'dnf'
}

function initialDraft(heat: Heat | undefined): Record<number, ResultDraft> {
  const draft: Record<number, ResultDraft> = {}

  for (const assignment of heat?.laneAssignments ?? []) {
    const result = heat?.results.find((candidate) => candidate.lane === assignment.lane)
    draft[assignment.lane] = {
      status: result?.status ?? 'ok',
      timeSeconds: typeof result?.timeMs === 'number' ? `${result.timeMs / 1000}` : '',
      finishPosition: typeof result?.finishPosition === 'number' ? `${result.finishPosition}` : assignment.racerId ? `${assignment.lane}` : '',
      rescheduleMakeup: Boolean(result?.excludedFromScoring)
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
  requestConfirmation
}: SectionProps) {
  const allHeats = currentRace?.heats ?? []
  const currentHeat =
    allHeats.find((heat) => heat.id === currentRace?.currentHeatId) ?? allHeats.find((heat) => heat.status === 'pending') ?? allHeats[0]
  const [resultDrafts, setResultDrafts] = useState<Record<number, ResultDraft>>(() => initialDraft(currentHeat))

  useEffect(() => {
    setResultDrafts(initialDraft(currentHeat))
  }, [currentHeat?.id, currentHeat?.updatedAt])

  const completedHeats = useMemo(() => allHeats.filter((heat) => heat.status === 'complete').length, [allHeats])
  const startedDependentRaces = useMemo(
    () => event?.races.filter((race) => race.source?.sourceRaceId === currentRace?.id && race.heats.length > 0) ?? [],
    [event, currentRace]
  )
  const entryByRacerId = useMemo(
    () => new Map(currentRace?.entries?.map((entry) => [entry.racerId, entry]) ?? []),
    [currentRace]
  )
  const liveStandings = useMemo(
    () => (event && currentRace ? calculateStandings(event, currentRace.id) : []),
    [event, currentRace]
  )
  const showTimeResults = usesTimeResults(currentRace?.scoringMode ?? 'average-time')
  const canGenerateHeats = Boolean(
    currentRace && (allHeats.length === 0 || (currentRace.source && currentRace.entries.length === 0 && completedHeats === 0))
  )
  const resultsLockedByDependents = Boolean(
    event && currentRace && areRaceResultsLockedByStartedDependents(event, currentRace.id)
  )
  const dependentRaceNames = startedDependentRaces.map((race) => race.name).join(', ')
  const dependentRaceVerb = startedDependentRaces.length === 1 ? 'has' : 'have'

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

    if (resultsLockedByDependents) {
      return
    }

    const results = currentHeat.laneAssignments
      .filter((assignment) => assignment.racerId)
      .map((assignment) => {
        const draft = resultDrafts[assignment.lane]
        const timeMs = showTimeResults && draft.timeSeconds ? Number(draft.timeSeconds) * 1000 : undefined
        const finishPosition = !showTimeResults && draft.finishPosition ? Number(draft.finishPosition) : undefined

        return {
          lane: assignment.lane,
          racerId: assignment.racerId as string,
          status: draft.status,
          timeMs,
          finishPosition
        }
      })
    const rescheduleLanes = supportsMakeupResults(currentRace.format)
      ? currentHeat.laneAssignments
          .filter((assignment) => {
            const draft = resultDrafts[assignment.lane]
            return assignment.racerId && canMakeupStatus(draft?.status ?? 'ok') && draft?.rescheduleMakeup
          })
          .map((assignment) => assignment.lane)
      : []

    void actions.recordHeatResults(currentRace.id, {
      heatId: currentHeat.id,
      results,
      rescheduleLanes: rescheduleLanes.length > 0 ? rescheduleLanes : undefined
    })
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

  const runHeatAgain = (heatId: string) => {
    if (currentRace) {
      requestConfirmation({
        title: 'Run heat again',
        message: 'Clear this heat result and run the heat again?',
        confirmLabel: 'Run Again',
        onConfirm: () => actions.clearHeatResults(currentRace.id, heatId)
      })
    }
  }

  if (!event) {
    return <p className="empty-state full-width-message">Create an event before race control.</p>
  }

  if (!currentRace) {
    return <p className="empty-state full-width-message">Add a race in Event Setup before race control.</p>
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
          {canGenerateHeats ? (
            <button
              className="secondary-action"
              onClick={() => void actions.generateHeats(currentRace.id)}
              type="button"
            >
              <RotateCcw aria-hidden="true" size={18} />
              <span>Generate</span>
            </button>
          ) : null}
        </div>

        {currentHeat ? (
          <form className="result-entry" onSubmit={submitResults}>
            <div className="lane-grid" aria-label="Lane assignments and results">
              {currentHeat.laneAssignments.map((assignment) => (
                <div className="lane-row result-row" key={assignment.lane} data-muted={!assignment.racerId}>
                  <span>{assignment.makeupSource ? `Lane ${assignment.lane} makeup` : `Lane ${assignment.lane}`}</span>
                  <strong>{racerLabel(event.racers, assignment.racerId)}</strong>
                  {assignment.racerId ? (
                    <>
                      {showTimeResults ? (
                        <input
                          aria-label={`Lane ${assignment.lane} time`}
                          disabled={resultsLockedByDependents}
                          inputMode="decimal"
                          placeholder="0.000s"
                          value={resultDrafts[assignment.lane]?.timeSeconds ?? ''}
                          onChange={(inputEvent) => updateDraft(assignment.lane, { timeSeconds: inputEvent.target.value })}
                        />
                      ) : (
                        <input
                          aria-label={`Lane ${assignment.lane} finish position`}
                          disabled={resultsLockedByDependents}
                          inputMode="numeric"
                          min={1}
                          placeholder="Place"
                          type="number"
                          value={resultDrafts[assignment.lane]?.finishPosition ?? ''}
                          onChange={(inputEvent) => updateDraft(assignment.lane, { finishPosition: inputEvent.target.value })}
                        />
                      )}
                      <select
                        aria-label={`Lane ${assignment.lane} status`}
                        disabled={resultsLockedByDependents}
                        value={resultDrafts[assignment.lane]?.status ?? 'ok'}
                        onChange={(inputEvent) => {
                          const status = inputEvent.target.value as LaneResultStatus
                          updateDraft(assignment.lane, { status, rescheduleMakeup: canMakeupStatus(status) })
                        }}
                      >
                        <option value="ok">OK</option>
                        <option value="dns">DNS</option>
                        <option value="dnf">DNF</option>
                        <option value="dq">DQ</option>
                      </select>
                      <div className="makeup-cell">
                        {supportsMakeupResults(currentRace.format) && canMakeupStatus(resultDrafts[assignment.lane]?.status ?? 'ok') ? (
                          <label className="makeup-toggle">
                            <input
                              checked={resultDrafts[assignment.lane]?.rescheduleMakeup ?? false}
                              disabled={resultsLockedByDependents}
                              onChange={(inputEvent) => updateDraft(assignment.lane, { rescheduleMakeup: inputEvent.target.checked })}
                              type="checkbox"
                            />
                            <span>Add makeup run</span>
                          </label>
                        ) : null}
                      </div>
                      <button
                        className="danger-action"
                        disabled={resultsLockedByDependents}
                        onClick={() => scratchLaneRacer(assignment.racerId as string)}
                        type="button"
                      >
                        Scratch
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>

            {resultsLockedByDependents ? (
              <p className="empty-state">Locked because {dependentRaceNames} {dependentRaceVerb} generated heats.</p>
            ) : null}

            <div className="button-row">
              {currentHeat.status === 'complete' && !resultsLockedByDependents ? (
                <button className="secondary-action" onClick={() => runHeatAgain(currentHeat.id)} type="button">
                  <RotateCcw aria-hidden="true" size={18} />
                  <span>Run Again</span>
                </button>
              ) : null}
              <button className="primary-action" disabled={currentHeat.status === 'invalidated' || resultsLockedByDependents} type="submit">
                {currentHeat.status === 'complete' ? (
                  <Save aria-hidden="true" size={18} />
                ) : (
                  <Play aria-hidden="true" size={18} fill="currentColor" />
                )}
                <span>{currentHeat.status === 'complete' ? 'Update Results' : 'Record And Advance'}</span>
              </button>
            </div>
          </form>
        ) : (
          <p className="empty-state">Generate heats to start this race.</p>
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
                <strong>{heat.makeupSource ? `Heat ${heat.heatNumber} makeup` : `Heat ${heat.heatNumber}`}</strong>
                <span>{heat.makeupSource ? `From Heat ${heat.makeupSource.originalHeatNumber} - ${formatStatus(heat.status)}` : formatStatus(heat.status)}</span>
              </button>
            </article>
          ))}
          {allHeats.length === 0 ? <p className="empty-state">No heats scheduled yet.</p> : null}
        </div>
      </div>
    </section>
  )
}
