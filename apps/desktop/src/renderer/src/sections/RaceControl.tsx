import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Flag, Play, RotateCcw, Save } from 'lucide-react'

import {
  areRaceResultsLockedByStartedDependents,
  calculateStandings,
  getAdvancementTieBreakerStatuses,
  type Heat,
  type HeatStatus,
  type LaneResultStatus,
  type ScoringMode
} from '@packracer/race-engine'

import { formatStatus, formatTime, heatLabel, isMakeupHeat, racerLabel } from '../formatters'
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

function isUnfinishedHeatStatus(status: HeatStatus | undefined): boolean {
  return status === 'pending' || status === 'running' || status === 'invalidated'
}

function parseFinishPosition(value: string): number | null {
  const position = Number(value)
  return Number.isInteger(position) && position > 0 ? position : null
}

function cloneDrafts(drafts: Record<number, ResultDraft>): Record<number, ResultDraft> {
  return Object.fromEntries(Object.entries(drafts).map(([lane, draft]) => [Number(lane), { ...draft }]))
}

function okResultLanes(heat: Heat, drafts: Record<number, ResultDraft>): number[] {
  return heat.laneAssignments
    .filter((assignment) => assignment.racerId && drafts[assignment.lane]?.status === 'ok')
    .map((assignment) => assignment.lane)
}

function clearUnplacedLanes(heat: Heat, drafts: Record<number, ResultDraft>): void {
  for (const assignment of heat.laneAssignments) {
    if (!assignment.racerId || drafts[assignment.lane]?.status !== 'ok') {
      if (drafts[assignment.lane]) {
        drafts[assignment.lane].finishPosition = ''
      }
    }
  }
}

function compactPlacementDrafts(heat: Heat | undefined, drafts: Record<number, ResultDraft>): Record<number, ResultDraft> {
  if (!heat) {
    return drafts
  }

  const next = cloneDrafts(drafts)
  const lanes = okResultLanes(heat, next)
  const maxPosition = lanes.length
  const orderedLanes = lanes
    .map((lane, index) => {
      const position = parseFinishPosition(next[lane].finishPosition)
      return {
        lane,
        index,
        position,
        valid: position !== null && position <= maxPosition
      }
    })
    .sort((first, second) => {
      if (first.valid && second.valid && first.position !== second.position) {
        return (first.position ?? 0) - (second.position ?? 0)
      }

      if (first.valid && !second.valid) {
        return -1
      }

      if (!first.valid && second.valid) {
        return 1
      }

      return first.index - second.index
    })

  orderedLanes.forEach((entry, index) => {
    next[entry.lane].finishPosition = `${index + 1}`
  })
  clearUnplacedLanes(heat, next)
  return next
}

function normalizeUniquePlacementDrafts(heat: Heat, drafts: Record<number, ResultDraft>): Record<number, ResultDraft> {
  const next = cloneDrafts(drafts)
  const lanes = okResultLanes(heat, next)
  const maxPosition = lanes.length
  const usedPositions = new Set<number>()
  const missingLanes: number[] = []

  for (const lane of lanes) {
    const position = parseFinishPosition(next[lane].finishPosition)

    if (position && position <= maxPosition && !usedPositions.has(position)) {
      usedPositions.add(position)
      continue
    }

    next[lane].finishPosition = ''
    missingLanes.push(lane)
  }

  const availablePositions = Array.from({ length: maxPosition }, (_, index) => index + 1).filter(
    (position) => !usedPositions.has(position)
  )

  for (const lane of missingLanes) {
    next[lane].finishPosition = `${availablePositions.shift() ?? ''}`
  }

  clearUnplacedLanes(heat, next)
  return next
}

function swapPlacementDrafts(
  heat: Heat,
  drafts: Record<number, ResultDraft>,
  lane: number,
  finishPosition: number
): Record<number, ResultDraft> {
  const next = cloneDrafts(drafts)
  const lanes = okResultLanes(heat, next)
  const maxPosition = lanes.length
  const selectedPosition = Math.min(Math.max(1, Math.trunc(finishPosition)), maxPosition)
  const previousPosition = parseFinishPosition(next[lane]?.finishPosition ?? '')
  const occupiedLane = lanes.find(
    (candidateLane) => candidateLane !== lane && parseFinishPosition(next[candidateLane].finishPosition) === selectedPosition
  )

  if (!next[lane] || next[lane].status !== 'ok') {
    return normalizeUniquePlacementDrafts(heat, next)
  }

  next[lane].finishPosition = `${selectedPosition}`

  if (occupiedLane) {
    const fallbackPosition =
      previousPosition && previousPosition <= maxPosition && previousPosition !== selectedPosition
        ? previousPosition
        : Array.from({ length: maxPosition }, (_, index) => index + 1).find(
            (position) =>
              position !== selectedPosition &&
              lanes.every(
                (candidateLane) =>
                  candidateLane === occupiedLane || parseFinishPosition(next[candidateLane].finishPosition) !== position
              )
          )

    next[occupiedLane].finishPosition = fallbackPosition ? `${fallbackPosition}` : ''
  }

  return normalizeUniquePlacementDrafts(heat, next)
}

