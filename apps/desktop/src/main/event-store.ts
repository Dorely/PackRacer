import Database from 'better-sqlite3'
import { type BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { mkdirSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'

import {
  calculateStandings,
  createId,
  createRaceProject,
  type AuditEntry,
  type CreateProjectInput,
  type ProjectSessionSnapshot,
  type RaceProject
} from '@packracer/race-engine'

let activeDatabase: Database.Database | null = null
let activeFilePath = ''
let activeProject: RaceProject | null = null

function normalizeProjectPath(filePath: string): string {
  return extname(filePath).toLowerCase() === '.packrace' ? filePath : `${filePath}.packrace`
}

function sanitizeFileName(name: string): string {
  return (name.trim() || 'PackRacer Event').replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, ' ')
}

function openDatabase(filePath: string): Database.Database {
  mkdirSync(dirname(filePath), { recursive: true })
  const database = new Database(filePath)
  database.pragma('journal_mode = DELETE')
  database.pragma('synchronous = FULL')
  database.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_state (
      id TEXT PRIMARY KEY CHECK (id = 'current'),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL
    );
  `)
  database
    .prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)')
    .run('storeVersion', '1')
  return database
}

function closeActiveDatabase(): void {
  activeDatabase?.close()
  activeDatabase = null
  activeFilePath = ''
  activeProject = null
}

function auditRows(): AuditEntry[] {
  if (!activeDatabase) {
    return []
  }

  return activeDatabase
    .prepare('SELECT id, created_at as createdAt, action, details FROM audit_log ORDER BY created_at DESC LIMIT 100')
    .all() as AuditEntry[]
}

function snapshot(): ProjectSessionSnapshot {
  if (!activeProject || !activeDatabase || !activeFilePath) {
    throw new Error('No PackRacer project is open.')
  }

  return {
    filePath: activeFilePath,
    project: activeProject,
    standings: calculateStandings(activeProject),
    auditLog: auditRows()
  }
}

function writeActiveProject(action: string, details: unknown): ProjectSessionSnapshot {
  if (!activeProject || !activeDatabase) {
    throw new Error('No PackRacer project is open.')
  }

  const createdAt = new Date().toISOString()
  const detailsText = typeof details === 'string' ? details : JSON.stringify(details)
  const transaction = activeDatabase.transaction(() => {
    activeDatabase
      ?.prepare(
        `INSERT INTO project_state (id, data, updated_at)
         VALUES ('current', ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(activeProject), createdAt)
    activeDatabase
      ?.prepare('INSERT INTO audit_log (id, created_at, action, details) VALUES (?, ?, ?, ?)')
      .run(createId('audit'), createdAt, action, detailsText)
  })

  transaction()
  return snapshot()
}

async function showSaveDialog(owner: BrowserWindow | undefined, input: CreateProjectInput): Promise<string | null> {
  const options: SaveDialogOptions = {
    title: 'Create PackRacer Project',
    defaultPath: join(process.cwd(), `${sanitizeFileName(input.name)}.packrace`),
    filters: [{ name: 'PackRacer Project', extensions: ['packrace'] }]
  }
  const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)

  if (result.canceled || !result.filePath) {
    return null
  }

  return normalizeProjectPath(result.filePath)
}

async function showOpenDialog(owner: BrowserWindow | undefined): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: 'Open PackRacer Project',
    properties: ['openFile'],
    filters: [{ name: 'PackRacer Project', extensions: ['packrace'] }]
  }
  const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

export async function createProjectSession(
  input: CreateProjectInput,
  owner?: BrowserWindow
): Promise<ProjectSessionSnapshot | null> {
  const filePath = await showSaveDialog(owner, input)

  if (!filePath) {
    return null
  }

  closeActiveDatabase()
  activeFilePath = filePath
  activeDatabase = openDatabase(filePath)
  activeProject = createRaceProject(input)
  return writeActiveProject('project:create', { name: activeProject.name, laneCount: activeProject.laneCount })
}

export async function openProjectSession(owner?: BrowserWindow): Promise<ProjectSessionSnapshot | null> {
  const filePath = await showOpenDialog(owner)

  if (!filePath) {
    return null
  }

  closeActiveDatabase()
  activeFilePath = filePath
  activeDatabase = openDatabase(filePath)
  const row = activeDatabase.prepare('SELECT data FROM project_state WHERE id = ?').get('current') as
    | { data: string }
    | undefined

  if (!row) {
    closeActiveDatabase()
    throw new Error('The selected file does not contain a PackRacer project.')
  }

  activeProject = JSON.parse(row.data) as RaceProject
  return snapshot()
}

export function getCurrentProjectSession(): ProjectSessionSnapshot | null {
  return activeProject ? snapshot() : null
}

export function mutateProject(
  action: string,
  mutator: (project: RaceProject) => RaceProject,
  details: unknown = {}
): ProjectSessionSnapshot {
  if (!activeProject) {
    throw new Error('No PackRacer project is open.')
  }

  activeProject = mutator(activeProject)
  return writeActiveProject(action, details)
}

export function closeProjectSession(): void {
  closeActiveDatabase()
}