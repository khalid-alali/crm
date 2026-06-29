import { describe, expect, it } from 'vitest'
import { parseCallEvent, formatCallDuration, callToActivityEntry, QUEUE_DURATION_FLOOR_SEC } from './dialpad'

describe('parseCallEvent', () => {
  const hangup = {
    state: 'hangup',
    call: {
      call_id: 998877,
      direction: 'inbound',
      external_number: '+16195551234',
      target: { id: 42, name: 'Nic' },
      date_started: 1_700_000_000_000,
      date_connected: 1_700_000_005_000,
      date_ended: 1_700_000_065_000,
      duration: 60_000,
      total_duration: 65_000,
    },
  }

  it('parses a hangup event with metadata and no summary', () => {
    const e = parseCallEvent(hangup)
    expect(e.state).toBe('hangup')
    expect(e.callId).toBe('998877')
    expect(e.direction).toBe('inbound')
    expect(e.externalNumber).toBe('+16195551234')
    expect(e.rwUserId).toBe('42')
    expect(e.rwUserName).toBe('Nic')
    expect(e.startedAt).toBe(new Date(1_700_000_000_000).toISOString())
    expect(e.talkSec).toBe(60)
    expect(e.totalSec).toBe(65)
    expect(e.summary).toBeNull()
  })

  it('parses a recap_summary event (string form)', () => {
    const e = parseCallEvent({ state: 'recap_summary', call: { call_id: 998877, recap_summary: 'Shop asked about EV rates.' } })
    expect(e.state).toBe('recap_summary')
    expect(e.callId).toBe('998877')
    expect(e.summary).toBe('Shop asked about EV rates.')
  })

  it('handles top-level fields (no nested call object)', () => {
    const e = parseCallEvent({ state: 'hangup', call_id: '123', direction: 'outbound' })
    expect(e.callId).toBe('123')
    expect(e.direction).toBe('outbound')
  })

  it('classifies unsubscribed states as other and rejects bad call ids', () => {
    expect(parseCallEvent({ state: 'ringing', call: { call_id: 1 } }).state).toBe('other')
    expect(parseCallEvent({ state: 'hangup', call: { call_id: 'not-a-number' } }).callId).toBeNull()
  })

  it('coerces invalid direction to null', () => {
    expect(parseCallEvent({ state: 'hangup', call: { call_id: 1, direction: 'transfer' } }).direction).toBeNull()
  })
})

describe('formatCallDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatCallDuration(192)).toBe('3m 12s')
    expect(formatCallDuration(45)).toBe('45s')
    expect(formatCallDuration(60)).toBe('1m 0s')
  })
  it('returns null for missing or zero duration', () => {
    expect(formatCallDuration(0)).toBeNull()
    expect(formatCallDuration(null)).toBeNull()
  })
})

describe('callToActivityEntry', () => {
  it('builds a feed entry, body null while recap pending', () => {
    const entry = callToActivityEntry({
      call_id: 555,
      location_id: 'loc-1',
      direction: 'outbound',
      rw_user_name: 'Nic',
      external_number: '+16195551234',
      started_at: '2026-06-29T12:00:00.000Z',
      total_sec: 192,
      summary: null,
    })
    expect(entry.id).toBe('call-555')
    expect(entry.type).toBe('call')
    expect(entry.subject).toBe('Outbound call · Nic (3m 12s)')
    expect(entry.body).toBeNull()
    expect(entry.created_at).toBe('2026-06-29T12:00:00.000Z')
  })
})

describe('queue floor', () => {
  it('defaults to 30s', () => {
    expect(QUEUE_DURATION_FLOOR_SEC).toBe(30)
  })
})
