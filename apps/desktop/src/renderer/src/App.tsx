import {
  ClipboardList,
  Flag,
  LayoutDashboard,
  Monitor,
  Plus,
  Trophy,
  Users
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  AddRacerInput,
  AddStageInput,
  CreateFinalsStageInput,
  CreateProjectInput,
  ProjectSessionSnapshot,
  RecordHeatResultsInput,
  RemovalResolutionStrategy,
  UpdateProjectInput,
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
  const [session, setSession] = useState<ProjectSessionSnapshot | null>(null)
  const [selectedStageId, setSelectedStageId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!window.packRacer) {
      setErrorMessage('The PackRacer desktop bridge did not load. Restart the Electron app from npm run dev.')
      return
    }

    void window.packRacer.getVersion().then(setAppVersion)
    void window.packRacer.getCurrentProject().then((currentSession) => {
      if (currentSession) {
        setSession(currentSession)
        setSelectedStageId(currentSession.project.currentStageId ?? currentSession.project.stages[0]?.id ?? '')
      }
    })
  }, [])

  const project = session?.project ?? null

  useEffect(() => {
    if (!project) {
      setSelectedStageId('')
      return
    }

    if (!selectedStageId || !project.stages.some((stage) => stage.id === selectedStageId)) {
      setSelectedStageId(project.currentStageId ?? project.stages[0]?.id ?? '')
    }
  }, [project, selectedStageId])

  const applySession = useCallback((nextSession: ProjectSessionSnapshot | null) => {
    if (!nextSession) {
      return
    }

    setSession(nextSession)
    setSelectedStageId(nextSession.project.currentStageId ?? nextSession.project.stages[0]?.id ?? '')
  }, [])

  const runAction = useCallback(
    async (action: () => Promise<ProjectSessionSnapshot | null>): Promise<void> => {
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
      createProject: (input: CreateProjectInput) => runAction(() => getPackRacerApi().createProject(input)),
      openProject: () => runAction(() => getPackRacerApi().openProject()),
      updateProject: (input: UpdateProjectInput) => runAction(() => getPackRacerApi().updateProject(input)),
      addRacer: (input: AddRacerInput) => runAction(() => getPackRacerApi().addRacer(input)),
      updateRacer: (racerId: string, input: UpdateRacerInput) =>
        runAction(() => getPackRacerApi().updateRacer(racerId, input)),
      scratchRacer: (racerId: string) => runAction(() => getPackRacerApi().scratchRacer(racerId)),
      resolveRacerRemoval: (strategy: RemovalResolutionStrategy) =>
        runAction(() => getPackRacerApi().resolveRacerRemoval(strategy)),
      addStage: (input: AddStageInput) => runAction(() => getPackRacerApi().addStage(input)),
      updateStage: (stageId: string, input: UpdateStageInput) =>
        runAction(() => getPackRacerApi().updateStage(stageId, input)),
      generateHeats: (stageId: string) => runAction(() => getPackRacerApi().generateHeats(stageId)),
      createFinalsStage: (input: CreateFinalsStageInput) => runAction(() => getPackRacerApi().createFinalsStage(input)),
      recordHeatResults: (input: RecordHeatResultsInput) => runAction(() => getPackRacerApi().recordHeatResults(input)),
      setCurrentHeat: (heatId: string) => runAction(() => getPackRacerApi().setCurrentHeat(heatId)),
      advanceHeat: () => runAction(() => getPackRacerApi().advanceHeat())
    }),
    [runAction]
  )

  const navigationItems: NavigationItem[] = useMemo(() => {
    const activeRacers = project?.racers.filter((racer) => racer.status === 'active').length ?? 0
    const heatCount = project?.stages.reduce((total, stage) => total + stage.heats.length, 0) ?? 0
    const currentHeat = project?.stages.flatMap((stage) => stage.heats).find((heat) => heat.id === project.currentHeatId)

    return [
      { id: 'event', label: 'Event Setup', meta: project?.status ?? 'No project', icon: ClipboardList },
      { id: 'registration', label: 'Registration', meta: `${activeRacers} active`, icon: Users },
      { id: 'race-control', label: 'Race Control', meta: currentHeat ? `Heat ${currentHeat.heatNumber}` : 'Idle', icon: Flag },
      { id: 'standings', label: 'Standings', meta: heatCount > 0 ? 'Live' : 'Pending', icon: Trophy },
      { id: 'display', label: 'Display', meta: project ? 'Ready' : 'Closed', icon: Monitor }
    ]
  }, [project])

  const workflowStats = useMemo(() => {
    const activeRacers = project?.racers.filter((racer) => racer.status === 'active').length ?? 0
    const totalRacers = project?.racers.length ?? 0
    const heatCount = project?.stages.reduce((total, stage) => total + stage.heats.length, 0) ?? 0
    const completeHeats = project?.stages.reduce(
      (total, stage) => total + stage.heats.filter((heat) => heat.status === 'complete').length,
      0
    ) ?? 0

    return [
      { label: 'Competitors', value: `${activeRacers}`, detail: `${totalRacers} registered` },
      { label: 'Stages', value: `${project?.stages.length ?? 0}`, detail: project?.tournamentType ?? 'Not configured' },
      { label: 'Heats', value: `${completeHeats}/${heatCount}`, detail: heatCount > 0 ? 'Recorded / scheduled' : 'Not scheduled' },
      { label: 'Lanes', value: `${project?.laneCount ?? 4}`, detail: project?.trackName ?? 'Default track' }
    ]
  }, [project])

  const activeNavigationItem = useMemo(
    () => navigationItems.find((item) => item.id === activeSection) ?? navigationItems[0],
    [activeSection]
  )

  const sectionProps = {
    session,
    project,
    actions,
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
          <span>Local mode</span>
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
            <button className="secondary-action" onClick={actions.openProject} type="button">
              <LayoutDashboard aria-hidden="true" size={18} />
              <span>Open Project</span>
            </button>
            <button className="primary-action" onClick={() => setActiveSection('event')} type="button">
              <Plus aria-hidden="true" size={18} />
              <span>New Event</span>
            </button>
          </div>
        </header>

        {errorMessage ? <div className="notice-banner" role="alert">{errorMessage}</div> : null}

        {project?.activeRemovalImpact ? (
          <div className="notice-banner warning" role="status">
            {project.activeRemovalImpact.racerName} was scratched. {project.activeRemovalImpact.affectedHeatIds.length}{' '}
            pending heat(s) need an operator decision.
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
