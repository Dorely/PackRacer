import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'

import {
  addRaceEntry,
  addRacer,
  addRace,
  deleteRace,
  deleteRacer,
  registerRacerForRace,
  removeRaceEntry,
  scratchRaceEntry,
  scratchRacer,
  updateEventSettings,
  updateRace,
  updateRaceLaneAvailability,
  updateRaceEntry,
  updateRacer,
  type AddRaceEntryInput,
  type AddRacerInput,
  type CreateEventInput,
  type CreateRaceInput,
  type EventSessionSnapshot,
  type RecordHeatResultsInput,
  type RegisterRacerInput,
  type RemovalResolutionStrategy,
  type UpdateEventInput,
  type UpdateRaceLaneAvailabilityInput,
  type UpdateRaceEntryInput,
  type UpdateRaceInput,
  type UpdateRacerInput
} from '@packracer/race-engine'
import {
  advanceToNextHeat,
  clearHeatResults,
  generateAdvancementTieBreakerHeats,
  generateRaceHeats,
  recordHeatResults,
  resolveRacerRemoval,
  setCurrentHeat
} from '../../../../packages/race-engine/src/scheduling.ts'

import {
  closeEventStore,
  createEventSession,
  deleteEventSession,
  getCurrentEventSession,
  listEventSessions,
  mutateEvent,
  selectEventSession
} from './event-store.ts'

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL)
const shouldOpenDevTools = process.env.PACKRACER_OPEN_DEVTOOLS === '1'

type PopoutSectionId = 'events' | 'event' | 'registration' | 'race-control' | 'standings' | 'display'

type PopoutRequest = {
  sectionId: PopoutSectionId
  selectedRaceId?: string
}

const popoutSectionIds: PopoutSectionId[] = ['events', 'event', 'registration', 'race-control', 'standings', 'display']
const popoutWindows = new Map<PopoutSectionId, BrowserWindow>()
let mainWindow: BrowserWindow | null = null

function isPopoutSectionId(value: unknown): value is PopoutSectionId {
  return typeof value === 'string' && popoutSectionIds.includes(value as PopoutSectionId)
}

function sectionTitle(sectionId: PopoutSectionId): string {
  switch (sectionId) {
    case 'event':
      return 'Race Setup'
    case 'race-control':
      return 'Race Control'
    case 'display':
      return 'Display'
    case 'registration':
      return 'Registration'
    case 'standings':
      return 'Standings'
    case 'events':
    default:
      return 'Events'
  }
}

function rendererQuery(options: { mode?: 'popout'; sectionId?: PopoutSectionId; selectedRaceId?: string }): Record<string, string> {
  const query: Record<string, string> = {}

  if (options.mode) {
    query.mode = options.mode
  }

  if (options.sectionId) {
    query.section = options.sectionId
  }

  if (options.selectedRaceId) {
    query.raceId = options.selectedRaceId
  }

  return query
}

function loadRenderer(window: BrowserWindow, options: { mode?: 'popout'; sectionId?: PopoutSectionId; selectedRaceId?: string }): void {
  const query = rendererQuery(options)

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL)

    for (const [key, value] of Object.entries(query)) {
      rendererUrl.searchParams.set(key, value)
    }

    void window.loadURL(rendererUrl.toString())
    return
  }

  void window.loadFile(join(__dirname, '../renderer/index.html'), Object.keys(query).length > 0 ? { query } : undefined)
}

