# PackRace Vision Document

## Product Vision

PackRace is a local-first race event management platform designed for Cub Scout packs, community groups, schools, hobby clubs, and volunteer-run competitions.

The software replaces fragile spreadsheet-driven workflows with a purpose-built race management experience that is fast, reliable, understandable, and enjoyable to use during live events.

The core philosophy is:

> One laptop should be capable of running an entire race day from registration through awards with no internet connection and no external infrastructure.

PackRace is not designed specifically around Pinewood Derby or Raingutter Regatta rules. Instead, it is built as a generic competition engine capable of supporting many race formats, stages, and advancement structures.

Race-specific experiences are implemented as templates and configurations, not hardcoded workflows.

---

# Core Product Principles

## 1. Local-First

The application must work entirely offline.

No accounts, hosted infrastructure, or internet connection should be required to run an event.

The race host owns the event data locally.

## 2. Reliability Over Complexity

The software is intended for high-stress volunteer environments.

The application should prioritize:

* clarity
* recoverability
* fast workflows
* obvious controls
* auditability
* resilience

The software should avoid over-engineering or enterprise-style workflows.

## 3. Generic Competition Engine

The application should model:

* competitors
* heats
* matches
* lanes
* stages
* scoring
* advancement
* standings

It should not encode race-specific assumptions.

This allows the software to support many event styles.

## 4. Multi-Stage Events

An event may contain multiple stages.

Examples:

* timed qualifiers
* round robin groups
* elimination finals
* consolation brackets
* den-only races
* sibling/adult exhibitions

Stages may feed into later stages through advancement rules.

## 5. Better Than Spreadsheets

The application should improve race day by reducing:

* scheduling errors
* scoring mistakes
* manual bookkeeping
* confusion
* duplicated work
* volunteer stress

The application should improve:

* visibility
* fairness
* speed
* spectator experience
* confidence in results

---

# Core Domain Model

## Event

The top-level race day object.

Contains:

* competitors
* groups/divisions
* stages
* tracks/lanes
* awards
* event configuration

## Competitor

A generic participant entry.

Fields may include:

* competitor number
* participant name
* division/group
* check-in status
* inspection status
* notes
* optional vehicle/team name

## Stage

A portion of the competition.

Examples:

* timed heats
* points racing
* single elimination
* double elimination
* round robin
* finals

Each stage defines:

* format
* schedule
* scoring rules
* advancement rules
* eligible competitors

## Heat / Match

A single competitive run.

Contains:

* competitors
* lane assignments
* results
* rerun status
* notes
* timing/placement data

## Advancement Rule

Defines how competitors move between stages.

Examples:

* top 8 overall
* top 3 per division
* wildcard advancement
* manual selection

---

# V1 Product Goals

V1 should support complete standalone race management on a single device.

A pack should be able to:

1. Create an event
2. Register competitors
3. Configure divisions/groups
4. Build one or more race stages
5. Run heats and brackets
6. Record results
7. Display standings live
8. Advance competitors automatically
9. Complete finals
10. Generate awards and exports

No external infrastructure should be required.

---

# V1 Features

## Event Setup

* Create/edit events
* Configure lane count
* Configure divisions/groups
* Configure awards
* Save/load events

## Registration

* Add/edit competitors
* CSV import
* Search/filter competitors
* Check-in status
* Inspection status
* Scratch/no-show handling
* Notes

## Race Formats

### Timed Heats

Configurable:

* runs per competitor
* lane balancing
* scoring mode:

  * best time
  * average time
  * total time
  * drop worst time

### Points Heats

Configurable:

* points per finish position
* high-score or low-score wins

### Single Elimination

Configurable:

* bracket size
* seeding
* best-of-N matches
* consolation match

## Advancement

* top N overall
* top N per division
* manual advancement
* seed from prior stage

## Heat Generation

* automatic scheduling
* lane balancing
* printable heat sheets
* manual adjustment before start

## Race Control

* current heat display
* result entry
* DNF/DNS handling
* rerun support
* undo last result
* skip/postpone heat
* manual overrides

## Standings

* live rankings
* division rankings
* overall rankings
* fastest run
* tie detection
* tie-breaker support

