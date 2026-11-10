import { createHmac, timingSafeEqual } from 'node:crypto'

import type { CollectionConfig, Config, Endpoint, Field, PayloadRequest, Plugin } from 'payload'
import { APIError } from 'payload'

import { AGES, DEFAULT_RULE, maxMajority, ruleFor, type AgeRule } from './ages.js'
import { ageCheck, askAgainUntil, capFor, isMinor, type AgeResult } from './check.js'

export { AGES, DEFAULT_RULE, maxMajority, ruleFor, type AgeRule } from './ages.js'
export { ageCheck, askAgainUntil, capFor, isMinor, type AgeInput, type AgeResult } from './check.js'

export type AgeGateEvent = {
  type: 'minor-set' | 'minor-cleared' | 'asked-again'
  user: string
  from: string | null
  to: string | null
  by: 'signup' | 'self' | 'staff' | 'system'
  req: PayloadRequest
}

export type AgeGateOptions = {
  /** The auth collection's slug. Default "users". */
  users?: string
  /** Ages by place; defaults to AGES. Merge your own entries over it after your lawyer's review. */
  ages?: Record<string, AgeRule>
  /** The youngest anyone may sign up anywhere. Default 13. */
  minimumAge?: number
  /** Who may set or clear an account's minor status by hand (staff, for safety). Nobody else ever can. */
  canSetMinor: (args: { req: PayloadRequest }) => boolean | Promise<boolean>
  /** Signs the "too young, come back later" cookie. Use a long random secret (e.g. your app secret). */
  secret: string
  /** Every change to an account's minor status, for your audit log. */
  onEvent?: (event: AgeGateEvent) => void | Promise<void>
}

const COOKIE = 'age-gate'
const sig = (secret: string, value: string) => createHmac('sha256', `age-gate:${secret}`).update(value).digest('base64url')

