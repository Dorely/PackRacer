import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'

import {
  addRacer,
  addStage,
  advanceToNextHeat,
  createFinalsStage,
  generateStageHeats,
  recordHeatResults,
  resolveRacerRemoval,
  scratchRacer,
  setCurrentHeat,
  updateProjectSettings,
  updateRacer,
  updateStage,
  type AddRacerInput,
  type AddStageInput,
  type CreateFinalsStageInput,
  type CreateProjectInput,
  type RecordHeatResultsInput,
  type RemovalResolutionStrategy,
  type UpdateProjectInput,
  type UpdateRacerInput,
  type UpdateStageInput
} from '@packracer/race-engine'

import {
  closeProjectSession,
  createProjectSession,
  getCurrentProjectSession,
  mutateProject,
  openProjectSession
} from './event-store.js'

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

ipcMain.handle('project:create', (event, input: CreateProjectInput) =>
  createProjectSession(input, BrowserWindow.fromWebContents(event.sender) ?? undefined)
)

ipcMain.handle('project:open', (event) => openProjectSession(BrowserWindow.fromWebContents(event.sender) ?? undefined))

ipcMain.handle('project:get-current', () => getCurrentProjectSession())

ipcMain.handle('project:update', (_event, input: UpdateProjectInput) =>
  mutateProject('project:update', (project) => updateProjectSettings(project, input), input)
)

ipcMain.handle('racer:add', (_event, input: AddRacerInput) =>
  mutateProject('racer:add', (project) => addRacer(project, input), { name: input.name, number: input.racerNumber })
)

ipcMain.handle('racer:update', (_event, racerId: string, input: UpdateRacerInput) =>
  mutateProject('racer:update', (project) => updateRacer(project, racerId, input), { racerId, input })
)

ipcMain.handle('racer:scratch', (_event, racerId: string) =>
  mutateProject(
    'racer:scratch',
    (project) => scratchRacer(project, racerId).project,
    { racerId }
  )
)

ipcMain.handle('racer:resolve-removal', (_event, strategy: RemovalResolutionStrategy) =>
  mutateProject('racer:resolve-removal', (project) => resolveRacerRemoval(project, strategy), { strategy })
)

ipcMain.handle('stage:add', (_event, input: AddStageInput) =>
  mutateProject('stage:add', (project) => addStage(project, input), { name: input.name, format: input.format })
)

ipcMain.handle('stage:update', (_event, stageId: string, input: UpdateStageInput) =>
  mutateProject('stage:update', (project) => updateStage(project, stageId, input), { stageId, input })
)

ipcMain.handle('stage:generate-heats', (_event, stageId: string) =>
  mutateProject('stage:generate-heats', (project) => generateStageHeats(project, stageId), { stageId })
)

ipcMain.handle('stage:create-finals', (_event, input: CreateFinalsStageInput) =>
  mutateProject('stage:create-finals', (project) => createFinalsStage(project, input), input)
)

ipcMain.handle('heat:record-results', (_event, input: RecordHeatResultsInput) =>
  mutateProject('heat:record-results', (project) => recordHeatResults(project, input), { heatId: input.heatId })
)

ipcMain.handle('heat:set-current', (_event, heatId: string) =>
  mutateProject('heat:set-current', (project) => setCurrentHeat(project, heatId), { heatId })
)

ipcMain.handle('heat:advance', () => mutateProject('heat:advance', (project) => advanceToNextHeat(project)))

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
  closeProjectSession()
})
