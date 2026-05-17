import {
  Award,
  ClipboardList,
  Flag,
  LayoutDashboard,
  Monitor,
  Play,
  Plus,
  Trophy,
  Users
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type SectionId = 'event' | 'registration' | 'race-control' | 'standings' | 'display'

type NavigationItem = {
  id: SectionId
  label: string
  meta: string
  icon: typeof ClipboardList
}

const navigationItems: NavigationItem[] = [
  { id: 'event', label: 'Event Setup', meta: 'Draft', icon: ClipboardList },
  { id: 'registration', label: 'Registration', meta: '0 racers', icon: Users },
  { id: 'race-control', label: 'Race Control', meta: 'Idle', icon: Flag },
  { id: 'standings', label: 'Standings', meta: 'Pending', icon: Trophy },
  { id: 'display', label: 'Display', meta: 'Closed', icon: Monitor }
]

const workflowStats = [
  { label: 'Competitors', value: '0', detail: 'No entries' },
  { label: 'Stages', value: '0', detail: 'Not configured' },
  { label: 'Heats', value: '0', detail: 'Not scheduled' },
  { label: 'Lanes', value: '4', detail: 'Default track' }
]

const upcomingWork = [
  'Create event file storage',
  'Model competitors and divisions',
  'Build timed heat scheduling',
  'Add manual result entry'
]

export function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('event')
  const [appVersion, setAppVersion] = useState('0.1.0')

  useEffect(() => {
    void window.packRacer.getVersion().then(setAppVersion)
  }, [])

  const activeNavigationItem = useMemo(
    () => navigationItems.find((item) => item.id === activeSection) ?? navigationItems[0],
    [activeSection]
  )

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
            <button className="secondary-action" type="button">
              <LayoutDashboard aria-hidden="true" size={18} />
              <span>Operator View</span>
            </button>
            <button className="primary-action" type="button">
              <Plus aria-hidden="true" size={18} />
              <span>New Event</span>
            </button>
          </div>
        </header>

        <div className="status-strip" aria-label="Event readiness">
          {workflowStats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </div>

        <section className="control-surface">
          <div className="race-panel current-state">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Current Heat</p>
                <h3>No active heat</h3>
              </div>
              <button className="icon-action" aria-label="Start race control" type="button">
                <Play aria-hidden="true" size={22} fill="currentColor" />
              </button>
            </div>

            <div className="lane-grid" aria-label="Lane assignments">
              {[1, 2, 3, 4].map((lane) => (
                <div className="lane-row" key={lane}>
                  <span>Lane {lane}</span>
                  <strong>Open</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="race-panel next-actions">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Next Build Slice</p>
                <h3>Race engine foundation</h3>
              </div>
              <Award aria-hidden="true" size={24} />
            </div>

            <ul className="work-list">
              {upcomingWork.map((workItem) => (
                <li key={workItem}>{workItem}</li>
              ))}
            </ul>
          </div>
        </section>
      </section>
    </main>
  )
}
