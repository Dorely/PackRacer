import { app } from 'electron'
import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import initSqlJs, { type BindParams, type Database as SqlDatabase, type SqlValue } from 'sql.js'

import {
  calculateStandings,
  createId,
  createRaceEvent,
  upgradeRaceEvent,
  type AuditEntry,
  type CreateEventInput,
  type EventSessionSnapshot,
  type EventSummary,
  type RaceEvent,
  type Standing
} from '@packracer/race-engine'

const require = createRequire(import.meta.url)

let activeDatabase: SqlDatabase | null = null
let databasePromise: Promise<SqlDatabase> | null = null
let activeEvent: RaceEvent | null = null
let sqlModule: Awaited<ReturnType<typeof initSqlJs>> | null = null
let recoveryNotice: string | undefined
let writeQueue: Promise<void> = Promise.resolve()

function databasePath(): string {
  return join(app.getPath('userData'), 'packracer.sqlite')
}

function recoveryPath(): string {
  return `${databasePath()}.recovery`
}

function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation)
  writeQueue = result.then(() => undefined, () => undefined)
  return result
}

function validateDatabase(database: SqlDatabase): void {
  const value = database.exec('PRAGMA quick_check')[0]?.values[0]?.[0]
  if (value !== 'ok') throw new Error(`SQLite integrity check failed: ${String(value ?? 'unknown error')}`)
}

async function openDatabase(): Promise<SqlDatabase> {
  if (activeDatabase) {
    return activeDatabase
  }

  databasePromise ??= initializeDatabase()
  activeDatabase = await databasePromise
  return activeDatabase
}

