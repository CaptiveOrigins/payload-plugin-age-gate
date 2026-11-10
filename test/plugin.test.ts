import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { buildConfig, createLocalReq, getPayload, type Endpoint, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ageGate, ageGateCheck, applyAgeGate, type AgeGateEvent } from '../src/index.js'

type U = { id: string; email: string; role: string; minorUntil?: string | null; minorCap?: string | null }
let payload: Payload
let mongo: MongoMemoryReplSet
const SECRET = 's'.repeat(40)
const events: AgeGateEvent[] = []
let staff: U
let kid: U
let other: U

const reqAs = async (user: U | null, headers = new Headers()) => {
  const req = (await createLocalReq({ user: (user ? { ...user, collection: 'users' } : undefined) as never }, payload)) as PayloadRequest
  if (!user) req.user = null
  ;(req as { headers: Headers }).headers = headers
  return req
}
const adult = async (user: U, adultAnswer: boolean) => {
  const ep = (payload.collections.users!.config.endpoints as Endpoint[]).find((e) => e.path === '/age-gate/adult')!
  const req = await reqAs(user)
  ;(req as { json: () => Promise<unknown> }).json = async () => ({ adult: adultAnswer })
  return ep.handler(req)
}
const fresh = async (u: U) => (await payload.findByID({ collection: 'users', id: u.id, overrideAccess: true, showHiddenFields: true, depth: 0 })) as unknown as U

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  payload = await getPayload({
    config: await buildConfig({
      secret: 'test-secret-not-for-production',
      telemetry: false,
      typescript: { autoGenerate: false },
      db: mongooseAdapter({ url: mongo.getUri('agegate'), ensureIndexes: true }),
      collections: [{ slug: 'users', auth: true, access: { create: () => true, update: () => true, read: () => true }, fields: [{ name: 'role', type: 'select', options: ['staff', 'member'], defaultValue: 'member' }] }],
      plugins: [ageGate({ secret: SECRET, canSetMinor: ({ req }) => (req.user as unknown as U | null)?.role === 'staff', onEvent: (e) => void events.push(e) })],
    }),
  })
  staff = (await payload.create({ collection: 'users', data: { email: 'staff@example.invalid', password: 'pw-staff-long', role: 'staff' } as never })) as unknown as U
  kid = (await payload.create({ collection: 'users', data: { email: 'kid@example.invalid', password: 'pw-kid-long' } as never })) as unknown as U
  other = (await payload.create({ collection: 'users', data: { email: 'other@example.invalid', password: 'pw-other-long' } as never })) as unknown as U
})

afterAll(async () => {
  await payload?.destroy?.()
  await mongo?.stop()
})

