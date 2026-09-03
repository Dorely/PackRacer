import { SerialPort } from 'serialport'

import type { EventSessionSnapshot, RecordHeatResultsInput } from '@packracer/race-engine'
import {
  createTimerAdapter,
  defaultTimerPreferences,
  detectableTimerProfileIds,
  generateSimulatedTimerEvents,
  listTimerProfiles,
  noTimerCapabilities,
  replayTimerProfile,
  type AdvancedTimerProfile,
  type ArmedHeat,
  type ConnectTimerInput,
  type ConfigureSimulatorInput,
  type NormalizedLaneResult,
  type PhysicalTimerProfileId,
  type TimerAdapter,
  type TimerAdapterEvent,
  type TimerCapture,
  type TimerPortInfo,
  type TimerPreferences,
  type TimerProfile,
  type TimerReplayResult,
  type TimerState
} from '@packracer/timer-adapters'

import { appendAuditAction, getAppSetting, getCurrentEventSession, setAppSetting } from './event-store.ts'

const preferencesKey = 'hardwareTimerPreferences'
const transcriptLimit = 160

type StateListener = (state: TimerState) => void

function captureId(): string {
  return `timer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

function portIdentity(port: Awaited<ReturnType<typeof SerialPort.list>>[number]): string {
  const usbIdentity = [port.vendorId, port.productId, port.serialNumber].filter(Boolean)
  return usbIdentity.length > 0 ? usbIdentity.join(':') : [port.manufacturer, port.path].filter(Boolean).join(':')
}

function openPort(path: string, profile: TimerProfile): Promise<SerialPort> {
  if (!profile.serial) {
    throw new Error('The selected profile does not define serial settings.')
  }

  return new Promise((resolve, reject) => {
    const settings = profile.serial!
    const port = new SerialPort({
      path,
      autoOpen: false,
      baudRate: settings.baudRate,
      dataBits: settings.dataBits,
      stopBits: settings.stopBits,
      parity: settings.parity as never,
      rtscts: settings.rtscts
    })
    port.open((error) => error ? reject(error) : resolve(port))
  })
}

function closePort(port: SerialPort): Promise<void> {
  if (!port.isOpen) {
    return Promise.resolve()
  }

  return new Promise((resolve) => port.close(() => resolve()))
}

function writePort(port: SerialPort, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    port.write(data, (error) => {
      if (error) {
        reject(error)
        return
      }

      port.drain((drainError) => drainError ? reject(drainError) : resolve())
    })
  })
}

export class TimerService {
  private listener?: StateListener
  private serialPort?: SerialPort
  private adapter?: TimerAdapter
  private preferences: TimerPreferences = structuredClone(defaultTimerPreferences)
  private received = new Map<number, NormalizedLaneResult>()
  private expectedPhysicalLanes = new Set<number>()
  private rawFrames: string[] = []
  private warnings: string[] = []
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private acceptingCaptureId?: string
  private state: TimerState = {
    status: 'disconnected',
    selectedProfileId: defaultTimerPreferences.profileId,
    capabilities: noTimerCapabilities,
    diagnostics: [],
    simulationMode: false,
    simulatorScenario: 'normal-finish',
    simulatorVariation: 0,
    gateReleased: false
  }

  setStateListener(listener: StateListener): void {
    this.listener = listener
  }

  async initialize(): Promise<void> {
    const stored = await getAppSetting<TimerPreferences>(preferencesKey, defaultTimerPreferences)
    this.preferences = {
      ...structuredClone(defaultTimerPreferences),
      ...stored,
      advancedProfile: {
        ...defaultTimerPreferences.advancedProfile,
        ...stored.advancedProfile,
        serial: {
          ...defaultTimerPreferences.advancedProfile.serial,
          ...stored.advancedProfile?.serial
        }
      }
    }
    this.state.selectedProfileId = this.preferences.profileId
  }

  getState(): TimerState {
    return structuredClone(this.state)
  }

  getProfiles(): TimerProfile[] {
    return listTimerProfiles()
  }

  getPreferences(): TimerPreferences {
    return structuredClone(this.preferences)
  }

  async listPorts(): Promise<TimerPortInfo[]> {
    return (await SerialPort.list()).map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      vendorId: port.vendorId,
      productId: port.productId,
      identity: portIdentity(port)
    }))
  }

  async savePreferences(input: TimerPreferences): Promise<TimerPreferences> {
    this.preferences = structuredClone(input)
    await setAppSetting(preferencesKey, this.preferences)
    return this.getPreferences()
  }

  private emit(): void {
    this.listener?.(this.getState())
  }

  private log(direction: 'system' | 'received' | 'sent', message: string): void {
    this.state.diagnostics = [
      ...this.state.diagnostics,
      { id: captureId(), createdAt: new Date().toISOString(), direction, message }
    ].slice(-transcriptLimit)
  }

  private clearScheduledEvents(): void {
    for (const timer of this.timers) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }

  private async writeCommands(commands: string[]): Promise<void> {
    if (!this.serialPort) {
      return
    }

    for (const command of commands) {
      const payload = command === ' ' ? command : `${command}\r`
      this.log('sent', command === ' ' ? '<space>' : command)
      await writePort(this.serialPort, payload)
    }
  }

  private async detectProfile(portPath: string): Promise<PhysicalTimerProfileId> {
    const fallbackProfile = listTimerProfiles().find((profile) => profile.id === 'micro-wizard-fasttrack')
    if (!fallbackProfile) {
      throw new Error('Auto-detection profiles are unavailable.')
    }

    const port = await openPort(portPath, fallbackProfile)
    const adapters = detectableTimerProfileIds().map((profileId) => createTimerAdapter(profileId, this.preferences.advancedProfile))
    let response = ''
    const receive = (data: Buffer) => { response += data.toString('ascii') }
    port.on('data', receive)

    try {
      for (const adapter of adapters) {
        for (const command of adapter.probeCommands()) {
          await writePort(port, `${command}\r`)
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 850))
      const match = adapters.find((adapter) => adapter.matchesProbeResponse(response))
      if (!match) {
        throw new Error('No supported timer identified itself on the selected port. Select a profile manually.')
      }

      return match.profile.id as PhysicalTimerProfileId
    } finally {
      port.off('data', receive)
      await closePort(port)
    }
  }

  async connect(input: ConnectTimerInput): Promise<TimerState> {
    await this.disconnect(false)
    this.state = {
      ...this.state,
      status: 'connecting',
      selectedProfileId: input.profileId,
      connectedProfileId: undefined,
      profileName: undefined,
      portPath: input.portPath,
      capabilities: noTimerCapabilities,
      error: undefined,
      capture: undefined,
      armedHeat: undefined,
      simulationMode: input.profileId === 'simulator',
      gateReleased: false
    }
    this.log('system', `Connecting to ${input.profileId}.`)
    this.emit()

    if (input.profileId === 'simulator') {
      const profile = listTimerProfiles().find((candidate) => candidate.id === 'simulator')!
      this.state = {
        ...this.state,
        status: 'ready',
        connectedProfileId: 'simulator',
        profileName: profile.name,
        capabilities: profile.capabilities,
        portPath: undefined,
        simulationMode: true
      }
      this.log('system', 'Simulator connected. No serial hardware is active.')
      this.emit()
      return this.getState()
    }

    if (!input.portPath) {
      return this.fail('Select a COM port before connecting.')
    }

    try {
      const profileId = input.profileId === 'auto-detect' ? await this.detectProfile(input.portPath) : input.profileId
      this.adapter = createTimerAdapter(profileId, input.advancedProfile ?? this.preferences.advancedProfile)
      this.serialPort = await openPort(input.portPath, this.adapter.profile)
      this.serialPort.on('data', (data: Buffer) => this.receiveSerial(data))
      this.serialPort.on('error', (error) => { void this.handleMalfunction(error.message) })
      this.serialPort.on('close', () => {
        if (this.state.status !== 'disconnected') {
          void this.handleMalfunction('The timer connection closed unexpectedly.')
        }
      })
      await this.writeCommands(this.adapter.setupCommands())
      this.state = {
        ...this.state,
        status: 'ready',
        connectedProfileId: profileId,
        profileName: this.adapter.profile.name,
        capabilities: this.adapter.profile.capabilities,
        simulationMode: false,
        error: undefined
      }
      void this.rememberPhysicalConnection(profileId, input.portPath)
      this.log('system', `${this.adapter.profile.name} connected on ${input.portPath}.`)
      this.emit()
      return this.getState()
    } catch (error) {
      this.adapter = undefined
      if (this.serialPort) {
        await closePort(this.serialPort)
        this.serialPort = undefined
      }
      return this.fail(error instanceof Error ? error.message : 'The timer connection failed.')
    }
  }

  private async rememberPhysicalConnection(profileId: PhysicalTimerProfileId, path: string): Promise<void> {
    try {
      const port = (await this.listPorts()).find((candidate) => candidate.path === path)
      this.preferences = {
        ...this.preferences,
        profileId,
        portPath: path,
        portIdentity: port?.identity ?? this.preferences.portIdentity
      }
      await setAppSetting(preferencesKey, this.preferences)
    } catch (error) {
      this.log('system', `Connected, but could not remember timer selection: ${error instanceof Error ? error.message : 'unknown error'}`)
      this.emit()
    }
  }

  async disconnect(emit = true): Promise<TimerState> {
    this.clearScheduledEvents()
    const port = this.serialPort
    this.serialPort = undefined
    this.adapter = undefined
    if (port) {
      port.removeAllListeners()
      await closePort(port)
    }
    this.received.clear()
    this.expectedPhysicalLanes.clear()
    this.state = {
      ...this.state,
      status: 'disconnected',
      connectedProfileId: undefined,
      profileName: undefined,
      capabilities: noTimerCapabilities,
      armedHeat: undefined,
      capture: undefined,
      portPath: undefined,
      error: undefined,
      simulationMode: false,
      gateReleased: false
    }
    if (emit) {
      this.log('system', 'Timer disconnected.')
      this.emit()
    }
    return this.getState()
  }

  private fail(message: string): TimerState {
    this.state.status = 'error'
    this.state.error = message
    this.state.armedHeat = undefined
    this.state.gateReleased = false
    this.log('system', message)
    this.emit()
    return this.getState()
  }

  private async handleMalfunction(message: string): Promise<void> {
    const raceId = this.state.armedHeat?.raceId
    this.clearScheduledEvents()
    this.fail(message)
    await appendAuditAction('timer:malfunction', { message, profileId: this.state.connectedProfileId }, raceId)
  }

  private receiveSerial(data: Buffer): void {
    const text = data.toString('ascii')
    this.rawFrames.push(text)
    this.rawFrames = this.rawFrames.slice(-80)
    this.log('received', JSON.stringify(text))
    if (this.adapter) {
      this.processEvents(this.adapter.ingest(text))
    }
  }

  async arm(raceId: string, heatId: string, laneMapping: Record<number, number>): Promise<TimerState> {
    if (!this.state.connectedProfileId || !['ready', 'result'].includes(this.state.status)) {
      throw new Error('Connect a timer before arming a heat.')
    }

    const session = await getCurrentEventSession()
    const race = session?.event.races.find((candidate) => candidate.id === raceId)
    const heat = race?.heats.find((candidate) => candidate.id === heatId)
    if (!session || !race || !heat || race.currentHeatId !== heatId) {
      throw new Error('Only the currently selected heat can be armed.')
    }

    const lanes = heat.laneAssignments
      .filter((assignment): assignment is typeof assignment & { racerId: string } => Boolean(assignment.racerId))
      .map((assignment) => ({ lane: assignment.lane, racerId: assignment.racerId }))
    if (lanes.length === 0) {
      throw new Error('The current heat has no occupied lanes.')
    }

    const armedHeat: ArmedHeat = {
      eventId: session.event.id,
      raceId,
      heatId,
      heatNumber: heat.heatNumber,
      lanes,
      laneMapping: structuredClone(laneMapping),
      disabledLanes: [...(race.disabledLaneNumbers ?? [])],
      armedAt: new Date().toISOString()
    }
    const softwareLanes = new Set(lanes.map((lane) => lane.lane))
    this.expectedPhysicalLanes = new Set(
      Array.from({ length: race.laneCount }, (_value, index) => index + 1)
        .filter((physicalLane) => softwareLanes.has(laneMapping[physicalLane] ?? physicalLane))
    )
    if (this.expectedPhysicalLanes.size !== softwareLanes.size) {
      throw new Error('Every occupied PackRacer lane must have exactly one physical timer lane mapped to it.')
    }

    this.clearScheduledEvents()
    this.adapter?.beginHeat()
    this.received.clear()
    this.rawFrames = []
    this.warnings = []
    this.state = {
      ...this.state,
      status: 'armed',
      armedHeat,
      capture: undefined,
      error: undefined,
      gateReleased: false
    }
    if (this.adapter) {
      await this.writeCommands(this.adapter.prepareHeatCommands([...this.expectedPhysicalLanes]))
    }
    this.log('system', `Armed heat ${heat.heatNumber} (${heat.id}).`)
    this.emit()
    return this.getState()
  }

  disarm(): TimerState {
    this.clearScheduledEvents()
    this.received.clear()
    this.expectedPhysicalLanes.clear()
    this.state.armedHeat = undefined
    this.state.capture = undefined
    this.state.gateReleased = false
    this.state.status = this.state.connectedProfileId ? 'ready' : 'disconnected'
    this.log('system', 'Timer disarmed.')
    this.emit()
    return this.getState()
  }

  async reset(): Promise<TimerState> {
    if (!this.state.connectedProfileId) {
      throw new Error('Connect a timer before resetting it.')
    }
    this.clearScheduledEvents()
    if (this.adapter) {
      await this.writeCommands(this.adapter.resetCommands())
    }
    this.received.clear()
    this.state.capture = undefined
    this.state.armedHeat = undefined
    this.state.gateReleased = false
    this.state.error = undefined
    this.state.status = 'ready'
    this.log('system', 'Timer reset and ready.')
    this.emit()
    return this.getState()
  }

  async forceResults(): Promise<TimerState> {
    if (!this.state.armedHeat || !this.state.capabilities.forceResults) {
      throw new Error('Force Results is unavailable for the current timer state.')
    }
    if (this.adapter) {
      await this.writeCommands(this.adapter.forceResultsCommands())
      const timer = setTimeout(() => {
        this.timers.delete(timer)
        if (!this.state.capture && this.received.size > 0) {
          this.finalizeCapture(false)
        }
      }, 600)
      this.timers.add(timer)
    } else {
      this.finalizeCapture(false)
    }
    return this.getState()
  }

  async releaseGate(): Promise<TimerState> {
    if (!this.state.armedHeat || this.state.status !== 'armed' || this.state.gateReleased || !this.state.capabilities.gateRelease) {
      throw new Error('Gate release is unavailable until a supported timer is connected and the current heat is armed.')
    }
    if (!this.preferences.gateControlEnabled) {
      throw new Error('Enable software gate control in timer preferences before releasing the gate.')
    }
    if (this.adapter) {
      await this.writeCommands(this.adapter.releaseGateCommands())
    }
    this.state.gateReleased = true
    this.state.status = 'running'
    this.log('system', `Gate release sent for heat ${this.state.armedHeat.heatNumber}.`)
    this.emit()
    await appendAuditAction(
      this.state.simulationMode ? 'timer:simulated-gate-release' : 'timer:gate-release',
      { heatId: this.state.armedHeat.heatId, profileId: this.state.connectedProfileId },
      this.state.armedHeat.raceId
    )
    if (this.state.simulationMode) {
      this.scheduleSimulation()
    }
    return this.getState()
  }

  configureSimulator(input: ConfigureSimulatorInput): TimerState {
    this.state.simulatorScenario = input.scenario
    if (input.variation !== undefined) {
      this.state.simulatorVariation = input.variation
    }
    this.emit()
    return this.getState()
  }

  runSimulation(): TimerState {
    if (!this.state.simulationMode || !this.state.armedHeat || this.state.status !== 'armed') {
      throw new Error('Connect the simulator and arm the current heat first.')
    }
    if (this.preferences.gateControlEnabled) {
      throw new Error('Use Release Simulated Gate while software gate control is enabled.')
    }
    this.state.status = 'running'
    this.emit()
    this.scheduleSimulation()
    return this.getState()
  }

  private scheduleSimulation(): void {
    const heat = this.state.armedHeat
    if (!heat) return
    const simulatorHeat: ArmedHeat = {
      ...heat,
      lanes: [...this.expectedPhysicalLanes].map((physicalLane) => ({
        lane: physicalLane,
        racerId: heat.lanes.find((lane) => lane.lane === (heat.laneMapping[physicalLane] ?? physicalLane))?.racerId ?? ''
      }))
    }
    const events = generateSimulatedTimerEvents(simulatorHeat, this.state.simulatorScenario, this.state.simulatorVariation)
    events.forEach((event, index) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer)
        this.log('received', `[simulator] ${JSON.stringify(event)}`)
        this.processEvents([event])
        if (index === events.length - 1 && this.state.simulatorScenario === 'incomplete-result' && !this.state.capture) {
          this.finalizeCapture(false)
        }
      }, 250 + index * 180)
      this.timers.add(timer)
    })
  }

  private processEvents(events: TimerAdapterEvent[]): void {
    for (const event of events) {
      if (event.type === 'warning') {
        if (event.message === 'SIMULATED_DISCONNECT') {
          void this.handleMalfunction('Simulator disconnected during the heat.')
          continue
        }
        this.warnings.push(event.message)
        this.log('system', event.message)
        continue
      }
      if (!this.state.armedHeat) {
        this.log('system', `Ignored ${event.type} because no heat is armed.`)
        continue
      }
      if (event.type === 'race-started') {
        this.state.status = 'running'
        this.emit()
        continue
      }
      if (event.type === 'race-finished') {
        if (!this.state.capture) this.finalizeCapture(true)
        continue
      }
      if (this.state.capture) {
        this.log('system', 'Ignored a repeated result after the capture was staged.')
        continue
      }

      let physicalLane = event.physicalLane
      if (physicalLane === 0 && event.status === 'dnf') {
        physicalLane = [...this.expectedPhysicalLanes].find((lane) => !this.received.has(lane)) ?? 0
      }
      if (!this.expectedPhysicalLanes.has(physicalLane)) {
        const warning = `Ignored unexpected physical lane ${event.physicalLane}.`
        this.warnings.push(warning)
        this.log('system', warning)
        continue
      }

      const lane = this.state.armedHeat.laneMapping[physicalLane] ?? physicalLane
      const normalized: NormalizedLaneResult = {
        physicalLane,
        lane,
        status: event.status ?? 'ok',
        timeMs: event.status === 'dnf' ? undefined : event.timeMs,
        finishPosition: event.finishPosition
      }
      const previous = this.received.get(physicalLane)
      if (previous && JSON.stringify(previous) === JSON.stringify(normalized)) {
        this.log('system', `Ignored duplicate result for physical lane ${physicalLane}.`)
        continue
      }
      if (previous) {
        this.warnings.push(`Physical lane ${physicalLane} transmitted a changed result; the latest value is staged.`)
      }
      this.received.set(physicalLane, normalized)
      if (this.received.size === this.expectedPhysicalLanes.size) {
        this.finalizeCapture(true)
      } else {
        this.emit()
      }
    }
  }

  private finalizeCapture(frameComplete: boolean): void {
    const heat = this.state.armedHeat
    if (!heat || this.state.capture) return
    const results = [...this.received.values()].sort((a, b) => a.lane - b.lane)
    const missing = [...this.expectedPhysicalLanes].filter((lane) => !this.received.has(lane))
    const warnings = [...this.warnings]
    if (missing.length > 0) {
      warnings.push(`Incomplete result: missing physical lane${missing.length === 1 ? '' : 's'} ${missing.join(', ')}.`)
    }

    const timed = results.filter((result) => result.status === 'ok' && result.timeMs !== undefined)
    const tiedTimes = new Set<number>()
    timed.forEach((result, index) => {
      if (timed.some((candidate, candidateIndex) => candidateIndex !== index && candidate.timeMs === result.timeMs)) {
        tiedTimes.add(result.timeMs!)
      }
    })
    if (tiedTimes.size > 0) {
      warnings.push('One or more exact ties have no authoritative place; resolve placement before saving when required.')
    }
    if (tiedTimes.size === 0 && timed.every((result) => result.finishPosition === undefined)) {
      [...timed].sort((a, b) => a.timeMs! - b.timeMs!).forEach((result, index) => { result.finishPosition = index + 1 })
    }

    this.state.capture = {
      id: captureId(),
      profileId: this.state.connectedProfileId!,
      profileName: this.state.profileName ?? 'Hardware timer',
      raceId: heat.raceId,
      heatId: heat.heatId,
      heatNumber: heat.heatNumber,
      capturedAt: new Date().toISOString(),
      complete: frameComplete && missing.length === 0,
      simulated: this.state.simulationMode,
      simulatorScenario: this.state.simulationMode ? this.state.simulatorScenario : undefined,
      results,
      warnings,
      rawFrames: [...this.rawFrames]
    }
    this.state.status = 'result'
    this.state.gateReleased = false
    this.log('system', `Staged ${this.state.simulationMode ? 'simulated' : 'hardware'} capture for heat ${heat.heatNumber}.`)
    this.emit()
  }

  discardCapture(): TimerState {
    if (!this.state.capture) return this.getState()
    this.log('system', `Discarded capture ${this.state.capture.id}.`)
    this.state.capture = undefined
    this.state.armedHeat = undefined
    this.state.status = this.state.connectedProfileId ? 'ready' : 'disconnected'
    this.received.clear()
    this.expectedPhysicalLanes.clear()
    this.emit()
    return this.getState()
  }

  validateCapture(captureIdValue: string, raceId: string, input: RecordHeatResultsInput): TimerCapture {
    const capture = this.state.capture
    const armed = this.state.armedHeat
    if (!capture || capture.id !== captureIdValue) throw new Error('This timer capture is no longer available.')
    if (!armed || capture.raceId !== raceId || capture.heatId !== input.heatId || armed.heatId !== input.heatId) {
      throw new Error('The timer capture does not belong to the armed current heat.')
    }
    return structuredClone(capture)
  }

  async beginCaptureAcceptance(captureIdValue: string, raceId: string, input: RecordHeatResultsInput): Promise<TimerCapture> {
    if (this.acceptingCaptureId) {
      throw new Error('This timer capture is already being accepted in another window.')
    }
    this.acceptingCaptureId = captureIdValue
    try {
      const capture = this.validateCapture(captureIdValue, raceId, input)
      const session = await getCurrentEventSession()
      const race = session?.event.races.find((candidate) => candidate.id === raceId)
      const heat = race?.heats.find((candidate) => candidate.id === input.heatId)
      const armedAssignments = this.state.armedHeat?.lanes.map((lane) => `${lane.lane}:${lane.racerId}`).sort()
      const currentAssignments = heat?.laneAssignments
        .filter((lane): lane is typeof lane & { racerId: string } => Boolean(lane.racerId))
        .map((lane) => `${lane.lane}:${lane.racerId}`)
        .sort()
      if (!session || session.event.id !== this.state.armedHeat?.eventId || race?.currentHeatId !== heat?.id ||
          JSON.stringify(armedAssignments) !== JSON.stringify(currentAssignments) ||
          JSON.stringify([...(race?.disabledLaneNumbers ?? [])].sort()) !== JSON.stringify([...(this.state.armedHeat?.disabledLanes ?? [])].sort())) {
        throw new Error('The event, heat assignments, or disabled lanes changed after this timer was armed.')
      }
      return capture
    } catch (error) {
      this.acceptingCaptureId = undefined
      throw error
    }
  }

  finishCaptureAcceptance(captureIdValue: string, succeeded: boolean): void {
    if (this.acceptingCaptureId !== captureIdValue) return
    this.acceptingCaptureId = undefined
    if (succeeded) this.consumeCapture(captureIdValue)
  }

  consumeCapture(captureIdValue: string): TimerState {
    if (this.state.capture?.id !== captureIdValue) throw new Error('This timer capture has already been consumed.')
    this.state.capture = undefined
    this.state.armedHeat = undefined
    this.state.status = this.state.connectedProfileId ? 'ready' : 'disconnected'
    this.received.clear()
    this.expectedPhysicalLanes.clear()
    this.emit()
    return this.getState()
  }

  replay(profileId: PhysicalTimerProfileId, advanced?: AdvancedTimerProfile): TimerReplayResult {
    const replay = replayTimerProfile(profileId, advanced ?? this.preferences.advancedProfile)
    return { profileId, ...replay }
  }

  reconcileSession(session: EventSessionSnapshot | null): void {
    const armed = this.state.armedHeat
    if (!armed) return
    const race = session?.event.races.find((candidate) => candidate.id === armed.raceId)
    if (!session || session.event.id !== armed.eventId || !race || race.currentHeatId !== armed.heatId || !race.heats.some((heat) => heat.id === armed.heatId)) {
      this.log('system', 'Disarmed the timer because the current heat changed. Any staged capture is now stale.')
      this.clearScheduledEvents()
      this.state.armedHeat = undefined
      this.state.gateReleased = false
      this.state.status = this.state.connectedProfileId ? 'ready' : 'disconnected'
      this.emit()
    }
  }

  async shutdown(): Promise<void> {
    await this.disconnect(false)
  }
}

export const timerService = new TimerService()
