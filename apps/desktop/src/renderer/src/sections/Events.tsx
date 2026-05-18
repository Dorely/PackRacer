import { CalendarDays, FolderOpen, Save, Trash2 } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'

import type { SectionProps } from './types'

export function Events({ session, event, actions, requestConfirmation }: SectionProps) {
  const [eventName, setEventName] = useState(event?.name ?? 'Pack Championship')
  const [eventDate, setEventDate] = useState(event?.eventDate ?? new Date().toISOString().slice(0, 10))

  useEffect(() => {
    setEventName(event?.name ?? 'Pack Championship')
    setEventDate(event?.eventDate ?? new Date().toISOString().slice(0, 10))
  }, [event])

  const submitEvent = (formEvent: FormEvent) => {
    formEvent.preventDefault()

    if (event) {
      void actions.updateEvent({ name: eventName, eventDate })
      return
    }

    void actions.createEvent({ name: eventName, eventDate })
  }

  const createNewEvent = () => {
    void actions.createEvent({ name: eventName, eventDate })
  }

  const deleteEvent = (eventId: string, name: string) => {
    requestConfirmation({
      title: 'Delete event',
      message: `Delete ${name}? This permanently removes the local event and its race data.`,
      confirmLabel: 'Delete Event',
      destructive: true,
      onConfirm: () => actions.deleteEvent(eventId)
    })
  }

  return (
    <section className="section-grid events-grid">
      <form className="race-panel form-panel" onSubmit={submitEvent}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Event</p>
            <h3>{event ? 'Edit selected event' : 'Create event'}</h3>
          </div>
          <CalendarDays aria-hidden="true" size={24} />
        </div>

        <div className="form-grid">
          <label>
            <span>Event name</span>
            <input value={eventName} onChange={(inputEvent) => setEventName(inputEvent.target.value)} required />
          </label>
          <label>
            <span>Event date</span>
            <input type="date" value={eventDate} onChange={(inputEvent) => setEventDate(inputEvent.target.value)} />
          </label>
        </div>

        <div className="button-row">
          <button className="primary-action" type="submit">
            <Save aria-hidden="true" size={18} />
            <span>{event ? 'Save Event' : 'Create Event'}</span>
          </button>
          {event ? (
            <button className="secondary-action" onClick={createNewEvent} type="button">
              <CalendarDays aria-hidden="true" size={18} />
              <span>Create New Event</span>
            </button>
          ) : null}
        </div>
      </form>

      <div className="race-panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Saved events</p>
            <h3>{session?.events.length ?? 0} available</h3>
          </div>
          <FolderOpen aria-hidden="true" size={24} />
        </div>

        <div className="stack-list">
          {session?.events.map((eventSummary) => (
            <article className="list-card" data-active={eventSummary.id === event?.id} key={eventSummary.id}>
              <button className="bare-select" onClick={() => void actions.selectEvent(eventSummary.id)} type="button">
                <strong>{eventSummary.name}</strong>
                <span>
                  {eventSummary.eventDate} - {eventSummary.racerCount} racers - {eventSummary.raceCount} races
                </span>
              </button>
              <button
                className="danger-action"
                onClick={() => deleteEvent(eventSummary.id, eventSummary.name)}
                type="button"
              >
                <Trash2 aria-hidden="true" size={16} />
                <span>Delete</span>
              </button>
            </article>
          )) ?? null}
          {session?.events.length ? null : <p className="empty-state">Create an event to begin setup.</p>}
        </div>
      </div>
    </section>
  )
}