describe('the age gate on a users collection', () => {
  it('stores nothing about age except "minor until" and a hidden cap; nobody but staff can set them', async () => {
    const fields = payload.collections.users!.config.fields.map((f) => ('name' in f ? f.name : null))
    expect(fields).toEqual(expect.arrayContaining(['minorUntil', 'minorCap']))
    expect(fields).not.toEqual(expect.arrayContaining(['birthYear', 'birthMonth', 'birthDate', 'age']))
    // The person themselves can't make themselves an adult (or a minor) through the API.
    await payload.update({ collection: 'users', id: kid.id, data: { minorUntil: '2030-01' } as never, overrideAccess: true })
    const own = await payload.update({ collection: 'users', id: kid.id, data: { minorUntil: null } as never, user: { ...kid, collection: 'users' } as never, overrideAccess: false })
    expect((own as unknown as U).minorUntil).toBe('2030-01')
    // Staff can, and it's logged as theirs.
    const byStaff = await payload.update({ collection: 'users', id: kid.id, data: { minorUntil: '2031-01' } as never, user: { ...staff, collection: 'users' } as never, overrideAccess: false })
    expect((byStaff as unknown as U).minorUntil).toBe('2031-01')
    expect(events.at(-1)).toMatchObject({ type: 'minor-set', from: '2030-01', to: '2031-01', by: 'staff' })
  })

  it('the sign-up check: refuses and sets the stay-blocked cookie when too young, marks a minor, passes an adult', async () => {
    const check = ageGateCheck({ secret: SECRET })
    const young = await reqAs(null)
    expect(check({ answers: { country: 'US', birthYear: new Date().getUTCFullYear() - 10, birthMonth: 1 }, req: young })?.refuse).toMatch(/You can sign up from/)
    const cookie = (young.responseHeaders as Headers | undefined)?.get('Set-Cookie') ?? ''
    expect(cookie).toMatch(/^age-gate=/)
    // Coming back with an older year doesn't get round it.
    const again = await reqAs(null, new Headers({ cookie: cookie.split(';')[0]! }))
    expect(check({ answers: { country: 'US', birthYear: 1980, birthMonth: 1 }, req: again })?.refuse).toMatch(/You can sign up from/)
    const teen = check({ answers: { country: 'US', birthYear: new Date().getUTCFullYear() - 15, birthMonth: 1 }, req: await reqAs(null) })
    expect(teen?.flag).toBe('minor')
    expect(Object.keys(teen?.userData ?? {}).sort()).toEqual(['minorCap', 'minorUntil'])
    expect(check({ answers: { country: 'US', birthYear: 1980, birthMonth: 1 }, req: await reqAs(null) })).toBeUndefined()
    expect(check({ answers: {}, req: await reqAs(null) })?.refuse).toBeTruthy() // fails closed on missing answers
  })

  it('"Are you an adult now?": not before the date; yes clears it; no moves it a year, never past the cap', async () => {
    await payload.update({ collection: 'users', id: kid.id, data: { minorUntil: '2999-01', minorCap: '2999-06' } as never, overrideAccess: true })
    expect((await adult(kid, true)).status).toBe(400) // not yet
    await payload.update({ collection: 'users', id: kid.id, data: { minorUntil: '2020-01', minorCap: '2022-01' } as never, overrideAccess: true })
    expect(await (await adult(kid, false)).json()).toEqual({ adult: false, minorUntil: '2021-01' })
    await payload.update({ collection: 'users', id: kid.id, data: { minorUntil: '2021-06' } as never, overrideAccess: true })
    expect(await (await adult(kid, false)).json()).toEqual({ adult: false, minorUntil: '2022-01' })
    await payload.update({ collection: 'users', id: kid.id, data: { minorUntil: '2022-01' } as never, overrideAccess: true })
    expect(await (await adult(kid, false)).json()).toEqual({ adult: true, minorUntil: null }) // at the cap: an adult everywhere
    await payload.update({ collection: 'users', id: kid.id, data: { minorUntil: '2020-01', minorCap: '2022-01' } as never, overrideAccess: true })
    expect(await (await adult(kid, true)).json()).toEqual({ adult: true })
    expect((await fresh(kid)).minorUntil ?? null).toBeNull()
    expect(events.at(-1)).toMatchObject({ type: 'minor-cleared', by: 'self' })
  })

  it('only the person and staff can read "minor until"; another member and a signed-out request can’t', async () => {
    await payload.update({ collection: 'users', id: kid.id, data: { minorUntil: '2031-04' } as never, overrideAccess: true })
    const as = async (u: U | null) => (await payload.findByID({ collection: 'users', id: kid.id, depth: 0, overrideAccess: false, user: u ? ({ ...u, collection: 'users' } as never) : undefined })) as unknown as U
    expect((await as(kid)).minorUntil).toBe('2031-04')
    expect((await as(staff)).minorUntil).toBe('2031-04')
    expect((await as(other)).minorUntil).toBeUndefined()
    expect((await as(null)).minorUntil).toBeUndefined()
  })

  it('a sign-up that creates with access checks drops the flag, so applyAgeGate records it (and refuses junk)', async () => {
    const userData = { minorUntil: '2030-05', minorCap: '2032-05' }
    const created = (await payload.create({ collection: 'users', data: { email: 'signup@example.invalid', password: 'pw-signup-long', ...userData } as never, overrideAccess: false })) as unknown as U
    expect((await fresh(created)).minorUntil ?? null).toBeNull() // dropped by field access, as the README warns
    await applyAgeGate(payload, { userId: created.id, userData, req: await reqAs(null) })
    expect(await fresh(created)).toMatchObject(userData)
    expect(events.at(-1)).toMatchObject({ type: 'minor-set', to: '2030-05', by: 'signup' })
    await expect(applyAgeGate(payload, { userId: created.id, userData: { minorUntil: 'soon' } })).rejects.toThrow(/YYYY-MM/)
  })

  it('refuses the adult question signed out', async () => {
    const ep = (payload.collections.users!.config.endpoints as Endpoint[]).find((e) => e.path === '/age-gate/adult')!
    expect((await ep.handler(await reqAs(null))).status).toBe(401)
  })

  it('won’t start with a short secret or a missing users collection', () => {
    expect(() => ageGate({ secret: 'short', canSetMinor: () => false })({ collections: [{ slug: 'users', fields: [] }] } as never)).toThrow(/secret/)
    expect(() => ageGate({ secret: SECRET, canSetMinor: () => false })({ collections: [] } as never)).toThrow(/no "users"/)
  })
})
