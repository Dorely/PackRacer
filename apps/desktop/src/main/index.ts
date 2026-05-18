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
  updateRaceEntry,
  updateRacer,
  type AddRaceEntryInput,
  type AddRacerInput,
  type CreateEventInput,
  type CreateRaceInput,
  type RecordHeatResultsInput,
  type RegisterRacerInput,
  type RemovalResolutionStrategy,
  type UpdateEventInput,
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

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: 'PackRacer',
    backgroundColor: '#f7f5ef',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.setMenuBarVisibility(false)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)

    if (shouldOpenDevTools) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }

    mainWindow.once('ready-to-show', () => {
      mainWindow.focus()
    })
    return
  }

  void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.setAppUserModelId('com.packracer.desktop')

ipcMain.handle('app:get-version', () => app.getVersion())

ipcMain.handle('event:create', (_event, input: CreateEventInput) => createEventSession(input))

ipcMain.handle('event:get-current', () => getCurrentEventSession())

ipcMain.handle('event:list', () => listEventSessions())

ipcMain.handle('event:select', (_event, eventId: string) => selectEventSession(eventId))

ipcMain.handle('event:update', (_event, input: UpdateEventInput) =>
  mutateEvent('event:update', (raceEvent) => updateEventSettings(raceEvent, input), input)
)

ipcMain.handle('event:delete', (_event, eventId: string) => deleteEventSession(eventId))

ipcMain.handle('race:create', (_event, input: CreateRaceInput) =>
  mutateEvent('race:create', (raceEvent) => addRace(raceEvent, input), { name: input.name, format: input.format })
)

ipcMain.handle('race:update', (_event, raceId: string, input: UpdateRaceInput) =>
  mutateEvent('race:update', (raceEvent) => updateRace(raceEvent, raceId, input), { raceId, input }, raceId)
)

ipcMain.handle('race:delete', (_event, raceId: string) =>
  mutateEvent('race:delete', (raceEvent) => deleteRace(raceEvent, raceId), { raceId }, raceId)
)

ipcMain.handle('race:generate-heats', (_event, raceId: string) =>
  mutateEvent('race:generate-heats', (raceEvent) => generateRaceHeats(raceEvent, raceId), { raceId }, raceId)
)

ipcMain.handle('race:generate-tie-breaker', (_event, sourceRaceId: string, dependentRaceId: string) =>
  mutateEvent(
    'race:generate-tie-breaker',
    (raceEvent) => generateAdvancementTieBreakerHeats(raceEvent, sourceRaceId, dependentRaceId),
    { sourceRaceId, dependentRaceId },
    sourceRaceId
  )
)

ipcMain.handle('racer:add', (_event, input: AddRacerInput) =>
  mutateEvent('racer:add', (raceEvent) => addRacer(raceEvent, input), { name: input.name, number: input.racerNumber })
)

ipcMain.handle('racer:update', (_event, racerId: string, input: UpdateRacerInput) =>
  mutateEvent('racer:update', (raceEvent) => updateRacer(raceEvent, racerId, input), { racerId, input })
)

ipcMain.handle('racer:delete', (_event, racerId: string) =>
  mutateEvent('racer:delete', (raceEvent) => deleteRacer(raceEvent, racerId), { racerId })
)

ipcMain.handle('racer:scratch', (_event, racerId: string) =>
  mutateEvent(
    'racer:scratch',
    (raceEvent) => scratchRacer(raceEvent, racerId).event,
    { racerId }
  )
)

ipcMain.handle('racer:resolve-removal', (_event, strategy: RemovalResolutionStrategy) =>
  mutateEvent('racer:resolve-removal', (raceEvent) => resolveRacerRemoval(raceEvent, strategy), { strategy })
)

ipcMain.handle('race-entry:add', (_event, raceId: string, input: AddRaceEntryInput) =>
  mutateEvent('race-entry:add', (raceEvent) => addRaceEntry(raceEvent, raceId, input), { raceId, input }, raceId)
)

ipcMain.handle('race-entry:register-racer', (_event, raceId: string, input: RegisterRacerInput) =>
  mutateEvent('race-entry:register-racer', (raceEvent) => registerRacerForRace(raceEvent, raceId, input), { raceId, input }, raceId)
)

ipcMain.handle('race-entry:update', (_event, raceId: string, entryId: string, input: UpdateRaceEntryInput) =>
  mutateEvent('race-entry:update', (raceEvent) => updateRaceEntry(raceEvent, raceId, entryId, input), { raceId, entryId, input }, raceId)
)

ipcMain.handle('race-entry:remove', (_event, raceId: string, entryId: string) =>
  mutateEvent('race-entry:remove', (raceEvent) => removeRaceEntry(raceEvent, raceId, entryId), { raceId, entryId }, raceId)
)

ipcMain.handle('race-entry:scratch', (_event, raceId: string, entryId: string) =>
  mutateEvent('race-entry:scratch', (raceEvent) => scratchRaceEntry(raceEvent, raceId, entryId).event, { raceId, entryId }, raceId)
)

ipcMain.handle('heat:record-results', (_event, raceId: string, input: RecordHeatResultsInput) =>
  mutateEvent('heat:record-results', (raceEvent) => recordHeatResults(raceEvent, raceId, input), { raceId, heatId: input.heatId }, raceId)
)

ipcMain.handle('heat:clear-results', (_event, raceId: string, heatId: string) =>
  mutateEvent('heat:clear-results', (raceEvent) => clearHeatResults(raceEvent, raceId, heatId), { raceId, heatId }, raceId)
)

ipcMain.handle('heat:set-current', (_event, raceId: string, heatId: string) =>
  mutateEvent('heat:set-current', (raceEvent) => setCurrentHeat(raceEvent, raceId, heatId), { raceId, heatId }, raceId)
)

ipcMain.handle('heat:advance', (_event, raceId: string) =>
  mutateEvent('heat:advance', (raceEvent) => advanceToNextHeat(raceEvent, raceId), { raceId }, raceId)
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