function createAppWindow(options: { mode: 'main' } | { mode: 'popout'; sectionId: PopoutSectionId; selectedRaceId?: string }): BrowserWindow {
  const isPopout = options.mode === 'popout'
  const isDisplayPopout = isPopout && options.sectionId === 'display'
  const window = new BrowserWindow({
    width: isPopout ? (isDisplayPopout ? 1280 : 1180) : 1280,
    height: isPopout ? (isDisplayPopout ? 720 : 820) : 860,
    minWidth: isDisplayPopout ? 960 : 1024,
    minHeight: isDisplayPopout ? 540 : 720,
    title: 'PackRacer',
    backgroundColor: '#f7f5ef',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.setMenuBarVisibility(false)

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isPopout) {
    window.setTitle(`PackRacer - ${sectionTitle(options.sectionId)}`)
    popoutWindows.set(options.sectionId, window)
    window.on('closed', () => {
      popoutWindows.delete(options.sectionId)
    })
  } else {
    mainWindow = window
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  }

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    if (shouldOpenDevTools) {
      window.webContents.openDevTools({ mode: 'detach' })
    }

    window.once('ready-to-show', () => {
      window.focus()
    })
  }

  loadRenderer(
    window,
    isPopout ? { mode: 'popout', sectionId: options.sectionId, selectedRaceId: options.selectedRaceId } : {}
  )
  return window
}

function createMainWindow(): void {
  createAppWindow({ mode: 'main' })
}

function broadcastSessionUpdate(snapshot: EventSessionSnapshot | null): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('session:updated', snapshot)
    }
  }
}

async function withSessionBroadcast<T extends EventSessionSnapshot | null>(operation: Promise<T>): Promise<T> {
  const snapshot = await operation
  broadcastSessionUpdate(snapshot)
  return snapshot
}

app.setAppUserModelId('com.packracer.desktop')

ipcMain.handle('app:get-version', () => app.getVersion())

ipcMain.handle('app:open-popout', (_event, input: Partial<PopoutRequest>) => {
  if (!isPopoutSectionId(input.sectionId)) {
    throw new Error('Unknown pop-out section.')
  }

  const existingWindow = popoutWindows.get(input.sectionId)

  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.focus()
    return
  }

  createAppWindow({
    mode: 'popout',
    sectionId: input.sectionId,
    selectedRaceId: input.selectedRaceId
  })
})

ipcMain.handle('event:create', (_event, input: CreateEventInput) => withSessionBroadcast(createEventSession(input)))

ipcMain.handle('event:get-current', () => getCurrentEventSession())

ipcMain.handle('event:list', () => listEventSessions())

ipcMain.handle('event:select', (_event, eventId: string) => withSessionBroadcast(selectEventSession(eventId)))

ipcMain.handle('event:update', (_event, input: UpdateEventInput) =>
  withSessionBroadcast(mutateEvent('event:update', (raceEvent) => updateEventSettings(raceEvent, input), input))
)

ipcMain.handle('event:delete', (_event, eventId: string) => withSessionBroadcast(deleteEventSession(eventId)))

ipcMain.handle('race:create', (_event, input: CreateRaceInput) =>
  withSessionBroadcast(
    mutateEvent('race:create', (raceEvent) => addRace(raceEvent, input), { name: input.name, format: input.format })
  )
)

ipcMain.handle('race:update', (_event, raceId: string, input: UpdateRaceInput) =>
  withSessionBroadcast(
    mutateEvent('race:update', (raceEvent) => updateRace(raceEvent, raceId, input), { raceId, input }, raceId)
  )
)

ipcMain.handle('race:update-lane-availability', (_event, raceId: string, input: UpdateRaceLaneAvailabilityInput) =>
  withSessionBroadcast(
    mutateEvent(
      'race:update-lane-availability',
      (raceEvent) => updateRaceLaneAvailability(raceEvent, raceId, input),
      { raceId, input },
      raceId
    )
  )
)

ipcMain.handle('race:delete', (_event, raceId: string) =>
  withSessionBroadcast(mutateEvent('race:delete', (raceEvent) => deleteRace(raceEvent, raceId), { raceId }, raceId))
)

ipcMain.handle('race:generate-heats', (_event, raceId: string) =>
  withSessionBroadcast(
    mutateEvent('race:generate-heats', (raceEvent) => generateRaceHeats(raceEvent, raceId), { raceId }, raceId)
  )
)

ipcMain.handle('race:generate-tie-breaker', (_event, sourceRaceId: string, dependentRaceId: string) =>
  withSessionBroadcast(
    mutateEvent(
      'race:generate-tie-breaker',
      (raceEvent) => generateAdvancementTieBreakerHeats(raceEvent, sourceRaceId, dependentRaceId),
      { sourceRaceId, dependentRaceId },
      sourceRaceId
    )
  )
)

