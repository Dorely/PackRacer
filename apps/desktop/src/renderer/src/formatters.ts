import type { Heat, Race, Racer, Stage } from '@packracer/race-engine'

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

export function stageSummary(stage: Stage): string {
  const completeHeats = stage.heats.filter((heat) => heat.status === 'complete').length
  return `${formatStatus(stage.format)} - ${completeHeats}/${stage.heats.length} heats complete`
}

export function raceSummary(race: Race): string {
  const heatCount = race.stages.reduce((total, stage) => total + stage.heats.length, 0)
  return `${formatStatus(race.tournamentType)} - ${race.stages.length} stages - ${heatCount} heats`
}

export function heatLabel(heat: Heat): string {
  return `Heat ${heat.heatNumber} - Round ${heat.roundNumber} - ${formatStatus(heat.status)}`
}