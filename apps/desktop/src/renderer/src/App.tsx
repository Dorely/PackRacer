import { CalendarDays, ClipboardList, ExternalLink, Flag, Monitor, Trophy, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  AddRaceEntryInput,
  AddRacerInput,
  CreateEventInput,
  CreateRaceInput,
  EventSessionSnapshot,
  RecordHeatResultsInput,
  RegisterRacerInput,
  RemovalResolutionStrategy,
  UpdateRaceEntryInput,
  UpdateEventInput,
  UpdateRaceLaneAvailabilityInput,
  UpdateRaceInput,
  UpdateRacerInput
} from '@packracer/race-engine'

import { DisplayMode } from './sections/DisplayMode'
import { Events } from './sections/Events'
import { EventSetup } from './sections/EventSetup'
import { RaceControl } from './sections/RaceControl'
import { Registration } from './sections/Registration'
import { Standings } from './sections/Standings'
import type { AppActions, ConfirmationRequest } from './sections/types'

const sectionIds = ['events', 'event', 'registration', 'race-control', 'standings', 'display'] as const

type SectionId = (typeof sectionIds)[number]

type NavigationItem = {
  id: SectionId
  label: string
  meta: string
  icon: typeof ClipboardList
}

type WindowContext = {
  isPopout: boolean
  initialSection: SectionId
  initialRaceId: string
}

function isSectionId(value: string | null): value is SectionId {
  return sectionIds.includes(value as SectionId)
}

function readWindowContext(): WindowContext {
  const params = new URLSearchParams(window.location.search)
  const isPopout = params.get('mode') === 'popout'
  const section = params.get('section')

  return {
    isPopout,
    initialSection: isPopout && isSectionId(section) ? section : 'events',
    initialRaceId: params.get('raceId') ?? ''
  }
}

function getPackRacerApi(): Window['packRacer'] {
  if (!window.packRacer) {
    throw new Error('The PackRacer desktop bridge did not load. Restart the Electron app from npm run dev.')
  }

  return window.packRacer
}

const initialWindowContext = readWindowContext()

function selectedRaceIdForSession(nextSession: EventSessionSnapshot, preferredRaceId: string): string {
  const event = nextSession.event
  return (
    event.races.find((race) => race.id === preferredRaceId)?.id ??
    event.races.find((race) => race.id === event.currentRaceId)?.id ??
    event.races[0]?.id ??
    ''
  )
}

