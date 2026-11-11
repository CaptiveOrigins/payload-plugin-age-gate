import type { PayloadRequest } from 'payload'

/** Only an answer of exactly `true` passes; anything else, a thrown error included, is no. */
export async function exactlyTrue(check: () => unknown): Promise<boolean> {
  try {
    return (await check()) === true
  } catch {
    return false
  }
}

/** Staff: signed in, and `canSetMinor` answered exactly `true` (a truthy value or an error is a no). */
export const isStaff = (canSetMinor: (args: { req: PayloadRequest }) => unknown, req: PayloadRequest): Promise<boolean> =>
  req.user ? exactlyTrue(() => canSetMinor({ req })) : Promise.resolve(false)
