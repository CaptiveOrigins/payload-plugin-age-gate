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
- **Fails closed.** Missing or nonsense answers are refused, not guessed.

What a minor may do on your site is up to your access rules: `isMinor(user.minorUntil)`.

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
// check({ answers: { country, region, birthYear, birthMonth }, req }) → { refuse } | { flag: 'minor', userData } | undefined
```

The picker, for your form: `import { BirthMonthYear } from '@captiveorigins/payload-plugin-age-gate/client'`. It posts `birthMonth` and `birthYear`, and every word can be replaced for translation.

The adult question: `POST /api/users/age-gate/adult` with `{ "adult": true | false }`, signed in.

## Commands

```bash
npm test          # Vitest, in-memory MongoDB
npm run typecheck
npm run build
```

## License

MIT. See `LICENSE`.
