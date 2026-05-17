import { CalendarDays, Flag, ListPlus, Save } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'

import type { RaceFormat, ScoringMode, TournamentType } from '@packracer/race-engine'

import { formatStatus, raceSummary, stageSummary } from '../formatters'
import type { SectionProps } from './types'

const raceFormats: RaceFormat[] = ['timed-heats', 'points-heats', 'round-robin', 'single-elimination']
const tournamentTypes: TournamentType[] = ['timed-heats', 'points-heats', 'round-robin', 'single-elimination', 'multi-stage']

function defaultScoringMode(format: RaceFormat): ScoringMode {
  if (format === 'points-heats') {
    return 'points-high'
  }

  if (format === 'round-robin') {
    return 'round-robin-record'
  }

  if (format === 'single-elimination') {
    return 'elimination'
  }

  return 'average-time'
}

export function EventSetup({ session, event, currentRace, actions, selectedRaceId, setSelectedRaceId }: SectionProps) {
  const [eventName, setEventName] = useState(event?.name ?? 'Pack Championship')
  const [eventDate, setEventDate] = useState(event?.eventDate ?? new Date().toISOString().slice(0, 10))
  const [trackName, setTrackName] = useState(event?.trackName ?? 'Main Track')
  const [laneCount, setLaneCount] = useState(event?.laneCount ?? 4)
  const [initialRaceName, setInitialRaceName] = useState('Main Race')
  const [initialRaceType, setInitialRaceType] = useState<TournamentType>('timed-heats')
  const [raceName, setRaceName] = useState('Additional Race')
  const [raceType, setRaceType] = useState<TournamentType>('timed-heats')
  const [stageName, setStageName] = useState('Qualifying')
  const [stageFormat, setStageFormat] = useState<RaceFormat>('timed-heats')
  const [roundsPerRacer, setRoundsPerRacer] = useState(4)

  useEffect(() => {
    if (!event) {
      return
    }

    setEventName(event.name)
    setEventDate(event.eventDate)
    setTrackName(event.trackName)
    setLaneCount(event.laneCount)
  }, [event])

  const submitEvent = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (event) {
      void actions.updateEvent({ name: eventName, eventDate, trackName, laneCount })
      return
    }

    void actions.createEvent({
      name: eventName,
      eventDate,
      trackName,
      laneCount,
      initialRace: {
        name: initialRaceName,
        tournamentType: initialRaceType,
        laneCount
      }
    })
  }

  const submitRace = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    void actions.createRace({ name: raceName, tournamentType: raceType, laneCount })
    setRaceName('Additional Race')
  }

  const submitStage = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (!currentRace) {
      return
    }

    void actions.addStage(currentRace.id, {
      name: stageName,
      format: stageFormat,
      laneCount: currentRace.laneCount,
      roundsPerRacer,
      scoringMode: defaultScoringMode(stageFormat)
    })
    setStageName(stageFormat === 'single-elimination' ? 'Final Bracket' : 'Next Stage')
  }

  return (
    <section className="section-grid">
      <form className="race-panel form-panel" onSubmit={submitEvent}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Event</p>
            <h3>{event ? 'Event settings' : 'Create event'}</h3>
          </div>
          <CalendarDays aria-hidden="true" size={24} />
        </div>

        <div className="form-grid two-column">
          <label>
            <span>Event name</span>
            <input value={eventName} onChange={(inputEvent) => setEventName(inputEvent.target.value)} required />
          </label>
          <label>
            <span>Event date</span>
            <input type="date" value={eventDate} onChange={(inputEvent) => setEventDate(inputEvent.target.value)} />
          </label>
          <label>
            <span>Track name</span>
            <input value={trackName} onChange={(inputEvent) => setTrackName(inputEvent.target.value)} />
          </label>
          <label>
            <span>Default lanes</span>
            <input
              type="number"
              min={1}
              max={12}
              value={laneCount}
              onChange={(inputEvent) => setLaneCount(Number(inputEvent.target.value))}
            />
          </label>
          {!event ? (
            <>
              <label>
                <span>First race name</span>
                <input value={initialRaceName} onChange={(inputEvent) => setInitialRaceName(inputEvent.target.value)} />
              </label>
              <label>
                <span>First race type</span>
                <select value={initialRaceType} onChange={(inputEvent) => setInitialRaceType(inputEvent.target.value as TournamentType)}>
                  {tournamentTypes.map((type) => (
                    <option key={type} value={type}>
                      {formatStatus(type)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
        </div>

        <button className="primary-action" type="submit">
          <Save aria-hidden="true" size={18} />
          <span>{event ? 'Save Event' : 'Create Event'}</span>
        </button>

        {session?.events.length ? (
          <div className="stack-list">
            {session.events.map((eventSummary) => (
              <button
                className="list-card selectable-card"
                data-active={eventSummary.id === event?.id}
                key={eventSummary.id}
                onClick={() => void actions.selectEvent(eventSummary.id)}
                type="button"
              >
                <div>
                  <strong>{eventSummary.name}</strong>
                  <span>
                    {eventSummary.eventDate} - {eventSummary.racerCount} racers - {eventSummary.raceCount} races
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </form>

      <div className="race-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Races</p>
            <h3>{currentRace ? currentRace.name : 'Race structure'}</h3>
          </div>
          <Flag aria-hidden="true" size={24} />
        </div>

        {event ? (
          <>
            <form className="compact-form" onSubmit={submitRace}>
              <label>
                <span>Race name</span>
                <input value={raceName} onChange={(inputEvent) => setRaceName(inputEvent.target.value)} />
              </label>
              <label>
                <span>Type</span>
                <select value={raceType} onChange={(inputEvent) => setRaceType(inputEvent.target.value as TournamentType)}>
                  {tournamentTypes.map((type) => (
                    <option key={type} value={type}>
                      {formatStatus(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Lanes</span>
                <input disabled type="number" value={laneCount} readOnly />
              </label>
              <button className="secondary-action" type="submit">
                <ListPlus aria-hidden="true" size={18} />
                <span>Add Race</span>
              </button>
            </form>

            <div className="stack-list">
              {event.races.map((race) => (
                <button
                  className="list-card selectable-card"
                  data-active={race.id === selectedRaceId}
                  key={race.id}
                  onClick={() => setSelectedRaceId(race.id)}
                  type="button"
                >
                  <div>
                    <strong>{race.name}</strong>
                    <span>{raceSummary(race)}</span>
                  </div>
                </button>
              ))}
            </div>

            {currentRace ? (
              <>
                <form className="compact-form" onSubmit={submitStage}>
                  <label>
                    <span>Stage name</span>
                    <input value={stageName} onChange={(inputEvent) => setStageName(inputEvent.target.value)} />
                  </label>
                  <label>
                    <span>Format</span>
                    <select value={stageFormat} onChange={(inputEvent) => setStageFormat(inputEvent.target.value as RaceFormat)}>
                      {raceFormats.map((format) => (
                        <option key={format} value={format}>
                          {formatStatus(format)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Runs per racer</span>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={roundsPerRacer}
                      onChange={(inputEvent) => setRoundsPerRacer(Number(inputEvent.target.value))}
                    />
                  </label>
                  <button className="secondary-action" type="submit">
                    <ListPlus aria-hidden="true" size={18} />
                    <span>Add Stage</span>
                  </button>
                </form>

                <div className="stack-list">
                  {currentRace.stages.map((stage) => (
                    <article className="list-card" key={stage.id}>
                      <div>
                        <strong>{stage.name}</strong>
                        <span>{stageSummary(stage)}</span>
                      </div>
                      <button
                        className="secondary-action"
                        onClick={() => void actions.generateHeats(currentRace.id, stage.id)}
                        type="button"
                      >
                        Generate Heats
                      </button>
                    </article>
                  ))}
                  {currentRace.stages.length === 0 ? <p className="empty-state">Add a stage to generate the first heat sheet.</p> : null}
                </div>
              </>
            ) : null}
          </>
        ) : (
          <p className="empty-state">Create an event to define races and stages.</p>
        )}
      </div>
    </section>
  )
}