# payload-plugin-age-gate

Age gate for Payload: a neutral birth month and year check at sign-up that stores only how long an account is a minor, from a table of ages by country.

**Status:** early, 0.x. 16 tests pass: the age arithmetic, against a real Payload 3.92 with an in-memory MongoDB. The picker hasn't been tried in a browser yet, and it isn't in use on any site yet. **The table of ages hasn't been checked by a lawyer.** Have yours check it for the places you serve before you rely on it.

## What it does

- **Asks for birth month and year only, never the day,** and never keeps the answer. A neutral picker starts with nothing chosen and says the answer isn't kept.
- **Answers one of three things**, from the person's country (and region where the age differs, like US states):
  - **Too young:** under the place's age of digital consent, and never under 13. A signed, HttpOnly cookie keeps them blocked until that month, so choosing an older year doesn't get round it.
  - **A minor:** the account stores only `minorUntil` (YYYY-MM), the month they're of age where they live, plus a hidden cap.
  - **An adult:** nothing is stored.
- **Never guesses a birthday.** Without the day, someone counts as a year older only once their birth month is over, so the answer is never older than they are.
- **"Are you a legal adult now?"** Once `minorUntil` has passed, the person answers. Yes clears it. No moves it a year on, but never past the highest age of majority anywhere (21), so nobody stays a minor indefinitely.
- **Nobody sets their own status.** Only who you allow with `canSetMinor` (staff) can change `minorUntil`. Every change goes to `onEvent`, for your audit log.
- **Fails closed.** Missing or nonsense answers are refused, not guessed. Where a country's ages differ by region (US states, Canadian provinces) and no region is given, the highest applies.
- **Private.** Only the person and `canSetMinor` can read `minorUntil`. Only an exact `true` from `canSetMinor` counts: see [Access](#access).

**It's self-declared, not verified.** A child can choose a false year or clear their cookies. This checks what people tell you, protectively; it doesn't prove anyone's age.

What a minor may do on your site is up to your access rules: `isMinor(user.minorUntil)`.

## On its own, and with others

**On its own:** it adds `minorUntil` and a hidden cap to your users collection, plus the signed-in adult question. Your own form calls `ageGateCheck` and `applyAgeGate`, and your access rules call `isMinor`. It imports no other Captive Origins plugin.

**Works with:**
- **Sign-up:** put `ageGateCheck` in Sign-up's `checks`. It refuses anyone too young, flags a minor for staff, and hands `minorUntil` to the new account as `userData`. The birth month and year go in as `answers`, which Sign-up never stores. The stay-blocked cookie goes back as `setCookies`, which Sign-up sets on its response (Sign-up's next release; with 0.1.0 it's lost). Neither plugin imports the other: the check returns plain values.
- **Guardians:** Guardians' required `isMinor` can read this plugin's field: `(user) => isMinor(user.minorUntil)`.
- **Audit Trail:** pass `onEvent` through Audit Trail's `fromPluginEvent`, so every change to a minor status lands in the tamper-evident trail.

**Family:** It's part of the **Identity** family (a working draft): plugins designed to sit together for accounts and access. The others are Sign-up, MFA, Hats, Guardians, User Controls, Roles and Masq.

## Use

```ts
import { ageGate, ageGateCheck } from '@captiveorigins/payload-plugin-age-gate'

plugins: [
  ageGate({
    secret: process.env.PAYLOAD_SECRET!, // signs the stay-blocked cookie (32+ characters)
    canSetMinor: ({ req }) => isStaff(req.user),
    onEvent: (e) => audit(e), // minor-set, minor-cleared, asked-again
    // ages: { ...AGES, XX: { consent: 13, majority: 18 } }, // after your lawyer's review
  }),
]

// With @captiveorigins/payload-plugin-signup, or your own form:
const check = ageGateCheck({ secret: process.env.PAYLOAD_SECRET! })
// check({ answers: { country, region, birthYear, birthMonth }, req }) → { refuse, setCookies? } | { flag: 'minor', userData } | undefined
// It reads the stay-blocked cookie from req.headers. Too young: set each of setCookies as a Set-Cookie header on your response.
// After creating the user, record a minor with applyAgeGate(payload, { userId, userData, req }).
// The fields can't be written through access-checked creates, so passing userData with overrideAccess: false would drop it.
```

The picker, for your form: `import { BirthMonthYear } from '@captiveorigins/payload-plugin-age-gate/client'`. It posts `birthMonth` and `birthYear`, and every word can be replaced for translation.

The adult question: `POST /api/users/age-gate/adult` with `{ "adult": true | false }`, signed in.

## Access

`canSetMinor` decides who is staff, and only an answer of exactly `true` counts, for a signed-in user.
Anything else is a no: `false`, `1`, `'yes'`, an object, or an error thrown or rejected. An error
doesn't escape as a 500: the field is simply left out or left unchanged, as for anyone else who
isn't staff. Payload's field access has no queries, so `canSetMinor`'s answer is never passed to it.

| Field | Staff | The person | Anyone else, or signed out |
|---|---|---|---|
| `minorUntil` | Reads, sets, clears | Reads only | Never sees it |
| `minorCap` | Reads, sets, clears | Never sees it | Never sees it |

The person clears their own status only through the adult question above, and `applyAgeGate`
records a sign-up's result with full access.

## Commands

```bash
npm test          # Vitest, in-memory MongoDB
npm run typecheck
npm run build
```

## License

MIT. See `LICENSE`.
