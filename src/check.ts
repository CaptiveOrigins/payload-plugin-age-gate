import { AGES, ruleFor, type AgeRule } from './ages.js'

/** A month as "YYYY-MM". */
export type YearMonth = `${number}-${string}`

export type AgeResult =
  | { result: 'too-young'; allowedFrom: string }
  | { result: 'minor'; minorUntil: string }
  | { result: 'adult' }
  | { result: 'invalid'; reason: string }

export type AgeInput = {
  /** ISO 3166-1 alpha-2, e.g. "US". */
  country: string
  /** e.g. "AL" for Alabama; optional. */
  region?: string | null
  birthYear: number
  /** 1 to 12. */
  birthMonth: number
  now?: Date
  ages?: Record<string, AgeRule>
  /** The youngest anyone may ever sign up, wherever they are. Default 13. */
  minimumAge?: number
}

const ym = (year: number, month: number): string => {
  // month may be 13 (January of the next year)
  const y = year + Math.floor((month - 1) / 12)
  const m = ((month - 1) % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

/**
 * Where someone stands, from only their country and birth month and year. The answer itself is never stored by this
 * function, and it never guesses a birthday: without the day, someone is taken to turn a year older only once their
 * birth month is over, so the answer is never older than they are. "From YYYY-MM" means from the first day of that
 * month.
 */
export function ageCheck(input: AgeInput): AgeResult {
  const now = input.now ?? new Date()
  const { birthYear, birthMonth } = input
  if (!Number.isInteger(birthYear) || !Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) return { result: 'invalid', reason: 'Choose your birth month and year.' }
  if (birthYear > now.getUTCFullYear() || birthYear < now.getUTCFullYear() - 130) return { result: 'invalid', reason: 'Choose your birth month and year.' }
  if (!/^[A-Za-z]{2}$/.test(input.country.trim())) return { result: 'invalid', reason: 'Choose your country.' }
  const rule = ruleFor(input.country, input.region, input.ages ?? AGES)
  const consent = Math.max(rule.consent, input.minimumAge ?? 13)
  // The month in which someone is certainly `age` years old: the month after their birth month, `age` years on.
  const from = (age: number) => ym(birthYear + age, birthMonth + 1)
  const nowYm = ym(now.getUTCFullYear(), now.getUTCMonth() + 1)
  if (nowYm < from(consent)) return { result: 'too-young', allowedFrom: from(consent) }
  if (nowYm < from(rule.majority)) return { result: 'minor', minorUntil: from(rule.majority) }
  return { result: 'adult' }
}

/** Whether an account with this `minorUntil` is a minor now. No value: an adult. */
export const isMinor = (minorUntil: string | null | undefined, now = new Date()) =>
  Boolean(minorUntil) && ym(now.getUTCFullYear(), now.getUTCMonth() + 1) < (minorUntil as string)

/** The month a "no, not yet" answer moves `minorUntil` to: a year later, but never past `cap`. */
export const askAgainUntil = (minorUntil: string, cap: string): string => {
  const [y, m] = minorUntil.split('-').map(Number) as [number, number]
  const next = ym(y + 1, m)
  return next < cap ? next : cap
}

/** The latest a minor can stay one, from where they turned out to be a minor: the highest age of majority anywhere. */
export const capFor = (birthYear: number, birthMonth: number, maxAge: number) => ym(birthYear + maxAge, birthMonth + 1)
