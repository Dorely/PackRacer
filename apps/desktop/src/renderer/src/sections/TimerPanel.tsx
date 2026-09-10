import { Plug, RefreshCw, Settings, Unplug, Usb, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { Heat, Race } from '@packracer/race-engine'
import type {
  AdvancedTimerProfile,
  PhysicalTimerProfileId,
  TimerPreferences,
  TimerProfile,
  TimerProfileId,
  TimerReplayResult,
  TimerState
} from '@packracer/timer-adapters'

import type { AppActions } from './types'

type TimerPanelProps = {
  actions: AppActions
  currentRace: Race
  currentHeat?: Heat
  profiles: TimerProfile[]
  ports: Array<{ path: string; identity: string; manufacturer?: string; simulated?: boolean }>
  preferences: TimerPreferences
  state: TimerState
  developerMode: boolean
}

function diagnosticTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function TimerPanel({ actions, currentRace, currentHeat, profiles, ports, preferences, state, developerMode }: TimerPanelProps) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (open) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [open])
  const [selectedProfileId, setSelectedProfileId] = useState<TimerProfileId>(preferences.profileId)
  const [selectedPortPath, setSelectedPortPath] = useState(preferences.portPath)
  const [profileDirty, setProfileDirty] = useState(false)
  const [portDirty, setPortDirty] = useState(false)
  const [draftPreferences, setDraftPreferences] = useState<TimerPreferences>(preferences)
  const [replayProfileId, setReplayProfileId] = useState<PhysicalTimerProfileId>('micro-wizard-fasttrack')
  const [replay, setReplay] = useState<TimerReplayResult | null>(null)

  useEffect(() => {
    setDraftPreferences(preferences)
    if (state.status === 'disconnected' && !profileDirty) {
      setSelectedProfileId(preferences.profileId)
    }
    if (state.status === 'disconnected' && !portDirty) {
      setSelectedPortPath(ports.find((port) => port.identity === preferences.portIdentity)?.path ?? preferences.portPath)
    }
    if ((state.status === 'disconnected' || state.status === 'error') && selectedPortPath && !ports.some((port) => port.path === selectedPortPath)) {
      setSelectedPortPath('')
      setPortDirty(false)
    }
  }, [preferences, ports, profileDirty, portDirty, selectedPortPath, state.status])

  const laneNumbers = useMemo(
    () => Array.from({ length: currentRace.laneCount }, (_value, index) => index + 1),
    [currentRace.laneCount]
  )
  const connected = Boolean(state.connectedProfileId) && state.status !== 'error'
  const connectionBusy = connected || state.status === 'connecting'
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId)
  const hardwareReplayProfiles = profiles.filter(
    (profile): profile is TimerProfile & { id: PhysicalTimerProfileId } => profile.category === 'hardware' || profile.id === 'advanced'
  )
  const captureIsCurrent = state.capture?.raceId === currentRace.id && state.capture?.heatId === currentHeat?.id

  const updateAdvanced = (patch: Partial<AdvancedTimerProfile>) => {
    setDraftPreferences((previous) => ({
      ...previous,
      advancedProfile: { ...previous.advancedProfile, ...patch }
    }))
  }

  const saveSettings = async () => {
    const selectedPort = ports.find((port) => port.path === selectedPortPath)
    const physicalProfileId = selectedProfileId !== 'auto-detect'
      ? selectedProfileId
      : draftPreferences.profileId
    const next = {
      ...draftPreferences,
      profileId: physicalProfileId,
      portPath: selectedPort?.simulated ? draftPreferences.portPath : selectedPortPath,
      portIdentity: selectedPort?.simulated ? draftPreferences.portIdentity : selectedPort?.identity
    }
    setDraftPreferences(next)
    await actions.saveTimerPreferences(next)
  }

  const connect = async () => {
    const advancedHasNoHandshake = selectedProfileId === 'advanced' &&
      !draftPreferences.advancedProfile.probeCommand.trim() &&
      !draftPreferences.advancedProfile.probeResponseText.trim()
    const confirmUnverified = advancedHasNoHandshake
      ? window.confirm('This Advanced profile has no identification handshake. PackRacer can open the selected port, but cannot verify the attached hardware. Connect as Unverified?')
      : false
    if (advancedHasNoHandshake && !confirmUnverified) return
    await saveSettings()
    await actions.connectTimer({
      profileId: selectedProfileId,
      portPath: selectedPortPath,
      advancedProfile: draftPreferences.advancedProfile,
      confirmUnverified
    })
  }

  const setMapping = (physicalLane: number, packRacerLane: number) => {
    setDraftPreferences((previous) => ({
      ...previous,
      laneMapping: { ...previous.laneMapping, [physicalLane]: packRacerLane }
    }))
  }

  const arm = async () => {
    if (!currentHeat) return
    await actions.armTimer(currentRace.id, currentHeat.id, preferences.laneMapping)
  }

  const runReplay = async () => {
    setReplay(await actions.replayTimerProtocol(replayProfileId))
  }

  return (
    <section className="timer-panel">
      <div className="timer-operations">
        <div className="timer-operation-heading">
          <span className="timer-summary-title"><Usb aria-hidden="true" size={18} /><strong>{state.profileName ?? 'Hardware timer'}</strong></span>
          <span className={`timer-status status-${state.status}`}>{state.status}</span>
          {state.connectionVerification === 'unverified' ? <span className="timer-status status-unverified">UNVERIFIED</span> : null}
          <button className="secondary-action" onClick={() => setOpen(true)} type="button"><Settings aria-hidden="true" size={16} />Timer Settings</button>
        </div>
        {state.error ? <p className="timer-error" role="alert">{state.error}</p> : null}
        {connected ? <div className="button-row timer-race-actions">
          {state.armedHeat ? <button className="secondary-action" onClick={() => void actions.disarmTimer()} type="button">Disarm</button> : <button className="primary-action" disabled={!currentHeat || !['ready', 'result'].includes(state.status)} onClick={() => void arm()} type="button">Arm Current Heat</button>}
          {state.status === 'armed' && state.capabilities.gateRelease ? <button className="primary-action" onClick={() => void actions.releaseTimerGate()} type="button">Release Gate</button> : null}
          {state.capabilities.reset ? <button className="secondary-action" onClick={() => void actions.resetTimer()} type="button">Reset</button> : null}
          {state.capabilities.forceResults && state.armedHeat ? <button className="secondary-action" onClick={() => void actions.forceTimerResults()} type="button">Force Results</button> : null}
        </div> : null}
        {state.capture ? (
          <div className="timer-capture" data-stale={!captureIsCurrent}>
            <div><strong>Timer capture staged</strong><span>Heat {state.capture.heatNumber} · {state.capture.results.length} lane result(s){state.capture.complete ? '' : ' · incomplete'}</span></div>
            {state.capture.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            {!captureIsCurrent ? <p>This capture is stale and cannot populate the selected heat.</p> : null}
            <button className="secondary-action" onClick={() => void actions.discardTimerCapture()} type="button">Discard Capture</button>
          </div>
        ) : null}
      </div>
      <dialog ref={dialogRef} className="timer-settings-dialog" aria-labelledby="timer-settings-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
        <div className="panel-heading timer-dialog-heading">
          <h3 id="timer-settings-title">Timer Settings</h3>
          <button className="icon-action" aria-label="Close timer settings" onClick={() => setOpen(false)} type="button"><X aria-hidden="true" size={22} /></button>
        </div>
        <div className="timer-panel-body">
          <div className="timer-setup-grid">
            <label>
              <span>Timer profile</span>
              <select disabled={connectionBusy} value={selectedProfileId} onChange={(event) => { setProfileDirty(true); setSelectedProfileId(event.target.value as TimerProfileId) }}>
                {(['automatic', 'hardware', 'advanced'] as const).map((category) => {
                  const categoryProfiles = profiles.filter((profile) => profile.category === category)
                  return categoryProfiles.length ? (
                    <optgroup key={category} label={category[0].toUpperCase() + category.slice(1)}>
                      {categoryProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                    </optgroup>
                  ) : null
                })}
              </select>
            </label>

            <label>
              <span>Available port</span>
              <div className="inline-field-actions">
                <select disabled={connectionBusy} value={selectedPortPath} onChange={(event) => { setPortDirty(true); setSelectedPortPath(event.target.value) }}>
                  <option value="">Select a scanned port</option>
                  {ports.map((port) => <option key={port.path} value={port.path}>{port.path}{port.manufacturer ? ` — ${port.manufacturer}` : ''}{port.simulated ? ' (virtual)' : ''}</option>)}
                </select>
                <button className="secondary-action timer-scan-action" disabled={connectionBusy} onClick={() => void actions.scanTimerPorts()} title="Scan for connected serial timers" type="button">
                  <RefreshCw aria-hidden="true" size={18} />
                  <span>Scan</span>
                </button>
              </div>
            </label>
          </div>
          <p className="timer-profile-description">{selectedProfile?.description}</p>

          {selectedProfileId === 'advanced' && !connected ? (
            <details className="timer-details">
              <summary>Advanced serial profile</summary>
              <div className="advanced-timer-grid">
                <label><span>Name</span><input value={draftPreferences.advancedProfile.name} onChange={(event) => updateAdvanced({ name: event.target.value })} /></label>
                <label><span>Baud</span><input inputMode="numeric" value={draftPreferences.advancedProfile.serial.baudRate} onChange={(event) => updateAdvanced({ serial: { ...draftPreferences.advancedProfile.serial, baudRate: Number(event.target.value) || 9600 } })} /></label>
                <label><span>Data bits</span><select value={draftPreferences.advancedProfile.serial.dataBits} onChange={(event) => updateAdvanced({ serial: { ...draftPreferences.advancedProfile.serial, dataBits: Number(event.target.value) as 5 | 6 | 7 | 8 } })}><option>5</option><option>6</option><option>7</option><option>8</option></select></label>
                <label><span>Stop bits</span><select value={draftPreferences.advancedProfile.serial.stopBits} onChange={(event) => updateAdvanced({ serial: { ...draftPreferences.advancedProfile.serial, stopBits: Number(event.target.value) as 1 | 1.5 | 2 } })}><option value="1">1</option><option value="1.5">1.5</option><option value="2">2</option></select></label>
                <label><span>Parity</span><select value={draftPreferences.advancedProfile.serial.parity} onChange={(event) => updateAdvanced({ serial: { ...draftPreferences.advancedProfile.serial, parity: event.target.value as AdvancedTimerProfile['serial']['parity'] } })}><option>none</option><option>even</option><option>odd</option><option>mark</option><option>space</option></select></label>
                <label><span>Line ending</span><select value={draftPreferences.advancedProfile.lineEnding} onChange={(event) => updateAdvanced({ lineEnding: event.target.value as AdvancedTimerProfile['lineEnding'] })}><option value="any">Any</option><option value="cr">CR</option><option value="lf">LF</option><option value="crlf">CRLF</option></select></label>
                <label><span>Record layout</span><select value={draftPreferences.advancedProfile.layout} onChange={(event) => updateAdvanced({ layout: event.target.value as AdvancedTimerProfile['layout'] })}><option value="lane-time-line">Lane/time line</option><option value="letter-equals-time">Lane=time</option><option value="ordered-lane-time-pairs">Ordered lane/time pairs</option></select></label>
                <label><span>Lane style</span><select value={draftPreferences.advancedProfile.laneStyle} onChange={(event) => updateAdvanced({ laneStyle: event.target.value as 'number' | 'letter' })}><option value="number">Numeric</option><option value="letter">Letter</option></select></label>
                <label><span>Time unit</span><select value={draftPreferences.advancedProfile.timeUnit} onChange={(event) => updateAdvanced({ timeUnit: event.target.value as 'seconds' | 'milliseconds' })}><option value="seconds">Seconds</option><option value="milliseconds">Milliseconds</option></select></label>
                {(['completionText', 'probeCommand', 'probeResponseText', 'setupCommand', 'resetCommand', 'forceResultsCommand', 'releaseGateCommand'] as const).map((field) => (
                  <label key={field}><span>{field.replace(/([A-Z])/g, ' $1')}</span><input value={draftPreferences.advancedProfile[field]} onChange={(event) => updateAdvanced({ [field]: event.target.value })} /></label>
                ))}
              </div>
            </details>
          ) : null}

          <div className="button-row timer-connect-actions">
            {!connected ? <button className="primary-action" disabled={!selectedPortPath || connectionBusy} onClick={() => void connect()} type="button"><Plug aria-hidden="true" size={18} />Connect</button> : null}
            {connected ? <button className="secondary-action" onClick={() => void actions.disconnectTimer()} type="button"><Unplug aria-hidden="true" size={18} />Disconnect</button> : null}
            {developerMode ? <button className="secondary-action" onClick={() => void actions.openTimerSimulator()} type="button">Open Timer Simulator</button> : null}
            <button className="secondary-action" onClick={() => void saveSettings()} type="button">Save Settings</button>
            <span className={`timer-status status-${state.status}`}>{state.status}</span>
            {state.connectionVerification === 'unverified' ? <span className="timer-status status-unverified">UNVERIFIED</span> : null}
            {state.error ? <span className="timer-error">{state.error}</span> : null}
          </div>

          {connected ? (
            <>
              <div className="timer-mapping">
                <strong>Physical lane mapping</strong>
                <div className="timer-lane-map">
                  {laneNumbers.map((physicalLane) => (
                    <label key={physicalLane}>
                      <span>Timer {physicalLane}</span>
                      <select value={draftPreferences.laneMapping[physicalLane] ?? physicalLane} onChange={(event) => setMapping(physicalLane, Number(event.target.value))}>
                        {laneNumbers.map((lane) => <option key={lane} value={lane}>PackRacer {lane}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

            </>
          ) : null}

          <details className="timer-details">
            <summary>Diagnostics and raw protocol replay</summary>
            <div className="replay-controls">
              <select value={replayProfileId} onChange={(event) => setReplayProfileId(event.target.value as PhysicalTimerProfileId)}>{hardwareReplayProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>
              <button className="secondary-action" onClick={() => void runReplay()} type="button">Replay Bundled Transcript</button>
            </div>
            {replay ? <pre className="protocol-replay">Chunks: {JSON.stringify(replay.chunks, null, 2)}{`\n\n`}Normalized: {JSON.stringify(replay.events, null, 2)}</pre> : null}
            <div className="timer-transcript" aria-label="Timer diagnostic transcript">
              {state.diagnostics.slice(-40).map((entry) => <div key={entry.id}><time>{diagnosticTime(entry.createdAt)}</time><span>{entry.direction}</span><code>{entry.message}</code></div>)}
              {state.diagnostics.length === 0 ? <p className="empty-state">No timer activity yet.</p> : null}
            </div>
          </details>
        </div>
      </dialog>
    </section>
  )
}
