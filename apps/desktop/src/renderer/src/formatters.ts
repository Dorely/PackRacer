import type { Heat, Race, Racer } from '@packracer/race-engine'

export function formatTime(timeMs: number | undefined): string {
  return typeof timeMs === 'number' ? `${(timeMs / 1000).toFixed(3)}s` : 'No time'
}

export function formatStatus(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function racerLabel(racers: Racer[], racerId: string | null): string {
  if (!racerId) {
    return 'Open lane'
  }

  const racer = racers.find((candidate) => candidate.id === racerId)
  return racer ? `#${racer.racerNumber} ${racer.name}` : 'Unknown racer'
}

export function raceSummary(race: Race, races: Race[] = []): string {
  const heatCount = race.heats.length
  const entryCount = race.entries?.length ?? 0
  const sourceRace = race.source ? races.find((candidate) => candidate.id === race.source?.sourceRaceId) : null
  const sourceLabel = race.source ? ` - top ${race.source.topCount} from ${sourceRace?.name ?? 'source race'}` : ''
  return `${formatStatus(race.format)} - ${entryCount} entries - ${heatCount} heats${sourceLabel}`
}

export function heatLabel(heat: Heat): string {
  if (heat.makeupSource) {
    return `Heat ${heat.heatNumber} - Makeup for Heat ${heat.makeupSource.originalHeatNumber} - ${formatStatus(heat.status)}`
  }

  return `Heat ${heat.heatNumber} - Round ${heat.roundNumber} - ${formatStatus(heat.status)}`
}
