import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import {
  noTimerCapabilities,
  type BuiltInTimerProfileId,
  type SimulatorScenario,
  type TimerProfile,
  type TimerSimulatorState,
  type TimerState
} from '@packracer/timer-adapters'

import './styles.css'

const scenarioLabels: Record<SimulatorScenario, string> = {
  'normal-finish': 'Normal finish',
  'close-finish': 'Close finish',
  'exact-tie': 'Exact tie',
  'explicit-dnf': 'Explicit DNF',
  'incomplete-result': 'Incomplete result',
  'duplicate-transmission': 'Duplicate transmission',
  'disconnect-during-heat': 'Disconnect during heat'
}

const initialSimulatorState: TimerSimulatorState = {
  active: true,
  profileId: 'micro-wizard-fasttrack',
  scenario: 'normal-finish',
  variation: 0,
  connected: false,
  diagnostics: []
}

const initialTimerState: TimerState = {
  status: 'disconnected',
  selectedProfileId: 'micro-wizard-fasttrack',
  capabilities: noTimerCapabilities,
  diagnostics: [],
  simulationMode: false,
  gateReleased: false
}

function decodeEscapedBytes(value: string): string {
  return value.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\t/g, '\t')
}

function TimerSimulatorApp() {
  const [state, setState] = useState<TimerSimulatorState>(initialSimulatorState)
  const [timerState, setTimerState] = useState<TimerState>(initialTimerState)
  const [profiles, setProfiles] = useState<TimerProfile[]>([])
  const [rawData, setRawData] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void window.packRacer.getTimerSimulatorState().then(setState)
    void window.packRacer.getTimerState().then(setTimerState)
    void window.packRacer.getTimerProfiles().then(setProfiles)
    const removeSimulatorListener = window.packRacer.onTimerSimulatorUpdated(setState)
    const removeTimerListener = window.packRacer.onTimerUpdated(setTimerState)
    return () => {
      removeSimulatorListener()
      removeTimerListener()
    }
  }, [])

  const builtInProfiles = useMemo(
    () => profiles.filter((profile): profile is TimerProfile & { id: BuiltInTimerProfileId } => profile.category === 'hardware'),
    [profiles]
  )

  const configure = async (input: Parameters<typeof window.packRacer.configureTimerSimulator>[0]) => {
    try {
      setError('')
      setState(await window.packRacer.configureTimerSimulator(input))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The simulator setting could not be changed.')
    }
  }

  const sendHeat = async () => {
    try {
      setError('')
      setState(await window.packRacer.sendTimerSimulatorHeat())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The simulated heat could not be sent.')
    }
  }

  const sendRaw = async () => {
    try {
      setError('')
      setState(await window.packRacer.sendTimerSimulatorRaw(decodeEscapedBytes(rawData)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The raw serial data could not be sent.')
    }
  }

  const connectedToThisPort = state.connected && timerState.simulationMode
  const profileMatches = timerState.connectedProfileId === state.profileId
  const selectedProfile = builtInProfiles.find((profile) => profile.id === state.profileId)
  const awaitingAutomaticGateResult = Boolean(selectedProfile?.capabilities.gateRelease && timerState.gateReleased)
  const canSendHeat = connectedToThisPort && profileMatches && ['armed', 'running'].includes(timerState.status) && !awaitingAutomaticGateResult

  return (
    <main className="timer-simulator-shell">
      <header className="timer-simulator-header">
        <div>
          <span className="eyebrow">VIRTUAL SERIAL DEVICE</span>
          <h1>Timer Simulator</h1>
          <p>This window owns the PackRacer virtual timer port. Closing it removes the port and drops its connection.</p>
        </div>
        <span className="simulation-pill">SIMULATOR ACTIVE</span>
      </header>

      {error ? <div className="notice-banner" role="alert">{error}</div> : null}

      <section className="timer-simulator-card">
        <div className="timer-simulator-status-grid">
          <div><span>Virtual port</span><strong>PACKRACER-SIM</strong></div>
          <div><span>Race Control</span><strong>{connectedToThisPort ? timerState.status : 'Not connected'}</strong></div>
          <div><span>Armed heat</span><strong>{state.armedHeatNumber ? `Heat ${state.armedHeatNumber}` : 'None'}</strong></div>
        </div>
        <label>
          <span>Hardware to emulate</span>
          <select disabled={state.connected} value={state.profileId} onChange={(event) => void configure({ profileId: event.target.value as BuiltInTimerProfileId })}>
            {builtInProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
        <p className="field-help">In Race Control, choose the same hardware profile and select PACKRACER-SIM from the scanned ports.</p>
        {state.connected && !profileMatches ? <p className="timer-error">Race Control is connected with a different hardware profile.</p> : null}
      </section>

      <section className="timer-simulator-card">
        <div className="timer-simulator-section-heading">
          <div><span className="eyebrow">PROTOCOL OUTPUT</span><h2>Send a race result</h2></div>
          <span>Variation {state.variation}</span>
        </div>
        <div className="timer-simulator-controls">
          <label><span>Scenario</span><select value={state.scenario} onChange={(event) => void configure({ scenario: event.target.value as SimulatorScenario })}>{Object.entries(scenarioLabels).map(([id, label]) => <option disabled={id === 'explicit-dnf' && state.profileId !== 'newbold' && state.profileId !== 'the-judge'} key={id} value={id}>{label}</option>)}</select></label>
          <button className="secondary-action" onClick={() => void configure({ variation: state.variation + 1 })} type="button">New variation</button>
          <button className="primary-action" disabled={!canSendHeat} onClick={() => void sendHeat()} type="button">Send Simulated Heat</button>
        </div>
        {selectedProfile?.capabilities.gateRelease ? <p className="field-help">When Race Control releases the emulated gate, the simulator automatically chooses a fresh randomized variation and sends this scenario after a short race delay.</p> : null}
        {state.profileId !== 'newbold' && state.profileId !== 'the-judge' ? <p className="field-help">This protocol has no documented DNF record. Use Incomplete Result, then Force Results in Race Control.</p> : null}
        {!canSendHeat && !awaitingAutomaticGateResult ? <p className="field-help">Connect the matching profile to PACKRACER-SIM and arm a heat before sending results.</p> : null}
      </section>

      <section className="timer-simulator-card">
        <span className="eyebrow">MANUAL BYTES</span>
        <h2>Send raw serial data</h2>
        <label><span>ASCII data (`\\r` and `\\n` are converted)</span><textarea rows={3} value={rawData} onChange={(event) => setRawData(event.target.value)} placeholder={'A=3.012! B=3.045"\\r\\n'} /></label>
        <button className="secondary-action" disabled={!connectedToThisPort || rawData.length === 0} onClick={() => void sendRaw()} type="button">Send Raw Data</button>
      </section>

      <section className="timer-simulator-card timer-simulator-log">
        <span className="eyebrow">VIRTUAL PORT TRANSCRIPT</span>
        <div className="timer-transcript" aria-label="Virtual timer transcript">
          {state.diagnostics.slice(-60).map((entry) => <div key={entry.id}><time>{new Date(entry.createdAt).toLocaleTimeString()}</time><span>{entry.direction}</span><code>{entry.message}</code></div>)}
          {state.diagnostics.length === 0 ? <p className="empty-state">Waiting for Race Control to open the port.</p> : null}
        </div>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode><TimerSimulatorApp /></StrictMode>)