## Display Mode

* fullscreen projector mode
* current heat
* on-deck heat
* standings
* final rankings

## Awards

* auto-calculated winners
* manual awards
* export/print summaries

## Import / Export

* CSV import/export
* PDF standings
* PDF heat sheets
* backup/restore event files

## Reliability Features

* autosave
* recovery after crash
* audit log
* destructive action confirmation

---

# Example Event Flow

## Pack Championship Event

### Stage 1: Qualifying

Format: Timed Heats

* All competitors race
* Each competitor races each lane once
* Ranking by average time

Advancement:

* Top 8 overall advance

### Stage 2: Championship Bracket

Format: Single Elimination

* Seeded from Stage 1 results
* Best-of-3 matches

Awards:

* Overall champion
* Top 3 finishers
* Fastest single run
* Division winners
* Design awards

---

# Future Product Vision

## V2: Enhanced Race-Day Experience

* improved projector themes
* announcer mode
* label printing
* certificate generation
* event templates
* historical statistics
* lane analytics
* better reporting

## V3: Local Network Companion Devices

The host machine runs a local server.

Nearby devices may:

* auto-discover the event
* connect via QR code or PIN
* act as:

  * check-in stations
  * display boards
  * judge tablets
  * spectator displays

No cloud infrastructure required.

## V4: Hardware Integration

* timer integration
* serial/USB hardware support
* automatic time ingestion
* calibration tools
* timer diagnostics

## V5: Optional Cloud Features

Optional only.

Potential features:

* cloud backups
* public results pages
* remote registration
* historical archives
* shared pack management

Cloud functionality must never become required for local race operation.

---

# Product North Star

> PackRace should become the simplest and most trustworthy way for volunteer organizations to run structured race events without spreadsheets, internet dependency, or operational chaos.

# PackRace Architecture Document

# Architecture Goals

The PackRace architecture is designed around:

* offline-first operation
* local ownership of data
* desktop-first workflows
* future LAN-connected auxiliary devices
* reliable live-event performance
* cross-platform support

The architecture should allow:

* a single-device standalone experience in V1
* future expansion into local-network multi-device operation
* future timer and hardware integration

without requiring major rewrites.

---

# Recommended Technology Stack

## Primary Platform

### Electron

Electron is recommended as the desktop shell because it provides:

* mature cross-platform support
* strong local networking support
* straightforward hardware integration
* robust filesystem access
* excellent TypeScript ecosystem
* multi-window support

Target platforms:

* Windows
* macOS
* Linux (optional)

---

# Frontend

## React + TypeScript

The UI should use:

* React
* TypeScript
* component-driven architecture

Recommended supporting libraries:

* TanStack Router
* TanStack Query
* Zustand or Redux
* TailwindCSS
* shadcn/ui or similar component system

The UI must prioritize:

* large controls
* rapid workflows
* readability at distance
* low cognitive load

---

# Backend Runtime

The Electron application should host a local backend runtime.

Recommended:

* Node.js runtime
* Fastify or Express server

Responsibilities:

* event state management
* local API hosting
* websocket synchronization
* file management
* import/export
* hardware integration
* local network services

---

# Local Database

## SQLite

SQLite is the recommended V1 database.

Advantages:

* local application-owned storage
* no installation requirements
* highly reliable
* simple local backup/restore
* easy backup/restore

Possible access layers:

* Prisma
* Drizzle ORM
* better-sqlite3
* Knex

The desktop app should own the local SQLite database. Events are records inside that database, not user-created project files.

---

# Application Architecture

## High-Level Structure

```txt
Electron Host Application
├── React UI
├── Race Engine
├── Local API Server
├── WebSocket Server
├── SQLite Database
├── Import/Export System
└── Future Hardware Integrations
```

---

# Recommended Project Structure

```txt
packrace/
├── apps/
│   ├── desktop/
│   └── mobile/              future
│
├── packages/
│   ├── race-engine/
│   ├── ui/
│   ├── shared-types/
│   ├── scheduling/
│   ├── scoring/
│   └── export-system/
│
├── services/
│   ├── local-api/
│   ├── websocket/
│   └── discovery/           future
│
└── tools/
```

