import { createTimerAdapter } from './profiles'
import type { AdvancedTimerProfile, PhysicalTimerProfileId, TimerAdapterEvent } from './types'

export const replayChunks: Record<Exclude<PhysicalTimerProfileId, 'advanced'>, string[]> = {
  'dfgtec-pdt': ['P\r\nK\r\nvert=3.10\r\nB\r\n1 - 3.', '0123\r', '\n2 - 3.0124\r\n3 - 99.9990\r\n', '1 - 3.0123\r\n2 - bad\r\n3 - 3.'],
  'micro-wizard-fasttrack': ['noise\r\nA=3.', '001! B=3.026"\r', '\nA=3.001!\r\nC=bad\r\nD=3.'],
  'besttrack-champ': ['noise\rA=3.011! B=', '3.022" C=3.105#\r', 'A=3.011!\rD=bad\rE=3.'],
  'besttrack-champ-srm': ['noise\rS\r1=3.021!', ' 2=3.044" 3=3.090#\r', '1=3.021!\r4=bad\r5=3.'],
  newbold: ['noise\r\n1 2.998 2 ', '3.041 3 3.125\r\n', '1 2.998\r\nmalformed\r\n4 3.'],
  'the-judge': ['noise\rGo!\rLane 1 3.', '0101\rLane 2 3.0442\rLane 3 9.9999 DNF\rRace Over\r', 'Lane 1 3.0101\rLane X bad\rLane 4 3.']
}

export function replayTimerProfile(profileId: PhysicalTimerProfileId, advanced?: AdvancedTimerProfile): { chunks: string[]; events: TimerAdapterEvent[] } {
  const adapter = createTimerAdapter(profileId, advanced)
  adapter.beginHeat()
  const chunks = profileId === 'advanced' ? ['Lane 1 3.', '012\r\nLane 2 3.104\r\n'] : replayChunks[profileId]
  return { chunks, events: chunks.flatMap((chunk) => adapter.ingest(chunk)) }
}