function placementOptions(heat: Heat | undefined, drafts: Record<number, ResultDraft>): number[] {
  return heat ? Array.from({ length: okResultLanes(heat, drafts).length }, (_, index) => index + 1) : []
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

  return compactPlacementDrafts(heat, draft)
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
  const pendingHeat = allHeats.find((heat) => heat.status === 'pending')
  const currentHeat = allHeats.find((heat) => heat.id === currentRace?.currentHeatId) ?? pendingHeat
  const [resultDrafts, setResultDrafts] = useState<Record<number, ResultDraft>>(() => initialDraft(currentHeat))
  const [laneAvailabilityOpen, setLaneAvailabilityOpen] = useState(false)
  const laneNumbers = useMemo(
    () => Array.from({ length: currentRace?.laneCount ?? 0 }, (_value, index) => index + 1),
    [currentRace?.laneCount]
  )
  const disabledLaneNumbers = useMemo(
    () => new Set(currentRace?.disabledLaneNumbers ?? []),
    [currentRace?.disabledLaneNumbers]
  )

  useEffect(() => {
    setResultDrafts(initialDraft(currentHeat))
  }, [currentHeat?.id, currentHeat?.updatedAt])

  useEffect(() => {
    setLaneAvailabilityOpen(false)
  }, [currentRace?.id])

  const completedHeats = useMemo(() => allHeats.filter((heat) => heat.status === 'complete').length, [allHeats])
  const hasUnfinishedHeats = useMemo(
    () => allHeats.some((heat) => heat.status === 'pending' || heat.status === 'running' || heat.status === 'invalidated'),
    [allHeats]
  )
  const raceFinished = allHeats.length > 0 && !hasUnfinishedHeats && !currentHeat
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
  const advancementTieBreakers = useMemo(
    () =>
      event && currentRace
        ? getAdvancementTieBreakerStatuses(event, currentRace.id).filter((status) => status.needsTieBreaker && !status.resolved)
        : [],
    [event, currentRace]
  )
  const dependentRaceById = useMemo(
    () => new Map(event?.races.map((race) => [race.id, race]) ?? []),
    [event]
  )
  const showTimeResults = usesTimeResults(currentRace?.scoringMode ?? 'average-time')
  const finishPositionOptions = useMemo(
    () => placementOptions(currentHeat, resultDrafts),
    [currentHeat, resultDrafts]
  )
  const activeEntryCount = useMemo(
    () => currentRace?.entries?.filter((entry) => entry.status === 'active').length ?? 0,
    [currentRace]
  )
  const canGenerateHeats = Boolean(
    currentRace && completedHeats === 0 && (activeEntryCount > 0 || currentRace.source)
  )
  const generateHeatLabel = allHeats.length > 0 ? 'Regenerate' : 'Generate'
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

  const updateStatus = (lane: number, status: LaneResultStatus) => {
    setResultDrafts((previous) => {
      if (!currentHeat) {
        return previous
      }

      return compactPlacementDrafts(currentHeat, {
        ...previous,
        [lane]: {
          ...previous[lane],
          status,
          finishPosition: status === 'ok' ? previous[lane]?.finishPosition ?? '' : '',
          rescheduleMakeup: canMakeupStatus(status)
        }
      })
    })
  }

  const updateFinishPosition = (lane: number, finishPosition: string) => {
    const parsedPosition = parseFinishPosition(finishPosition)

    if (!currentHeat || parsedPosition === null) {
      return
    }

    setResultDrafts((previous) => swapPlacementDrafts(currentHeat, previous, lane, parsedPosition))
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
        const finishPosition = !showTimeResults && draft.status === 'ok' && draft.finishPosition ? Number(draft.finishPosition) : undefined

        return {
          lane: assignment.lane,
          racerId: assignment.racerId as string,
          status: draft.status,
          timeMs,
          finishPosition
        }
      })
    const rescheduleLanes = supportsMakeupResults(currentRace.format) && !currentHeat.tieBreakerSource
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

  const changeLaneAvailability = (laneNumber: number, disabled: boolean) => {
    if (!currentRace || event?.activeRemovalImpact) {
      return
    }

    const applyChange = () => actions.updateRaceLaneAvailability(currentRace.id, { laneNumbers: [laneNumber], disabled })
    const currentLaneAssignment = currentHeat?.laneAssignments.find(
      (assignment) => assignment.lane === laneNumber && assignment.racerId
    )

    if (disabled && currentLaneAssignment && isUnfinishedHeatStatus(currentHeat?.status)) {
      requestConfirmation({
        title: `Disable lane ${laneNumber}`,
        message: `Disable lane ${laneNumber} and reschedule the current unfinished heat plus later heats?`,
        confirmLabel: 'Disable Lane',
        destructive: true,
        onConfirm: applyChange
      })
      return
    }

    void applyChange()
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
            <h3>{raceFinished ? 'Race Finished' : currentHeat ? heatLabel(currentHeat) : 'No heat selected'}</h3>
          </div>
          {pendingHeat ? (
            <button
              className="icon-action"
              onClick={() => void actions.advanceHeat(currentRace.id)}
              aria-label="Jump to next pending heat"
              type="button"
            >
              <ChevronRight aria-hidden="true" size={24} />
            </button>
          ) : null}
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
              <span>{generateHeatLabel}</span>
            </button>
          ) : null}
        </div>

        {currentHeat ? (
          <form className="result-entry" onSubmit={submitResults}>
            <div className="lane-grid" aria-label="Lane assignments and results">
              {currentHeat.laneAssignments.map((assignment) => {
                const isDisabledLane = !assignment.racerId && disabledLaneNumbers.has(assignment.lane)

                return (
                  <div className="lane-row result-row" key={assignment.lane} data-disabled={isDisabledLane} data-muted={!assignment.racerId}>
                    <span>
                      {isDisabledLane
                        ? `Lane ${assignment.lane} disabled`
                        : currentHeat.tieBreakerSource
                          ? `Lane ${assignment.lane} tie-breaker`
                          : assignment.makeupSource
                            ? `Lane ${assignment.lane} makeup`
                            : `Lane ${assignment.lane}`}
                    </span>
                    <strong>{isDisabledLane ? 'Disabled' : racerLabel(event.racers, assignment.racerId)}</strong>
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
                          <select
                            aria-label={`Lane ${assignment.lane} finish position`}
                            disabled={resultsLockedByDependents || (resultDrafts[assignment.lane]?.status ?? 'ok') !== 'ok'}
                            data-muted={(resultDrafts[assignment.lane]?.status ?? 'ok') !== 'ok'}
                            value={resultDrafts[assignment.lane]?.finishPosition ?? ''}
                            onChange={(inputEvent) => updateFinishPosition(assignment.lane, inputEvent.target.value)}
                          >
                            <option value="">
                              {(resultDrafts[assignment.lane]?.status ?? 'ok') === 'ok' ? 'Place' : 'Not placed'}
                            </option>
                            {(resultDrafts[assignment.lane]?.status ?? 'ok') === 'ok'
                              ? finishPositionOptions.map((position) => (
                                  <option key={position} value={position}>
                                    {position}
                                  </option>
                                ))
                              : null}
                          </select>
                        )}
                        <select
                          aria-label={`Lane ${assignment.lane} status`}
                          disabled={resultsLockedByDependents}
                          value={resultDrafts[assignment.lane]?.status ?? 'ok'}
                          onChange={(inputEvent) => updateStatus(assignment.lane, inputEvent.target.value as LaneResultStatus)}
                        >
                          <option value="ok">OK</option>
                          <option value="dns">DNS</option>
                          <option value="dnf">DNF</option>
                          <option value="dq">DQ</option>
                        </select>
                        <div className="makeup-cell">
                          {supportsMakeupResults(currentRace.format) &&
                          !currentHeat.tieBreakerSource &&
                          canMakeupStatus(resultDrafts[assignment.lane]?.status ?? 'ok') ? (
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
                )
              })}
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
        ) : raceFinished ? (
          <div className="live-standings-panel">
            <strong>Final results</strong>
            <p className="empty-state">All heats are complete. Select any heat from the heat sheet to edit results or run it again.</p>
            {advancementTieBreakers.length > 0 ? (
              <div className="advancement-summary-list">
                {advancementTieBreakers.map((status) => {
                  const dependentRace = dependentRaceById.get(status.dependentRaceId)
                  const tiedRacers = status.unresolvedRacerIds.map((racerId) => racerLabel(event.racers, racerId)).join(', ')

                  return (
                    <section className="decision-panel" key={status.dependentRaceId}>
                      <strong>{dependentRace?.name ?? 'Dependent race'} needs a tie-breaker</strong>
                      <span>
                        {status.selectedRacerIds.length}/{status.topCount} finalist(s) locked. {tiedRacers} tied for{' '}
                        {status.unresolvedContestedSlots} slot(s).
                      </span>
                      {status.pendingHeatIds.length > 0 ? (
                        <span>Complete the generated tie-breaker heat(s) before advancing this race.</span>
                      ) : status.canGenerateTieBreaker ? (
                        <div className="button-row">
                          <button
                            className="secondary-action"
                            onClick={() => void actions.generateTieBreaker(currentRace.id, status.dependentRaceId)}
                            type="button"
                          >
                            Generate Tie-Breaker
                          </button>
                        </div>
                      ) : (
                        <span>{status.message ?? 'Resolve this advancement tie manually.'}</span>
                      )}
                    </section>
                  )
                })}
              </div>
            ) : null}
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
          </div>
        ) : (
          <p className="empty-state">
            {activeEntryCount === 0 && !currentRace.source
              ? 'Register racers for this race before generating heats.'
              : 'Generate heats to start this race.'}
          </p>
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
          {liveStandings.length === 0 ? <p className="empty-state">{raceFinished ? 'No final results available.' : 'Record a heat to start live stats.'}</p> : null}
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

        <div className="lane-availability-panel">
          <button
            aria-expanded={laneAvailabilityOpen}
            className="lane-availability-summary"
            onClick={() => setLaneAvailabilityOpen((isOpen) => !isOpen)}
            type="button"
          >
            <span>
              <strong>Lane availability</strong>
              <small>{disabledLaneNumbers.size} disabled / {Math.max(0, laneNumbers.length - disabledLaneNumbers.size)} active</small>
            </span>
            {laneAvailabilityOpen ? <ChevronUp aria-hidden="true" size={18} /> : <ChevronDown aria-hidden="true" size={18} />}
          </button>
          {laneAvailabilityOpen ? (
            <div className="lane-availability-list">
              {laneNumbers.map((laneNumber) => {
                const isDisabled = disabledLaneNumbers.has(laneNumber)

                return (
                  <div className="lane-availability-row" data-disabled={isDisabled} key={laneNumber}>
                    <div>
                      <span>Lane {laneNumber}</span>
                      <strong>{isDisabled ? 'Disabled' : 'Active'}</strong>
                    </div>
                    <button
                      className={isDisabled ? 'secondary-action' : 'danger-action'}
                      disabled={Boolean(event.activeRemovalImpact)}
                      onClick={() => changeLaneAvailability(laneNumber, !isDisabled)}
                      type="button"
                    >
                      {isDisabled ? 'Enable' : 'Disable'}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
          {event.activeRemovalImpact ? (
            <span className="lane-availability-note">Resolve the scratched racer schedule before changing lanes.</span>
          ) : null}
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
            </div>
          </div>
        ) : null}

        <div className="heat-list">
          {allHeats.map((heat) => (
            <article className="heat-list-item" data-active={heat.id === currentHeat?.id} key={heat.id}>
              <button className="bare-select" onClick={() => void actions.setCurrentHeat(currentRace.id, heat.id)} type="button">
                <strong>
                  {heat.tieBreakerSource
                    ? `Heat ${heat.heatNumber} tie-breaker`
                    : isMakeupHeat(heat)
                      ? `Heat ${heat.heatNumber} makeup`
                      : `Heat ${heat.heatNumber}`}
                </strong>
                <span>
                  {heat.tieBreakerSource
                    ? `${dependentRaceById.get(heat.tieBreakerSource.dependentRaceId)?.name ?? 'Advancement'} Round ${heat.tieBreakerSource.roundNumber} - ${formatStatus(heat.status)}`
                    : isMakeupHeat(heat)
                      ? `Makeup - ${formatStatus(heat.status)}`
                      : formatStatus(heat.status)}
                </span>
              </button>
            </article>
          ))}
          {allHeats.length === 0 ? <p className="empty-state">No heats scheduled yet.</p> : null}
        </div>
      </div>
    </section>
  )
}