ipcMain.handle('racer:add', (_event, input: AddRacerInput) =>
  withSessionBroadcast(
    mutateEvent('racer:add', (raceEvent) => addRacer(raceEvent, input), { name: input.name, number: input.racerNumber })
  )
)

ipcMain.handle('racer:update', (_event, racerId: string, input: UpdateRacerInput) =>
  withSessionBroadcast(mutateEvent('racer:update', (raceEvent) => updateRacer(raceEvent, racerId, input), { racerId, input }))
)

ipcMain.handle('racer:delete', (_event, racerId: string) =>
  withSessionBroadcast(mutateEvent('racer:delete', (raceEvent) => deleteRacer(raceEvent, racerId), { racerId }))
)

ipcMain.handle('racer:scratch', (_event, racerId: string) =>
  withSessionBroadcast(
    mutateEvent(
      'racer:scratch',
      (raceEvent) => scratchRacer(raceEvent, racerId).event,
      { racerId }
    )
  )
)

ipcMain.handle('racer:resolve-removal', (_event, strategy: RemovalResolutionStrategy) =>
  withSessionBroadcast(
    mutateEvent('racer:resolve-removal', (raceEvent) => resolveRacerRemoval(raceEvent, strategy), { strategy })
  )
)

ipcMain.handle('race-entry:add', (_event, raceId: string, input: AddRaceEntryInput) =>
  withSessionBroadcast(
    mutateEvent('race-entry:add', (raceEvent) => addRaceEntry(raceEvent, raceId, input), { raceId, input }, raceId)
  )
)

ipcMain.handle('race-entry:register-racer', (_event, raceId: string, input: RegisterRacerInput) =>
  withSessionBroadcast(
    mutateEvent('race-entry:register-racer', (raceEvent) => registerRacerForRace(raceEvent, raceId, input), { raceId, input }, raceId)
  )
)

ipcMain.handle('race-entry:update', (_event, raceId: string, entryId: string, input: UpdateRaceEntryInput) =>
  withSessionBroadcast(
    mutateEvent('race-entry:update', (raceEvent) => updateRaceEntry(raceEvent, raceId, entryId, input), { raceId, entryId, input }, raceId)
  )
)

ipcMain.handle('race-entry:remove', (_event, raceId: string, entryId: string) =>
  withSessionBroadcast(
    mutateEvent('race-entry:remove', (raceEvent) => removeRaceEntry(raceEvent, raceId, entryId), { raceId, entryId }, raceId)
  )
)

ipcMain.handle('race-entry:scratch', (_event, raceId: string, entryId: string) =>
  withSessionBroadcast(
    mutateEvent('race-entry:scratch', (raceEvent) => scratchRaceEntry(raceEvent, raceId, entryId).event, { raceId, entryId }, raceId)
  )
)

ipcMain.handle('heat:record-results', (_event, raceId: string, input: RecordHeatResultsInput) =>
  withSessionBroadcast(
    mutateEvent('heat:record-results', (raceEvent) => recordHeatResults(raceEvent, raceId, input), { raceId, heatId: input.heatId }, raceId)
  )
)

ipcMain.handle('heat:clear-results', (_event, raceId: string, heatId: string) =>
  withSessionBroadcast(
    mutateEvent('heat:clear-results', (raceEvent) => clearHeatResults(raceEvent, raceId, heatId), { raceId, heatId }, raceId)
  )
)

ipcMain.handle('heat:set-current', (_event, raceId: string, heatId: string) =>
  withSessionBroadcast(
    mutateEvent('heat:set-current', (raceEvent) => setCurrentHeat(raceEvent, raceId, heatId), { raceId, heatId }, raceId)
  )
)

ipcMain.handle('heat:advance', (_event, raceId: string) =>
  withSessionBroadcast(mutateEvent('heat:advance', (raceEvent) => advanceToNextHeat(raceEvent, raceId), { raceId }, raceId))
)

void app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeEventStore()
})
