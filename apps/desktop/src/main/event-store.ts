import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import initSqlJs, { type BindParams, type Database as SqlDatabase, type SqlValue } from 'sql.js'

import {
  calculateStandings,
  createId,
  createRaceEvent,
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

function databasePath(): string {
  return join(app.getPath('userData'), 'packracer.sqlite')
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
  const database = existsSync(filePath) ? new SQL.Database(readFileSync(filePath)) : new SQL.Database()

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
  writeFileSync(databasePath(), Buffer.from(database.export()))
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
  return row ? (JSON.parse(row.data) as RaceEvent) : null
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
    auditLog: auditRows(activeEvent.id, database)
  }
}

async function writeActiveEvent(action: string, details: unknown, raceId?: string): Promise<EventSessionSnapshot> {
  const database = await openDatabase()

  if (!activeEvent) {
    throw new Error('No event is active.')
  }

  const createdAt = new Date().toISOString()
  const detailsText = typeof details === 'string' ? details : JSON.stringify(details)
  const event = activeEvent

  database.run('BEGIN TRANSACTION')

  try {
    database.run(
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
    database.run('INSERT INTO audit_log (id, event_id, race_id, created_at, action, details) VALUES (?, ?, ?, ?, ?, ?)', [
      createId('audit'),
      event.id,
      raceId ?? null,
      createdAt,
      action,
      detailsText
    ] as SqlValue[])
    setActiveEventId(database, event.id)
    database.run('COMMIT')
    persistDatabase(database)
  } catch (error) {
    database.run('ROLLBACK')
    throw error
  }

  return snapshot(database)
}

export async function createEventSession(input: CreateEventInput): Promise<EventSessionSnapshot> {
  activeEvent = createRaceEvent(input)
  return writeActiveEvent('event:create', { name: activeEvent.name, laneCount: activeEvent.laneCount })
}

export async function selectEventSession(eventId: string): Promise<EventSessionSnapshot> {
  const database = await openDatabase()
  const event = loadEvent(eventId, database)

  if (!event) {
    throw new Error('Event was not found.')
  }

  activeEvent = event
  setActiveEventId(database, event.id)
  persistDatabase(database)
  return snapshot(database)
}

export async function getCurrentEventSession(): Promise<EventSessionSnapshot | null> {
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

  activeEvent = event
  setActiveEventId(database, event.id)
  persistDatabase(database)
  return snapshot(database)
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
  if (!activeEvent) {
    throw new Error('Create or select an event first.')
  }

  activeEvent = mutator(activeEvent)
  return writeActiveEvent(action, details, raceId)
}

export function closeEventStore(): void {
  activeDatabase?.close()
  activeDatabase = null
  databasePromise = null
  activeEvent = null
}

export async function deleteEventSession(eventId: string): Promise<EventSessionSnapshot | null> {
  const database = await openDatabase()

  database.run('BEGIN TRANSACTION')

  try {
    database.run('DELETE FROM event_state WHERE id = ?', [eventId])
    database.run('DELETE FROM audit_log WHERE event_id = ?', [eventId])

    if (activeEvent?.id === eventId || activeEventId(database) === eventId) {
      activeEvent = null
      clearActiveEventId(database)
    }

    database.run('COMMIT')
    persistDatabase(database)
  } catch (error) {
    database.run('ROLLBACK')
    throw error
  }

  if (!activeEvent) {
    const nextEventId = eventSummaries(database)[0]?.id

    if (!nextEventId) {
      return null
    }

    const nextEvent = loadEvent(nextEventId, database)

    if (!nextEvent) {
      return null
    }

    activeEvent = nextEvent
    setActiveEventId(database, nextEvent.id)
    persistDatabase(database)
  }

  return snapshot(database)
}