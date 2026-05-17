import { ClipboardList, Flag, LayoutDashboard, Monitor, Plus, Trophy, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  AddRacerInput,
  AddStageInput,
  CreateEventInput,
  CreateFinalsStageInput,
  CreateRaceInput,
  EventSessionSnapshot,
  RecordHeatResultsInput,
  RemovalResolutionStrategy,
  UpdateEventInput,
  UpdateRaceInput,
  UpdateRacerInput,
  UpdateStageInput
} from '@packracer/race-engine'

import { DisplayMode } from './sections/DisplayMode'
import { EventSetup } from './sections/EventSetup'
import { RaceControl } from './sections/RaceControl'
import { Registration } from './sections/Registration'
import { Standings } from './sections/Standings'
import type { AppActions } from './sections/types'

type SectionId = 'event' | 'registration' | 'race-control' | 'standings' | 'display'

type NavigationItem = {
  id: SectionId
  label: string
  meta: string
  icon: typeof ClipboardList
}

function getPackRacerApi(): Window['packRacer'] {
  if (!window.packRacer) {
    throw new Error('The PackRacer desktop bridge did not load. Restart the Electron app from npm run dev.')
  }

  return window.packRacer
}

export function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('event')
  const [appVersion, setAppVersion] = useState('0.1.0')
  const [session, setSession] = useState<EventSessionSnapshot | null>(null)
  const [selectedRaceId, setSelectedRaceId] = useState('')
  const [selectedStageId, setSelectedStageId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!window.packRacer) {
      setErrorMessage('The PackRacer desktop bridge did not load. Restart the Electron app from npm run dev.')
      return
    }

    void window.packRacer.getVersion().then(setAppVersion)
    void window.packRacer.getCurrentEvent().then((currentSession) => {
      if (currentSession) {
        setSession(currentSession)
        const race = currentSession.event.races.find((candidate) => candidate.id === currentSession.event.currentRaceId) ?? currentSession.event.races[0]
        setSelectedRaceId(race?.id ?? '')
        setSelectedStageId(race?.currentStageId ?? race?.stages[0]?.id ?? '')
      }
    })
  }, [])

  const event = session?.event ?? null
  const currentRace = event?.races.find((race) => race.id === selectedRaceId) ?? event?.races[0] ?? null

  useEffect(() => {
    if (!event) {
      setSelectedRaceId('')
      setSelectedStageId('')
      return
    }

    const race = event.races.find((candidate) => candidate.id === selectedRaceId) ?? event.races[0]

    if (!race) {
      setSelectedRaceId('')
      setSelectedStageId('')
      return
    }

    if (race.id !== selectedRaceId) {
      setSelectedRaceId(race.id)
    }

    if (!selectedStageId || !race.stages.some((stage) => stage.id === selectedStageId)) {
      setSelectedStageId(race.currentStageId ?? race.stages[0]?.id ?? '')
    }
  }, [event, selectedRaceId, selectedStageId])

  const applySession = useCallback((nextSession: EventSessionSnapshot | null) => {
    if (!nextSession) {
      return
    }

    setSession(nextSession)
    const race = nextSession.event.races.find((candidate) => candidate.id === nextSession.event.currentRaceId) ?? nextSession.event.races[0]
    setSelectedRaceId(race?.id ?? '')
    setSelectedStageId(race?.currentStageId ?? race?.stages[0]?.id ?? '')
  }, [])

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
      createRace: (input: CreateRaceInput) => runAction(() => getPackRacerApi().createRace(input)),
      updateRace: (raceId: string, input: UpdateRaceInput) => runAction(() => getPackRacerApi().updateRace(raceId, input)),
      addRacer: (input: AddRacerInput) => runAction(() => getPackRacerApi().addRacer(input)),
      updateRacer: (racerId: string, input: UpdateRacerInput) =>
        runAction(() => getPackRacerApi().updateRacer(racerId, input)),
      scratchRacer: (racerId: string) => runAction(() => getPackRacerApi().scratchRacer(racerId)),
      resolveRacerRemoval: (strategy: RemovalResolutionStrategy) =>
        runAction(() => getPackRacerApi().resolveRacerRemoval(strategy)),
      addStage: (raceId: string, input: AddStageInput) => runAction(() => getPackRacerApi().addStage(raceId, input)),
      updateStage: (raceId: string, stageId: string, input: UpdateStageInput) =>
        runAction(() => getPackRacerApi().updateStage(raceId, stageId, input)),
      generateHeats: (raceId: string, stageId: string) => runAction(() => getPackRacerApi().generateHeats(raceId, stageId)),
      createFinalsStage: (raceId: string, input: CreateFinalsStageInput) =>
        runAction(() => getPackRacerApi().createFinalsStage(raceId, input)),
      recordHeatResults: (raceId: string, input: RecordHeatResultsInput) =>
        runAction(() => getPackRacerApi().recordHeatResults(raceId, input)),
      setCurrentHeat: (raceId: string, heatId: string) => runAction(() => getPackRacerApi().setCurrentHeat(raceId, heatId)),
      advanceHeat: (raceId: string) => runAction(() => getPackRacerApi().advanceHeat(raceId))
    }),
    [runAction]
  )

  const navigationItems: NavigationItem[] = useMemo(() => {
    const activeRacers = event?.racers.filter((racer) => racer.status === 'active').length ?? 0
    const heatCount = currentRace?.stages.reduce((total, stage) => total + stage.heats.length, 0) ?? 0
    const currentHeat = currentRace?.stages.flatMap((stage) => stage.heats).find((heat) => heat.id === currentRace.currentHeatId)

    return [
      { id: 'event', label: 'Event Setup', meta: event?.status ?? 'No event', icon: ClipboardList },
      { id: 'registration', label: 'Registration', meta: `${activeRacers} active`, icon: Users },
      { id: 'race-control', label: 'Race Control', meta: currentHeat ? `Heat ${currentHeat.heatNumber}` : 'Idle', icon: Flag },
      { id: 'standings', label: 'Standings', meta: heatCount > 0 ? 'Live' : 'Pending', icon: Trophy },
      { id: 'display', label: 'Display', meta: event ? currentRace?.name ?? 'Ready' : 'Closed', icon: Monitor }
    ]
  }, [event, currentRace])

  const workflowStats = useMemo(() => {
    const activeRacers = event?.racers.filter((racer) => racer.status === 'active').length ?? 0
    const totalRacers = event?.racers.length ?? 0
    const heatCount = currentRace?.stages.reduce((total, stage) => total + stage.heats.length, 0) ?? 0
    const completeHeats =
      currentRace?.stages.reduce(
        (total, stage) => total + stage.heats.filter((heat) => heat.status === 'complete').length,
        0
      ) ?? 0

    return [
      { label: 'Competitors', value: `${activeRacers}`, detail: `${totalRacers} registered` },
      { label: 'Races', value: `${event?.races.length ?? 0}`, detail: currentRace?.name ?? 'Not configured' },
      { label: 'Heats', value: `${completeHeats}/${heatCount}`, detail: heatCount > 0 ? 'Recorded / scheduled' : 'Not scheduled' },
      { label: 'Lanes', value: `${currentRace?.laneCount ?? event?.laneCount ?? 4}`, detail: event?.trackName ?? 'Default track' }
    ]
  }, [event, currentRace])

  const activeNavigationItem = useMemo(
    () => navigationItems.find((item) => item.id === activeSection) ?? navigationItems[0],
    [activeSection, navigationItems]
  )

  const sectionProps = {
    session,
    event,
    currentRace,
    actions,
    selectedRaceId,
    setSelectedRaceId,
    selectedStageId,
    setSelectedStageId
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
            <button className="secondary-action" onClick={() => setActiveSection('event')} type="button">
              <LayoutDashboard aria-hidden="true" size={18} />
              <span>Events</span>
            </button>
            <button className="primary-action" onClick={() => setActiveSection('event')} type="button">
              <Plus aria-hidden="true" size={18} />
              <span>New Event</span>
            </button>
          </div>
        </header>

        {errorMessage ? <div className="notice-banner" role="alert">{errorMessage}</div> : null}

        {event?.activeRemovalImpact ? (
          <div className="notice-banner warning" role="status">
            {event.activeRemovalImpact.racerName} was scratched. {event.activeRemovalImpact.affectedHeatIds.length}{' '}
            pending heat(s) across {event.activeRemovalImpact.affectedRaceIds.length} race(s) need an operator decision.
          </div>
        ) : null}

        <div className="status-strip" aria-label="Event readiness">
          {workflowStats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </div>

        {activeSection === 'event' ? <EventSetup {...sectionProps} /> : null}
        {activeSection === 'registration' ? <Registration {...sectionProps} /> : null}
        {activeSection === 'race-control' ? <RaceControl {...sectionProps} /> : null}
        {activeSection === 'standings' ? <Standings {...sectionProps} /> : null}
        {activeSection === 'display' ? <DisplayMode {...sectionProps} /> : null}
      </section>
    </main>
  )
}