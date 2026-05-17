import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'

import {
  addRacer,
  addRace,
  addStageToRace,
  scratchRacer,
  updateEventSettings,
  updateRace,
  updateRacer,
  updateStageInRace,
  type AddRacerInput,
  type AddStageInput,
  type CreateEventInput,
  type CreateFinalsStageInput,
  type CreateRaceInput,
  type RecordHeatResultsInput,
  type RemovalResolutionStrategy,
  type UpdateEventInput,
  type UpdateRaceInput,
  type UpdateRacerInput,
  type UpdateStageInput
} from '@packracer/race-engine'
import {
  advanceToNextHeat,
  createFinalsStage,
  generateStageHeats,
  recordHeatResults,
  resolveRacerRemoval,
  setCurrentHeat
} from '../../../../packages/race-engine/src/scheduling.ts'

import {
  closeEventStore,
  createEventSession,
  getCurrentEventSession,
  listEventSessions,
  mutateEvent,
  selectEventSession
} from './event-store.ts'

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL)

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
    mainWindow.webContents.openDevTools({ mode: 'detach' })
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

ipcMain.handle('race:create', (_event, input: CreateRaceInput) =>
  mutateEvent('race:create', (raceEvent) => addRace(raceEvent, input), { name: input.name, tournamentType: input.tournamentType })
)

ipcMain.handle('race:update', (_event, raceId: string, input: UpdateRaceInput) =>
  mutateEvent('race:update', (raceEvent) => updateRace(raceEvent, raceId, input), { raceId, input }, raceId)
)

ipcMain.handle('racer:add', (_event, input: AddRacerInput) =>
  mutateEvent('racer:add', (raceEvent) => addRacer(raceEvent, input), { name: input.name, number: input.racerNumber })
)

ipcMain.handle('racer:update', (_event, racerId: string, input: UpdateRacerInput) =>
  mutateEvent('racer:update', (raceEvent) => updateRacer(raceEvent, racerId, input), { racerId, input })
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

ipcMain.handle('stage:add', (_event, raceId: string, input: AddStageInput) =>
  mutateEvent('stage:add', (raceEvent) => addStageToRace(raceEvent, raceId, input), { raceId, name: input.name, format: input.format }, raceId)
)

ipcMain.handle('stage:update', (_event, raceId: string, stageId: string, input: UpdateStageInput) =>
  mutateEvent('stage:update', (raceEvent) => updateStageInRace(raceEvent, raceId, stageId, input), { raceId, stageId, input }, raceId)
)

ipcMain.handle('stage:generate-heats', (_event, raceId: string, stageId: string) =>
  mutateEvent('stage:generate-heats', (raceEvent) => generateStageHeats(raceEvent, raceId, stageId), { raceId, stageId }, raceId)
)

ipcMain.handle('stage:create-finals', (_event, raceId: string, input: CreateFinalsStageInput) =>
  mutateEvent('stage:create-finals', (raceEvent) => createFinalsStage(raceEvent, raceId, input), input, raceId)
)

ipcMain.handle('heat:record-results', (_event, raceId: string, input: RecordHeatResultsInput) =>
  mutateEvent('heat:record-results', (raceEvent) => recordHeatResults(raceEvent, raceId, input), { raceId, heatId: input.heatId }, raceId)
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