/** A cookie that keeps a too-young visitor blocked until `allowedFrom`, so picking another year doesn't get round it. */
export function blockCookie(secret: string, allowedFrom: string, secure = true): string {
  const value = `${allowedFrom}.${sig(secret, allowedFrom)}`
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 400}${secure ? '; Secure' : ''}`
}

/** The month a blocked visitor may try again from, if a valid block cookie is present and still in force. */
export function blockedUntil(secret: string, cookieHeader: string | null | undefined, now = new Date()): string | null {
  const raw = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(cookieHeader ?? '')?.[1]
  if (!raw) return null
  const [month, mac] = raw.split('.')
  if (!month || !mac || !/^\d{4}-\d{2}$/.test(month)) return null
  const expected = Buffer.from(sig(secret, month))
  const got = Buffer.from(mac)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null
  const nowYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return nowYm < month ? month : null
}

export type SignupAnswers = { country?: unknown; region?: unknown; birthYear?: unknown; birthMonth?: unknown }

/**
 * A sign-up check (for @captiveorigins/payload-plugin-signup's `checks`, or your own form): refuses someone too young,
 * marks a minor with `minorUntil` and `minorCap`, and passes adults. The answers are only read, never stored.
 */
export function ageGateCheck(opts: Pick<AgeGateOptions, 'ages' | 'minimumAge' | 'secret'>) {
  return ({ answers, req }: { answers?: SignupAnswers; req: PayloadRequest }) => {
    const blocked = blockedUntil(opts.secret, req.headers.get('cookie'))
    if (blocked) return { refuse: tooYoungMessage(blocked) }
    const a = answers ?? {}
    const result: AgeResult = ageCheck({
      country: String(a.country ?? ''),
      region: a.region ? String(a.region) : null,
      birthYear: Number(a.birthYear),
      birthMonth: Number(a.birthMonth),
      ages: opts.ages,
      minimumAge: opts.minimumAge,
    })
    if (result.result === 'invalid') return { refuse: result.reason }
    if (result.result === 'too-young') {
      req.responseHeaders = new Headers(req.responseHeaders)
      req.responseHeaders.append('Set-Cookie', blockCookie(opts.secret, result.allowedFrom))
      return { refuse: tooYoungMessage(result.allowedFrom) }
    }
    if (result.result === 'minor') {
      const cap = capFor(Number(a.birthYear), Number(a.birthMonth), maxMajority(opts.ages ?? AGES))
      return { flag: 'minor', userData: { minorUntil: result.minorUntil, minorCap: cap } }
    }
    return undefined
  }
}

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
export const tooYoungMessage = (allowedFrom: string) => `Thanks for your interest! You can sign up from ${monthName(allowedFrom)}.`

/** The fields added to the users collection. Nobody can change them through the API except `canSetMinor`. */
function fields(opts: AgeGateOptions): Field[] {
  const staff = ({ req }: { req: PayloadRequest }) => Promise.resolve(opts.canSetMinor({ req }))
  return [
    {
      name: 'minorUntil',
      label: 'A minor until',
      type: 'text',
      index: true,
      access: { create: () => false, update: staff },
      validate: (v: unknown) => (v == null || v === '' || /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v)) ? true : 'Use YYYY-MM.'),
      admin: { position: 'sidebar', description: 'Set at sign-up from the age check, or by staff for safety. Empty: an adult.' },
    },
    {
      name: 'minorCap',
      type: 'text',
      access: { create: () => false, update: staff, read: staff },
      admin: { hidden: true },
    },
  ]
}

/** POST /api/<users>/age-gate/adult { adult: boolean }: the person answers "Are you a legal adult now?". */
function adultEndpoint(opts: AgeGateOptions, users: string): Endpoint {
  return {
    path: '/age-gate/adult',
    method: 'post',
    handler: async (req) => {
      if (!req.user || req.user.collection !== users) return Response.json({ errors: [{ message: 'Sign in first.' }] }, { status: 401 })
      const body = (await req.json?.().catch(() => null)) as { adult?: unknown } | null
      const me = (await req.payload.findByID({ collection: users as never, id: req.user.id, depth: 0, overrideAccess: true, req, showHiddenFields: true })) as unknown as { minorUntil?: string | null; minorCap?: string | null }
      if (!me.minorUntil) return Response.json({ adult: true })
      // Only asked once the date has come.
      if (isMinor(me.minorUntil)) return Response.json({ errors: [{ message: 'Not yet.' }] }, { status: 400 })
      if (body?.adult === true) {
        await req.payload.update({ collection: users as never, id: req.user.id, data: { minorUntil: null, minorCap: null } as never, overrideAccess: true, req, context: { ageGate: true } })
        await opts.onEvent?.({ type: 'minor-cleared', user: String(req.user.id), from: me.minorUntil, to: null, by: 'self', req })
        return Response.json({ adult: true })
      }
      // "No, not yet": a year later, never past the cap; at the cap they're an adult by every place's rule.
      const cap = me.minorCap ?? me.minorUntil
      const next = me.minorUntil >= cap ? null : askAgainUntil(me.minorUntil, cap)
      await req.payload.update({ collection: users as never, id: req.user.id, data: { minorUntil: next, ...(next ? {} : { minorCap: null }) } as never, overrideAccess: true, req, context: { ageGate: true } })
      await opts.onEvent?.({ type: next ? 'asked-again' : 'minor-cleared', user: String(req.user.id), from: me.minorUntil, to: next, by: next ? 'self' : 'system', req })
      return Response.json({ adult: !next, minorUntil: next })
    },
  }
}

/**
 * Age gate for Payload: a neutral birth month and year check at sign-up that stores only how long an account is a
 * minor. Adds `minorUntil` (and a hidden cap) to your users collection, the "Are you an adult now?" endpoint, and logs
 * every change through `onEvent`. What a minor may do is your access rules' business: use `isMinor(user.minorUntil)`.
 */
export const ageGate =
  (opts: AgeGateOptions): Plugin =>
  (config: Config): Config => {
    const users = opts.users ?? 'users'
    if (!opts.secret || opts.secret.length < 32) throw new Error('age-gate: `secret` must be at least 32 characters.')
    const found = (config.collections ?? []).some((c) => c.slug === users)
    if (!found) throw new Error(`age-gate: no "${users}" collection.`)
    return {
      ...config,
      collections: (config.collections ?? []).map((c): CollectionConfig => {
        if (c.slug !== users) return c
        return {
          ...c,
          fields: [...(c.fields ?? []), ...fields(opts)],
          endpoints: [...(c.endpoints || []), adultEndpoint(opts, users)],
          hooks: {
            ...c.hooks,
            afterChange: [
              ...(c.hooks?.afterChange ?? []),
              // Staff changes are logged; the plugin's own changes log themselves.
              async ({ doc, previousDoc, operation, req, context }) => {
                if (context?.ageGate || operation !== 'update' || doc.minorUntil === previousDoc?.minorUntil) return doc
                const type = doc.minorUntil ? 'minor-set' : 'minor-cleared'
                await opts.onEvent?.({ type, user: String(doc.id), from: previousDoc?.minorUntil ?? null, to: doc.minorUntil ?? null, by: req.user ? 'staff' : 'system', req })
                return doc
              },
            ],
          },
        }
      }),
      custom: { ...config.custom, ageGate: { users, minimumAge: opts.minimumAge ?? 13 } },
    }
  }

/** For your own check outside sign-up (e.g. an invite form): throws a plain refusal when the answers aren't allowed. */
export function assertAllowedAge(input: Parameters<typeof ageCheck>[0]): AgeResult {
  const r = ageCheck(input)
  if (r.result === 'invalid') throw new APIError(r.reason, 400, null, true)
  if (r.result === 'too-young') throw new APIError(tooYoungMessage(r.allowedFrom), 403, null, true)
  return r
}
