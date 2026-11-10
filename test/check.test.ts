import { describe, expect, it } from 'vitest'

import { ageCheck, askAgainUntil, blockCookie, blockedUntil, capFor, isMinor, maxMajority, ruleFor } from '../src/index.js'

const at = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('ageCheck: from only a country and a birth month and year', () => {
  it('blocks under 13 anywhere, until the month they are certainly 13', () => {
    expect(ageCheck({ country: 'US', birthYear: 2014, birthMonth: 3, now: at('2026-11-10') })).toEqual({ result: 'too-young', allowedFrom: '2027-04' })
  })

  it('never takes someone to be older than they are: a birthday this month doesn’t count yet', () => {
    // Born November 2013: some days this month they're 12, so not yet allowed.
    expect(ageCheck({ country: 'US', birthYear: 2013, birthMonth: 11, now: at('2026-11-30') })).toEqual({ result: 'too-young', allowedFrom: '2026-12' })
    expect(ageCheck({ country: 'US', birthYear: 2013, birthMonth: 11, now: at('2026-12-01') }).result).toBe('minor')
  })

  it('uses each country’s age of digital consent: 16 in Germany and Ireland, 14 in Spain and Italy', () => {
    const born = { birthYear: 2011, birthMonth: 1, now: at('2026-11-10') } // 15
    expect(ageCheck({ country: 'DE', ...born }).result).toBe('too-young')
    expect(ageCheck({ country: 'IE', ...born }).result).toBe('too-young')
    expect(ageCheck({ country: 'ES', ...born }).result).toBe('minor')
    expect(ageCheck({ country: 'IT', ...born }).result).toBe('minor')
  })

  it('marks a minor until the month they are certainly of age, by the place’s majority', () => {
    // No state given: the highest of the US's rules (Mississippi, 21), protectively.
    expect(ageCheck({ country: 'US', birthYear: 2010, birthMonth: 6, now: at('2026-11-10') })).toEqual({ result: 'minor', minorUntil: '2031-07' })
    expect(ageCheck({ country: 'US', region: 'AZ', birthYear: 2010, birthMonth: 6, now: at('2026-11-10') })).toEqual({ result: 'minor', minorUntil: '2028-07' })
    expect(ageCheck({ country: 'US', region: 'AL', birthYear: 2010, birthMonth: 6, now: at('2026-11-10') })).toEqual({ result: 'minor', minorUntil: '2029-07' })
    expect(ageCheck({ country: 'US', region: 'MS', birthYear: 2010, birthMonth: 6, now: at('2026-11-10') })).toEqual({ result: 'minor', minorUntil: '2031-07' })
    expect(ageCheck({ country: 'KR', birthYear: 2010, birthMonth: 6, now: at('2026-11-10') })).toEqual({ result: 'minor', minorUntil: '2029-07' })
  })

  it('passes adults, and treats unknown places as consent 13, majority 18', () => {
    expect(ageCheck({ country: 'US', birthYear: 1990, birthMonth: 1, now: at('2026-11-10') })).toEqual({ result: 'adult' })
    expect(ruleFor('ZZ')).toEqual({ consent: 13, majority: 18 })
  })

  it('refuses nonsense rather than guessing', () => {
    expect(ageCheck({ country: 'US', birthYear: 2010, birthMonth: 13 }).result).toBe('invalid')
    expect(ageCheck({ country: 'US', birthYear: 3000, birthMonth: 1 }).result).toBe('invalid')
    expect(ageCheck({ country: 'United States', birthYear: 2000, birthMonth: 1 }).result).toBe('invalid')
    expect(ageCheck({ country: 'US', birthYear: Number.NaN, birthMonth: 1 }).result).toBe('invalid')
  })

  it('a site can raise the minimum, and override any place', () => {
    expect(ageCheck({ country: 'US', birthYear: 2012, birthMonth: 1, now: at('2026-11-10'), minimumAge: 16 }).result).toBe('too-young')
    expect(ageCheck({ country: 'US', birthYear: 2012, birthMonth: 1, now: at('2026-11-10'), ages: { US: { consent: 13, majority: 20 } } })).toEqual({ result: 'minor', minorUntil: '2032-02' })
  })
})

describe('being a minor over time', () => {
  it('isMinor until the stored month, then not', () => {
    expect(isMinor('2028-07', at('2028-06-30'))).toBe(true)
    expect(isMinor('2028-07', at('2028-07-01'))).toBe(false)
    expect(isMinor(null)).toBe(false)
  })

  it('"not yet" moves a year on but never past the cap, which is the highest majority anywhere', () => {
    expect(maxMajority()).toBe(21)
    const cap = capFor(2010, 6, maxMajority())
    expect(cap).toBe('2031-07')
    expect(askAgainUntil('2028-07', cap)).toBe('2029-07')
    expect(askAgainUntil('2030-07', cap)).toBe('2031-07')
    expect(askAgainUntil('2031-07', cap)).toBe('2031-07')
  })
})

describe('the stay-blocked cookie', () => {
  const secret = 'x'.repeat(40)

  it('keeps a too-young visitor blocked until the month, and is signed, HttpOnly and Secure', () => {
    const set = blockCookie(secret, '2027-04')
    expect(set).toMatch(/HttpOnly/)
    expect(set).toMatch(/Secure/)
    expect(set).toMatch(/SameSite=Lax/)
    const header = set.split(';')[0]!
    expect(blockedUntil(secret, header, at('2026-11-10'))).toBe('2027-04')
    expect(blockedUntil(secret, header, at('2027-04-01'))).toBeNull()
  })

  it('ignores a cookie someone edited, or one signed with another secret', () => {
    const header = blockCookie(secret, '2027-04').split(';')[0]!
    expect(blockedUntil(secret, header.replace('2027-04', '2026-01'), at('2025-11-10'))).toBeNull()
    expect(blockedUntil('y'.repeat(40), header, at('2026-11-10'))).toBeNull()
    expect(blockedUntil(secret, 'age-gate=garbage', at('2026-11-10'))).toBeNull()
  })
})