---

# Core Race Engine

The race engine should be isolated from the UI.

This is critical.

The engine should contain:

* event models
* stage management
* scheduling algorithms
* lane balancing
* scoring systems
* advancement rules
* bracket generation
* standings calculations
* tie handling

The UI should consume race engine APIs rather than implementing business logic directly.

---

# Data Model Concepts

## Event

Contains:

* metadata
* competitors
* stages
* settings
* tracks
* awards

## Stage

Contains:

* format type
* competitor pool
* heats/matches
* advancement rules
* scoring rules

## Heat

Contains:

* lane assignments
* competitors
* result data
* status
* notes

## Result

Contains:

* finish order
* timing data
* penalties
* rerun markers

---

# Scheduling System

The scheduling engine should support pluggable scheduling algorithms.

Examples:

* lane-balanced timed heats
* round robin
* seeded elimination brackets
* double elimination

The scheduler should support:

* configurable lane counts
* fairness constraints
* duplicate matchup avoidance
* spacing between heats

---

# Standings Engine

The standings system should support multiple scoring models.

Examples:

* average time
* best time
* total time
* points systems
* wins/losses
* elimination advancement

The standings engine should produce:

* overall rankings
* division rankings
* advancement seeding
* award calculations

---

# Local API Layer

## V1

The local API layer may initially only support internal communication.

## Future Use

The API layer later supports:

* mobile clients
* projector displays
* check-in tablets
* remote displays

Recommended architecture:

* REST API for standard operations
* WebSockets for realtime updates

Potential technologies:

* Fastify
* Express
* Socket.IO
* native WebSocket

---

# Real-Time Synchronization

Future multi-device support should use realtime synchronization.

Recommended:

* WebSockets
* Socket.IO

Used for:

* live standings
* current heat updates
* check-in changes
* race progression
* device synchronization

---

# Multi-Window Support

V1 should support:

* operator window
* projector/display window

The display window may:

* show current heat
* show upcoming heats
* show standings
* show championship brackets

---

# Local Network Discovery (Future)

## V3 Architecture

The desktop app will host a local LAN service.

Recommended discovery mechanisms:

* mDNS
* Bonjour
* Zeroconf

Example:

```txt
_packrace._tcp.local
```

Devices on the same network may auto-discover active events.

Fallback connection methods:

* QR code
* manual IP entry
* local URL
* PIN pairing

---

# Device Roles (Future)

Future auxiliary devices may support roles such as:

* check-in station
* display board
* judge tablet
* announcer console
* spectator mode

Role-based permissions should be supported.

---

# Security Philosophy

The application is intended primarily for trusted local environments.

Security should prioritize:

* accidental misuse prevention
* simple pairing
* local-only exposure

Recommended:

* local-only server binding by default
* optional LAN sharing
* event token authentication
* short PIN pairing

Avoid:

* mandatory accounts
* cloud auth dependencies
* complex identity systems

---

# Import / Export System

The application should support:

* CSV import/export
* PDF exports
* printable heat sheets
* standings reports
* event archive backups

The export system should be modular.

---

# Hardware Integration (Future)

The architecture should anticipate future timer integration.

Potential integrations:

* serial devices
* USB timers
* lane sensors

The hardware layer should be isolated from the race engine.

Recommended architecture:

```txt
Timer Adapter Interface
├── Manual Entry Adapter
├── Serial Timer Adapter
├── USB Timer Adapter
└── Simulated/Test Adapter
```

---

# Reliability Requirements

The application must support:

* autosave
* crash recovery
* event restoration
* undo support
* audit logs
* offline operation

Race-day reliability is more important than architectural purity.

---

# Performance Expectations

Expected event sizes:

* 5–100 competitors
* 2–8 lanes
* hundreds of heats

Performance requirements are modest.

The primary engineering focus should be:

* responsiveness
* reliability
* usability
* maintainability

rather than extreme optimization.

---

# Long-Term Architecture Goal

The architecture should evolve from:

```txt
Single-device standalone application
```

to:

```txt
Local-first event platform with optional LAN-connected auxiliary devices and hardware integrations
```

without introducing mandatory cloud infrastructure.