async function initializeDatabase(): Promise<SqlDatabase> {
  const filePath = databasePath()
  mkdirSync(dirname(filePath), { recursive: true })
  const SQL = await initSqlJs({ locateFile: (fileName) => require.resolve(`sql.js/dist/${fileName}`) })
  sqlModule = SQL
  let database: SqlDatabase

  if (existsSync(filePath)) {
    try {
      database = new SQL.Database(readFileSync(filePath))
      validateDatabase(database)
    } catch (primaryError) {
      const quarantinePath = `${filePath}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
      renameSync(filePath, quarantinePath)

      if (!existsSync(recoveryPath())) {
        throw new Error(`PackRacer could not open its database and no recovery copy exists. Data file: ${filePath}. ${primaryError instanceof Error ? primaryError.message : ''}`)
      }

      try {
        database = new SQL.Database(readFileSync(recoveryPath()))
        validateDatabase(database)
        recoveryNotice = `The primary database was damaged. PackRacer restored the last known good save and quarantined the damaged file at ${quarantinePath}.`
      } catch (recoveryError) {
        throw new Error(`PackRacer could not open either its database or recovery copy. Data file: ${filePath}. ${recoveryError instanceof Error ? recoveryError.message : ''}`)
      }
    }
  } else {
    database = new SQL.Database()
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_state (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      event_date TEXT NOT NULL,
      status TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      event_id TEXT,
      race_id TEXT,
      created_at TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL
    );
  `)
  database.run('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)', ['storeVersion', '2'])
  persistDatabase(database)
  return database
}

function persistDatabase(database: SqlDatabase): void {
  const filePath = databasePath()
  const tempPath = `${filePath}.tmp`
  writeFileSync(tempPath, Buffer.from(database.export()))
  const descriptor = openSync(tempPath, 'r+')
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  if (existsSync(filePath)) copyFileSync(filePath, recoveryPath())
  renameSync(tempPath, filePath)
}

function cloneDatabase(database: SqlDatabase): SqlDatabase {
  if (!sqlModule) throw new Error('The database runtime is not initialized.')
  return new sqlModule.Database(database.export())
}

function queryAll<T>(database: SqlDatabase, sql: string, params: BindParams = []): T[] {
  const statement = database.prepare(sql)

  try {
    statement.bind(params)
    const rows: T[] = []

    while (statement.step()) {
      rows.push(statement.getAsObject() as T)
    }

    return rows
  } finally {
    statement.free()
  }
}

function queryOne<T>(database: SqlDatabase, sql: string, params: BindParams = []): T | undefined {
  return queryAll<T>(database, sql, params)[0]
}

function activeEventId(database: SqlDatabase): string | null {
  const row = queryOne<{ value: string }>(database, 'SELECT value FROM metadata WHERE key = ?', ['activeEventId'])

  return row?.value ?? null
}

function setActiveEventId(database: SqlDatabase, eventId: string): void {
  database.run('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)', ['activeEventId', eventId])
}

function clearActiveEventId(database: SqlDatabase): void {
  database.run('DELETE FROM metadata WHERE key = ?', ['activeEventId'])
}

function eventSummaries(database: SqlDatabase): EventSummary[] {
  return queryAll<{
    id: string
    name: string
    eventDate: string
    status: RaceEvent['status']
    data: string
    updatedAt: string
  }>(
    database,
    `SELECT id, name, event_date as eventDate, status, data, updated_at as updatedAt
     FROM event_state
     ORDER BY updated_at DESC`
  ).map((row) => {
    const event = JSON.parse(row.data) as RaceEvent

    return {
      id: row.id,
      name: row.name,
      eventDate: row.eventDate,
      status: row.status,
      racerCount: event.racers.length,
      raceCount: event.races.length,
      updatedAt: row.updatedAt
    }
  })
}

function auditRows(eventId: string, database: SqlDatabase): AuditEntry[] {
  return queryAll<AuditEntry>(
    database,
    `SELECT id, event_id as eventId, race_id as raceId, created_at as createdAt, action, details
     FROM audit_log
     WHERE event_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [eventId]
  )
}

function loadEvent(eventId: string, database: SqlDatabase): RaceEvent | null {
  const row = queryOne<{ data: string }>(database, 'SELECT data FROM event_state WHERE id = ?', [eventId])

  if (!row) {
    return null
  }

  const event = upgradeRaceEvent(JSON.parse(row.data) as RaceEvent)
  const upgradedData = JSON.stringify(event)

  if (upgradedData !== row.data) {
    database.run('UPDATE event_state SET data = ? WHERE id = ?', [upgradedData, eventId])
    persistDatabase(database)
  }

  return event
}

function selectedStandings(event: RaceEvent): Standing[] {
  const raceId = event.currentRaceId ?? event.races[0]?.id
  const race = event.races.find((candidate) => candidate.id === raceId) ?? event.races[0]

  return race ? calculateStandings(event, race.id) : []
}

function snapshot(database: SqlDatabase): EventSessionSnapshot {
  if (!activeEvent) {
    throw new Error('No event is active.')
  }

  return {
    event: activeEvent,
    events: eventSummaries(database),
    standings: selectedStandings(activeEvent),
    auditLog: auditRows(activeEvent.id, database),
    recoveryNotice
  }
}

async function writeActiveEvent(event: RaceEvent, action: string, details: unknown, raceId?: string): Promise<EventSessionSnapshot> {
  const database = await openDatabase()
  const candidateDatabase = cloneDatabase(database)
  const createdAt = new Date().toISOString()
  const detailsText = typeof details === 'string' ? details : JSON.stringify(details)
  let transactionCommitted = false

  candidateDatabase.run('BEGIN TRANSACTION')

  try {
    candidateDatabase.run(
      `INSERT INTO event_state (id, name, event_date, status, data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         event_date = excluded.event_date,
         status = excluded.status,
         data = excluded.data,
         updated_at = excluded.updated_at`,
      [event.id, event.name, event.eventDate, event.status, JSON.stringify(event), createdAt]
    )
    candidateDatabase.run('INSERT INTO audit_log (id, event_id, race_id, created_at, action, details) VALUES (?, ?, ?, ?, ?, ?)', [
      createId('audit'),
      event.id,
      raceId ?? null,
      createdAt,
      action,
      detailsText
    ] as SqlValue[])
    setActiveEventId(candidateDatabase, event.id)
    candidateDatabase.run('COMMIT')
    transactionCommitted = true
    persistDatabase(candidateDatabase)
  } catch (error) {
    if (!transactionCommitted) {
      try { candidateDatabase.run('ROLLBACK') } catch { /* preserve the original transaction error */ }
    }
    candidateDatabase.close()
    throw error
  }

  activeDatabase = candidateDatabase
  database.close()
  activeEvent = event
  return snapshot(candidateDatabase)
}

export async function createEventSession(input: CreateEventInput): Promise<EventSessionSnapshot> {
  return serializeWrite(async () => {
    const event = createRaceEvent(input)
    return writeActiveEvent(event, 'event:create', { name: event.name, laneCount: event.laneCount })
  })
}

export async function selectEventSession(eventId: string): Promise<EventSessionSnapshot> {
  return serializeWrite(async () => {
    const database = await openDatabase()
    const event = loadEvent(eventId, database)

    if (!event) {
      throw new Error('Event was not found.')
    }

    const candidateDatabase = cloneDatabase(database)
    setActiveEventId(candidateDatabase, event.id)
    persistDatabase(candidateDatabase)
    activeDatabase = candidateDatabase
    database.close()
    activeEvent = event
    return snapshot(candidateDatabase)
  })
}

export async function getCurrentEventSession(): Promise<EventSessionSnapshot | null> {
  return serializeWrite(async () => {
    const database = await openDatabase()

    if (activeEvent) {
      return snapshot(database)
    }

    const preferredEventId = activeEventId(database)
    const latestEventId = eventSummaries(database)[0]?.id
    const eventId = preferredEventId ?? latestEventId

    if (!eventId) {
      return null
    }

    const event = loadEvent(eventId, database)

    if (!event) {
      return null
    }

    const candidateDatabase = cloneDatabase(database)
    setActiveEventId(candidateDatabase, event.id)
    persistDatabase(candidateDatabase)
    activeDatabase = candidateDatabase
    database.close()
    activeEvent = event
    return snapshot(candidateDatabase)
  })
}

export async function listEventSessions(): Promise<EventSummary[]> {
  return eventSummaries(await openDatabase())
}

export async function mutateEvent(
  action: string,
  mutator: (event: RaceEvent) => RaceEvent,
  details: unknown = {},
  raceId?: string
): Promise<EventSessionSnapshot> {
  return serializeWrite(async () => {
    if (!activeEvent) {
      throw new Error('Create or select an event first.')
    }

    const candidateEvent = mutator(activeEvent)
    return writeActiveEvent(candidateEvent, action, details, raceId)
  })
}

export function closeEventStore(): void {
  activeDatabase?.close()
  activeDatabase = null
  databasePromise = null
  activeEvent = null
  writeQueue = Promise.resolve()
}

export async function initializeEventStore(): Promise<void> {
  await openDatabase()
}

export async function deleteEventSession(eventId: string): Promise<EventSessionSnapshot | null> {
  return serializeWrite(async () => {
    const database = await openDatabase()
    const candidateDatabase = cloneDatabase(database)
    const deletingActiveEvent = activeEvent?.id === eventId || activeEventId(candidateDatabase) === eventId
    let nextActiveEvent = activeEvent
    let transactionCommitted = false

    candidateDatabase.run('BEGIN TRANSACTION')

    try {
      candidateDatabase.run('DELETE FROM event_state WHERE id = ?', [eventId])
      candidateDatabase.run('DELETE FROM audit_log WHERE event_id = ?', [eventId])

      if (deletingActiveEvent) {
        const nextEventId = eventSummaries(candidateDatabase)[0]?.id
        nextActiveEvent = nextEventId ? loadEvent(nextEventId, candidateDatabase) : null
        if (nextActiveEvent) setActiveEventId(candidateDatabase, nextActiveEvent.id)
        else clearActiveEventId(candidateDatabase)
      }

      candidateDatabase.run('COMMIT')
      transactionCommitted = true
      persistDatabase(candidateDatabase)
    } catch (error) {
      if (!transactionCommitted) {
        try { candidateDatabase.run('ROLLBACK') } catch { /* preserve the original transaction error */ }
      }
      candidateDatabase.close()
      throw error
    }

    activeDatabase = candidateDatabase
    database.close()
    activeEvent = nextActiveEvent

    if (!activeEvent) {
      return null
    }

    return snapshot(candidateDatabase)
  })
}

export async function getAppSetting<T>(key: string, fallback: T): Promise<T> {
  const database = await openDatabase()
  const row = queryOne<{ value: string }>(database, 'SELECT value FROM metadata WHERE key = ?', [key])

  if (!row) {
    return fallback
  }

  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export async function setAppSetting<T>(key: string, value: T): Promise<void> {
  return serializeWrite(async () => {
    const database = await openDatabase()
    const candidateDatabase = cloneDatabase(database)
    candidateDatabase.run('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)', [key, JSON.stringify(value)])
    persistDatabase(candidateDatabase)
    activeDatabase = candidateDatabase
    database.close()
  })
}

export async function appendAuditAction(action: string, details: unknown, raceId?: string): Promise<EventSessionSnapshot | null> {
  return serializeWrite(async () => {
    const database = await openDatabase()

    if (!activeEvent) {
      return null
    }

    const candidateDatabase = cloneDatabase(database)
    const createdAt = new Date().toISOString()
    candidateDatabase.run(
      'INSERT INTO audit_log (id, event_id, race_id, created_at, action, details) VALUES (?, ?, ?, ?, ?, ?)',
      [
        createId('audit'),
        activeEvent.id,
        raceId ?? null,
        createdAt,
        action,
        typeof details === 'string' ? details : JSON.stringify(details)
      ] as SqlValue[]
    )
    persistDatabase(candidateDatabase)
    activeDatabase = candidateDatabase
    database.close()
    return snapshot(candidateDatabase)
  })
}