export function App() {
  const [activeSection, setActiveSection] = useState<SectionId>(initialWindowContext.initialSection)
  const [appVersion, setAppVersion] = useState('0.1.0')
  const [session, setSession] = useState<EventSessionSnapshot | null>(null)
  const [selectedRaceId, setSelectedRaceId] = useState(initialWindowContext.initialRaceId)
  const [errorMessage, setErrorMessage] = useState('')
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null)

  const applySession = useCallback((nextSession: EventSessionSnapshot | null) => {
    if (!nextSession) {
      setSession(null)
      setSelectedRaceId('')
      return
    }

    setSession(nextSession)
    setSelectedRaceId((previousRaceId) => selectedRaceIdForSession(nextSession, previousRaceId))
  }, [])

  useEffect(() => {
    if (!window.packRacer) {
      setErrorMessage('The PackRacer desktop bridge did not load. Restart the Electron app from npm run dev.')
      return
    }

    void window.packRacer.getVersion().then(setAppVersion)
    void window.packRacer.getCurrentEvent().then(applySession)
    return window.packRacer.onSessionUpdated(applySession)
  }, [applySession])

  const event = session?.event ?? null
  const currentRace =
    event?.races.find((race) => race.id === selectedRaceId) ??
    event?.races.find((race) => race.id === event.currentRaceId) ??
    event?.races[0] ??
    null

  useEffect(() => {
    if (!event) {
      setSelectedRaceId('')
      return
    }

    const nextRaceId =
      event.races.find((candidate) => candidate.id === selectedRaceId)?.id ??
      event.races.find((candidate) => candidate.id === event.currentRaceId)?.id ??
      event.races[0]?.id ??
      ''

    if (nextRaceId !== selectedRaceId) {
      setSelectedRaceId(nextRaceId)
    }

  }, [event, selectedRaceId])

  const runAction = useCallback(
    async (action: () => Promise<EventSessionSnapshot | null>): Promise<void> => {
      try {
        setErrorMessage('')
        applySession(await action())
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'The race operation could not be completed.')
      }
    },
    [applySession]
  )

  const actions: AppActions = useMemo(
    () => ({
      createEvent: (input: CreateEventInput) => runAction(() => getPackRacerApi().createEvent(input)),
      selectEvent: (eventId: string) => runAction(() => getPackRacerApi().selectEvent(eventId)),
      updateEvent: (input: UpdateEventInput) => runAction(() => getPackRacerApi().updateEvent(input)),
      deleteEvent: (eventId: string) => runAction(() => getPackRacerApi().deleteEvent(eventId)),
      createRace: (input: CreateRaceInput) => runAction(() => getPackRacerApi().createRace(input)),
      updateRace: (raceId: string, input: UpdateRaceInput) => runAction(() => getPackRacerApi().updateRace(raceId, input)),
      updateRaceLaneAvailability: (raceId: string, input: UpdateRaceLaneAvailabilityInput) =>
        runAction(() => getPackRacerApi().updateRaceLaneAvailability(raceId, input)),
      deleteRace: (raceId: string) => runAction(() => getPackRacerApi().deleteRace(raceId)),
      addRacer: (input: AddRacerInput) => runAction(() => getPackRacerApi().addRacer(input)),
      updateRacer: (racerId: string, input: UpdateRacerInput) =>
        runAction(() => getPackRacerApi().updateRacer(racerId, input)),
      deleteRacer: (racerId: string) => runAction(() => getPackRacerApi().deleteRacer(racerId)),
      scratchRacer: (racerId: string) => runAction(() => getPackRacerApi().scratchRacer(racerId)),
      resolveRacerRemoval: (strategy: RemovalResolutionStrategy) =>
        runAction(() => getPackRacerApi().resolveRacerRemoval(strategy)),
      addRaceEntry: (raceId: string, input: AddRaceEntryInput) => runAction(() => getPackRacerApi().addRaceEntry(raceId, input)),
      registerRacerForRace: (raceId: string, input: RegisterRacerInput) =>
        runAction(() => getPackRacerApi().registerRacerForRace(raceId, input)),
      updateRaceEntry: (raceId: string, entryId: string, input: UpdateRaceEntryInput) =>
        runAction(() => getPackRacerApi().updateRaceEntry(raceId, entryId, input)),
      removeRaceEntry: (raceId: string, entryId: string) => runAction(() => getPackRacerApi().removeRaceEntry(raceId, entryId)),
      scratchRaceEntry: (raceId: string, entryId: string) => runAction(() => getPackRacerApi().scratchRaceEntry(raceId, entryId)),
      generateHeats: (raceId: string) => runAction(() => getPackRacerApi().generateHeats(raceId)),
      generateTieBreaker: (sourceRaceId: string, dependentRaceId: string) =>
        runAction(() => getPackRacerApi().generateTieBreaker(sourceRaceId, dependentRaceId)),
      recordHeatResults: (raceId: string, input: RecordHeatResultsInput) =>
        runAction(() => getPackRacerApi().recordHeatResults(raceId, input)),
      clearHeatResults: (raceId: string, heatId: string) => runAction(() => getPackRacerApi().clearHeatResults(raceId, heatId)),
      setCurrentHeat: (raceId: string, heatId: string) => runAction(() => getPackRacerApi().setCurrentHeat(raceId, heatId)),
      advanceHeat: (raceId: string) => runAction(() => getPackRacerApi().advanceHeat(raceId))
    }),
    [runAction]
  )

  const openActiveSectionPopout = useCallback(async () => {
    try {
      setErrorMessage('')
      await getPackRacerApi().openPopout({ sectionId: activeSection, selectedRaceId })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The pop-out window could not be opened.')
    }
  }, [activeSection, selectedRaceId])

  const navigationItems: NavigationItem[] = useMemo(() => {
    const activeRacers = currentRace?.entries?.filter((entry) => entry.status === 'active').length ?? 0
    const heatCount = currentRace?.heats.length ?? 0
    const currentHeat = currentRace?.heats.find((heat) => heat.id === currentRace.currentHeatId)

    return [
      { id: 'events', label: 'Events', meta: session?.events.length ? `${session.events.length} saved` : 'Start here', icon: CalendarDays },
      { id: 'event', label: 'Race Setup', meta: event?.status ?? 'No event', icon: ClipboardList },
      { id: 'registration', label: 'Registration', meta: `${activeRacers} active`, icon: Users },
      { id: 'race-control', label: 'Race Control', meta: currentHeat ? `Heat ${currentHeat.heatNumber}` : 'Idle', icon: Flag },
      { id: 'standings', label: 'Standings', meta: heatCount > 0 ? 'Live' : 'Pending', icon: Trophy },
      { id: 'display', label: 'Display', meta: event ? currentRace?.name ?? 'Ready' : 'Closed', icon: Monitor }
    ]
  }, [event, currentRace])

  const workflowStats = useMemo(() => {
    const activeRacers = currentRace?.entries?.filter((entry) => entry.status === 'active').length ?? 0
    const totalRacers = currentRace?.entries?.length ?? event?.racers.length ?? 0
    const heatCount = currentRace?.heats.length ?? 0
    const completeHeats = currentRace?.heats.filter((heat) => heat.status === 'complete').length ?? 0

    return [
      { label: 'Race Entries', value: `${activeRacers}`, detail: `${totalRacers} registered` },
      { label: 'Races', value: `${event?.races.length ?? 0}`, detail: currentRace?.name ?? 'Not configured' },
      { label: 'Heats', value: `${completeHeats}/${heatCount}`, detail: heatCount > 0 ? 'Recorded / scheduled' : 'Not scheduled' },
      { label: 'Lanes', value: `${currentRace?.laneCount ?? event?.laneCount ?? 4}`, detail: event?.trackName ?? 'Default track' }
    ]
  }, [event, currentRace])

  const activeNavigationItem = useMemo(
    () => navigationItems.find((item) => item.id === activeSection) ?? navigationItems[0],
    [activeSection, navigationItems]
  )

  const requestConfirmation = useCallback((request: ConfirmationRequest) => {
    setConfirmationRequest(request)
  }, [])

  const cancelConfirmation = useCallback(() => {
    setConfirmationRequest(null)
  }, [])

  const confirmPendingAction = useCallback(() => {
    const request = confirmationRequest

    if (!request) {
      return
    }

    setConfirmationRequest(null)
    void request.onConfirm()
  }, [confirmationRequest])

  const sectionProps = {
    session,
    event,
    currentRace,
    actions,
    selectedRaceId,
    setSelectedRaceId,
    requestConfirmation
  }

  const renderedSection = (
    <>
      {activeSection === 'events' ? <Events {...sectionProps} /> : null}
      {activeSection === 'event' ? <EventSetup {...sectionProps} /> : null}
      {activeSection === 'registration' ? <Registration {...sectionProps} /> : null}
      {activeSection === 'race-control' ? <RaceControl {...sectionProps} /> : null}
      {activeSection === 'standings' ? <Standings {...sectionProps} /> : null}
      {activeSection === 'display' ? <DisplayMode {...sectionProps} /> : null}
    </>
  )
  const notices = (
    <>
      {errorMessage ? <div className="notice-banner" role="alert">{errorMessage}</div> : null}

      {event?.activeRemovalImpact ? (
        <div className="notice-banner warning" role="status">
          {event.activeRemovalImpact.racerName} was scratched. {event.activeRemovalImpact.affectedHeatIds.length}{' '}
          pending heat(s) across {event.activeRemovalImpact.affectedRaceIds.length} race(s) need an operator decision.
        </div>
      ) : null}
    </>
  )
  const confirmationDialog = confirmationRequest ? (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="confirmation-title" aria-modal="true" className="confirmation-dialog" role="dialog">
        <div>
          <p className="eyebrow">Confirm</p>
          <h3 id="confirmation-title">{confirmationRequest.title}</h3>
        </div>
        <p>{confirmationRequest.message}</p>
        <div className="dialog-actions">
          <button className="secondary-action" onClick={cancelConfirmation} type="button">
            {confirmationRequest.cancelLabel ?? 'Cancel'}
          </button>
          <button
            className={confirmationRequest.destructive ? 'danger-action' : 'primary-action'}
            onClick={confirmPendingAction}
            type="button"
          >
            {confirmationRequest.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </section>
    </div>
  ) : null

  if (initialWindowContext.isPopout) {
    const Icon = activeNavigationItem.icon

    return (
      <main className="popout-shell" data-section={activeSection}>
        <header className="popout-header">
          <div>
            <p className="eyebrow">{activeNavigationItem.meta}</p>
            <h1>{activeNavigationItem.label}</h1>
          </div>
          <Icon aria-hidden="true" size={26} />
        </header>

        {notices}
        <section className="popout-content">{renderedSection}</section>
        {confirmationDialog}
      </main>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            PR
          </div>
          <div>
            <p className="eyebrow">PackRacer</p>
            <h1>Race Desk</h1>
          </div>
        </div>

        <nav className="nav-list">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id

            return (
              <button
                className="nav-button"
                data-active={isActive}
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
                <span>{item.label}</span>
                <small>{item.meta}</small>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <span>Local database</span>
          <strong>v{appVersion}</strong>
        </div>
      </aside>

      <section className="workspace" aria-labelledby="workspace-title">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeNavigationItem.meta}</p>
            <h2 id="workspace-title">{activeNavigationItem.label}</h2>
          </div>
          <div className="topbar-actions">
            <button className="secondary-action" onClick={() => void openActiveSectionPopout()} type="button">
              <ExternalLink aria-hidden="true" size={18} />
              <span>Pop Out</span>
            </button>
          </div>
        </header>

        {notices}

        <div className="status-strip" aria-label="Event readiness">
          {workflowStats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </div>

        {renderedSection}
        {confirmationDialog}
      </section>
    </main>
  )
}
