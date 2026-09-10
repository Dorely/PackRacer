import { SerialPort } from 'serialport'

import type { EventSessionSnapshot, RecordHeatResultsInput } from '@packracer/race-engine'
import {
  createTimerAdapter,
  defaultTimerPreferences,
  detectableTimerProfileIds,
  encodeSimulatedTimerTransmission,
  generateSimulatedTimerEvents,
  listTimerProfiles,
  noTimerCapabilities,
  replayTimerProfile,
  simulatorProbeResponse,
  timerSimulatorPortPath,
  type AdvancedTimerProfile,
  type ArmedHeat,
  type BuiltInTimerProfileId,
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
  type TimerSimulatorState,
  type TimerState
} from '@packracer/timer-adapters'

import { appendAuditAction, getAppSetting, getCurrentEventSession, setAppSetting } from './event-store.ts'
import { normalizeTimerCapture } from './timer-capture.ts'

const preferencesKey = 'hardwareTimerPreferences'
const transcriptLimit = 160

type StateListener = (state: TimerState) => void
type PortsListener = (ports: TimerPortInfo[]) => void
type SimulatorStateListener = (state: TimerSimulatorState) => void

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
  private portsListener?: PortsListener
  private simulatorListener?: SimulatorStateListener
  private serialPort?: SerialPort
  private virtualPortConnected = false
  private connectionResponse = ''
  private adapter?: TimerAdapter
  private preferences: TimerPreferences = structuredClone(defaultTimerPreferences)
  private received = new Map<number, NormalizedLaneResult>()
  private expectedPhysicalLanes = new Set<number>()
  private rawFrames: string[] = []
  private warnings: string[] = []
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private acceptingCaptureId?: string
  private simulatorState: TimerSimulatorState = {
    active: false,
    profileId: 'micro-wizard-fasttrack',
    scenario: 'normal-finish',
    variation: 0,
    connected: false,
    diagnostics: []
  }
  private state: TimerState = {
    status: 'disconnected',
    selectedProfileId: defaultTimerPreferences.profileId,
    capabilities: noTimerCapabilities,
    diagnostics: [],
    simulationMode: false,
    gateReleased: false
  }

  setStateListener(listener: StateListener): void {
    this.listener = listener
  }

  setPortsListener(listener: PortsListener): void {
    this.portsListener = listener
  }

  setSimulatorStateListener(listener: SimulatorStateListener): void {
    this.simulatorListener = listener
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
    const ports: TimerPortInfo[] = (await SerialPort.list()).map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      vendorId: port.vendorId,
      productId: port.productId,
      identity: portIdentity(port)
    }))
    if (this.simulatorState.active) {
      ports.push({
        path: timerSimulatorPortPath,
        manufacturer: 'PackRacer Timer Simulator',
        identity: timerSimulatorPortPath,
        simulated: true
      })
    }
    return ports
  }

  getSimulatorState(): TimerSimulatorState {
    return structuredClone({
      ...this.simulatorState,
      connected: this.virtualPortConnected,
      connectedProfileId: this.virtualPortConnected ? this.state.connectedProfileId : undefined,
      armedHeatNumber: this.virtualPortConnected ? this.state.armedHeat?.heatNumber : undefined
    })
  }

  async activateSimulator(): Promise<TimerSimulatorState> {
    this.simulatorState.active = true
    this.simulatorLog('system', 'Virtual timer port activated.')
    await this.emitPorts()
    this.emitSimulator()
    return this.getSimulatorState()
  }

  async deactivateSimulator(): Promise<void> {
    this.simulatorState.active = false
    this.simulatorLog('system', 'Virtual timer port deactivated.')
    if (this.virtualPortConnected) {
      await this.handleMalfunction('The timer simulator window closed and its virtual port was removed.')
      this.virtualPortConnected = false
    }
    await this.emitPorts()
    this.emitSimulator()
  }

  configureSimulator(input: ConfigureSimulatorInput): TimerSimulatorState {
    if (input.profileId && this.virtualPortConnected && input.profileId !== this.simulatorState.profileId) {
      throw new Error('Disconnect PackRacer from the virtual timer port before changing the emulated hardware.')
    }
    const profileId = input.profileId ?? this.simulatorState.profileId
    const scenario = input.scenario ?? this.simulatorState.scenario
    if (scenario === 'explicit-dnf' && profileId !== 'newbold' && profileId !== 'the-judge' && profileId !== 'dfgtec-pdt') {
      throw new Error('This protocol has no documented DNF record. Use Incomplete Result and Force Results for this profile.')
    }
    if (input.profileId) this.simulatorState.profileId = input.profileId
    if (input.scenario) this.simulatorState.scenario = input.scenario
    if (input.variation !== undefined) this.simulatorState.variation = input.variation
    this.emitSimulator()
    return this.getSimulatorState()
  }

  async savePreferences(input: TimerPreferences): Promise<TimerPreferences> {
    this.preferences = structuredClone(input)
    await setAppSetting(preferencesKey, this.preferences)
    return this.getPreferences()
  }

  private emit(): void {
    this.listener?.(this.getState())
    this.emitSimulator()
  }

  private async emitPorts(): Promise<void> {
    this.portsListener?.(await this.listPorts())
  }

  private emitSimulator(): void {
    this.simulatorListener?.(this.getSimulatorState())
  }

  private log(direction: 'system' | 'received' | 'sent', message: string): void {
    this.state.diagnostics = [
      ...this.state.diagnostics,
      { id: captureId(), createdAt: new Date().toISOString(), direction, message }
    ].slice(-transcriptLimit)
  }

  private simulatorLog(direction: 'system' | 'received' | 'sent', message: string): void {
    this.simulatorState.diagnostics = [
      ...this.simulatorState.diagnostics,
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
    for (const command of commands) {
      const payload = command === ' ' ? command : `${command}\r`
      this.log('sent', command === ' ' ? '<space>' : command)
      await this.writeTransport(payload)
      if (this.adapter?.profile.id === 'dfgtec-pdt') {
        // PDT pauses for 100 ms while consuming a mask lane or resetting.
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    }
  }

  private async openTransport(path: string, profile: TimerProfile): Promise<void> {
    this.connectionResponse = ''
    if (path === timerSimulatorPortPath) {
      if (!this.simulatorState.active) {
        throw new Error('Open the Timer Simulator window before connecting to its virtual port.')
      }
      this.virtualPortConnected = true
      this.emitSimulator()
      return
    }

    const port = await openPort(path, profile)
    this.serialPort = port
    port.on('data', (data: Buffer) => this.receiveSerial(data))
    port.on('error', (error) => { void this.handleMalfunction(error.message) })
    port.on('close', () => {
      if (this.serialPort === port && this.state.status !== 'disconnected') {
        void this.handleMalfunction('The timer connection closed unexpectedly.')
      }
    })
    if (profile.id === 'dfgtec-pdt') {
      // Opening an Uno USB serial port can reset it into its bootloader.
      await new Promise((resolve) => setTimeout(resolve, 2500))
    }
  }

  private async closeTransport(): Promise<void> {
    const port = this.serialPort
    this.serialPort = undefined
    if (port) {
      port.removeAllListeners()
      await closePort(port)
    }
    this.virtualPortConnected = false
    this.connectionResponse = ''
    this.emitSimulator()
  }

  private async writeTransport(data: string): Promise<void> {
    if (this.virtualPortConnected) {
      this.simulatorLog('received', JSON.stringify(data))
      const response = simulatorProbeResponse(this.simulatorState.profileId, data)
      if (response) {
        const timer = setTimeout(() => {
          this.timers.delete(timer)
          if (!this.virtualPortConnected) return
          this.simulatorLog('sent', JSON.stringify(response))
          this.receiveSerial(Buffer.from(response, 'ascii'))
          this.emitSimulator()
        }, 40)
        this.timers.add(timer)
      }
      if (this.isSimulatorGateRelease(data)) {
        this.scheduleSimulatorGateResult()
      }
      this.emitSimulator()
      return
    }
    if (!this.serialPort) throw new Error('The timer port is not open.')
    await writePort(this.serialPort, data)
  }

  private isSimulatorGateRelease(data: string): boolean {
    if (!this.adapter?.profile.capabilities.gateRelease || !this.state.armedHeat) return false
    return this.adapter.releaseGateCommands().some((command) => {
      const payload = command === ' ' ? command : `${command}\r`
      return data === payload
    })
  }

  private scheduleSimulatorGateResult(): void {
    const previousVariation = this.simulatorState.variation
    let variation = Math.floor(Math.random() * 1_000_000_000)
    if (variation === previousVariation) variation = (variation + 1) % 1_000_000_000
    this.simulatorState.variation = variation
    this.simulatorLog(
      'system',
      `Gate release received. Running ${this.simulatorState.scenario} with randomized variation ${variation}.`
    )
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      try {
        this.sendSimulatorHeat()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The emulated timer could not send its automatic result.'
        this.simulatorLog('system', message)
        this.emitSimulator()
      }
    }, 750)
    this.timers.add(timer)
  }

  private async verifyAdapter(adapter: TimerAdapter, allowUnverifiedAdvanced = false): Promise<'verified' | 'unverified'> {
    const probes = adapter.probeCommands()
    if (probes.length === 0) {
      if (this.virtualPortConnected && adapter.profile.id === this.simulatorState.profileId) return 'verified'
      if (adapter.profile.id === 'advanced' && allowUnverifiedAdvanced) return 'unverified'
      if (adapter.profile.id === 'newbold') {
        this.connectionResponse = ''
        await this.writeCommands(adapter.setupCommands())
        await new Promise((resolve) => setTimeout(resolve, 1_200))
        adapter.beginHeat()
        const response = this.connectionResponse.endsWith('\n') || this.connectionResponse.endsWith('\r')
          ? this.connectionResponse
          : `${this.connectionResponse}\r\n`
        const identified = adapter.ingest(response).some((event) => event.type === 'lane-result') || /NewBold|DT[128]000/i.test(response)
        adapter.beginHeat()
        if (identified) return 'verified'
        throw new Error('No NewBold timer data was received. Connect the timer before power-up, then power-cycle it while connecting so its startup or result text can be observed.')
      }
      throw new Error(`${adapter.profile.name} cannot be verified because no probe command and response are configured.`)
    }

    this.connectionResponse = ''
    await this.writeCommands(probes)
    await new Promise((resolve) => setTimeout(resolve, 850))
    if (!adapter.matchesProbeResponse(this.connectionResponse)) {
      throw new Error(`${adapter.profile.name} did not identify itself on the selected port.`)
    }
    return 'verified'
  }

  private async detectProfile(portPath: string): Promise<PhysicalTimerProfileId> {
    const fallbackProfile = listTimerProfiles().find((profile) => profile.id === 'micro-wizard-fasttrack')
    if (!fallbackProfile) {
      throw new Error('Auto-detection profiles are unavailable.')
    }

    const adapters = detectableTimerProfileIds().map((profileId) => createTimerAdapter(profileId, this.preferences.advancedProfile))

    try {
      await this.openTransport(portPath, fallbackProfile)
      this.connectionResponse = ''
      for (const adapter of adapters) {
        await this.writeCommands(adapter.probeCommands())
      }

      await new Promise((resolve) => setTimeout(resolve, 850))
      const match = adapters.find((adapter) => adapter.matchesProbeResponse(this.connectionResponse))
      if (!match) {
        throw new Error('No supported timer identified itself on the selected port.')
      }

      return match.profile.id as PhysicalTimerProfileId
    } finally {
      await this.closeTransport()
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
      simulationMode: input.portPath === timerSimulatorPortPath,
      gateReleased: false,
      connectionVerification: undefined
    }
    this.log('system', `Connecting to ${input.profileId}.`)
    this.emit()

    if (!input.portPath) {
      return this.fail('Select a COM port before connecting.')
    }

    try {
      const profileId = input.profileId === 'auto-detect' ? await this.detectProfile(input.portPath) : input.profileId
      const advancedProfile = input.advancedProfile ?? this.preferences.advancedProfile
      if (profileId === 'advanced') {
        const hasProbeCommand = Boolean(advancedProfile.probeCommand.trim())
        const hasProbeResponse = Boolean(advancedProfile.probeResponseText.trim())
        if (hasProbeCommand !== hasProbeResponse) {
          throw new Error('Advanced timer verification requires both a probe command and expected response, or neither.')
        }
        if (!hasProbeCommand && !input.confirmUnverified) {
          throw new Error('Confirm an unverified Advanced connection before opening a profile without a handshake.')
        }
      }
      this.adapter = createTimerAdapter(profileId, advancedProfile)
      await this.openTransport(input.portPath, this.adapter.profile)
      const connectionVerification = await this.verifyAdapter(this.adapter, profileId === 'advanced' && Boolean(input.confirmUnverified))
      this.adapter.beginHeat()
      await this.writeCommands(this.adapter.setupCommands())
      this.state = {
        ...this.state,
        status: 'ready',
        connectedProfileId: profileId,
        profileName: this.adapter.profile.name,
        capabilities: this.adapter.profile.capabilities,
        simulationMode: input.portPath === timerSimulatorPortPath,
        connectionVerification,
        error: undefined
      }
      if (input.portPath !== timerSimulatorPortPath) void this.rememberPhysicalConnection(profileId, input.portPath)
      this.log('system', `${this.adapter.profile.name} connected on ${input.portPath}.`)
      this.emit()
      return this.getState()
    } catch (error) {
      this.adapter = undefined
      await this.closeTransport()
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
    this.adapter = undefined
    await this.closeTransport()
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
      gateReleased: false,
      connectionVerification: undefined
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
    this.state.connectionVerification = undefined
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
    if (this.state.status === 'connecting') {
      this.connectionResponse += text
      return
    }
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
    return this.getState()
  }

  sendSimulatorHeat(): TimerSimulatorState {
    if (!this.simulatorState.active || !this.virtualPortConnected || !this.state.simulationMode) {
      throw new Error('Connect Race Control to the active PackRacer virtual timer port first.')
    }
    if (this.state.connectedProfileId !== this.simulatorState.profileId) {
      throw new Error('The connected Race Control profile does not match the hardware selected in the simulator.')
    }
    const heat = this.state.armedHeat
    if (!heat || !['armed', 'running'].includes(this.state.status)) {
      throw new Error('Arm the current heat in Race Control before sending simulated timer data.')
    }
    const simulatorHeat: ArmedHeat = {
      ...heat,
      lanes: [...this.expectedPhysicalLanes].map((physicalLane) => ({
        lane: physicalLane,
        racerId: heat.lanes.find((lane) => lane.lane === (heat.laneMapping[physicalLane] ?? physicalLane))?.racerId ?? ''
      }))
    }
    const events = generateSimulatedTimerEvents(simulatorHeat, this.simulatorState.scenario, this.simulatorState.variation)
    const chunks = encodeSimulatedTimerTransmission(this.simulatorState.profileId, events)
    chunks.forEach((chunk, index) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer)
        if (!this.virtualPortConnected) return
        this.simulatorLog('sent', JSON.stringify(chunk))
        this.receiveSerial(Buffer.from(chunk, 'ascii'))
        this.emitSimulator()
      }, 160 + index * 110)
      this.timers.add(timer)
    })
    if (this.simulatorState.scenario === 'disconnect-during-heat') {
      const timer = setTimeout(() => {
        this.timers.delete(timer)
        this.virtualPortConnected = false
        void this.handleMalfunction('The emulated timer disconnected during the heat.')
        this.simulatorLog('system', 'Virtual timer connection dropped during the heat.')
        this.emitSimulator()
      }, 160 + chunks.length * 110)
      this.timers.add(timer)
    }
    return this.getSimulatorState()
  }

  sendSimulatorRaw(data: string): TimerSimulatorState {
    if (!this.simulatorState.active || !this.virtualPortConnected) {
      throw new Error('Connect Race Control to the active PackRacer virtual timer port first.')
    }
    this.simulatorLog('sent', JSON.stringify(data))
    this.receiveSerial(Buffer.from(data, 'ascii'))
    this.emitSimulator()
    return this.getSimulatorState()
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
    const { results, missing, warnings } = normalizeTimerCapture(this.received, this.expectedPhysicalLanes, this.warnings)

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
      simulatorScenario: this.state.simulationMode ? this.simulatorState.scenario : undefined,
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
