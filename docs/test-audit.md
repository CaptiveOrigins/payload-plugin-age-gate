# Test audit

Kept by this repo's owning session, per `~/Code/CLAUDE.md`, "Test self-audits". Newest first.

## 2026-11-11: only an exact `true` from `canSetMinor` passes

Suite: 18 tests before, 20 after (`npx vitest run`, real Payload, in-memory MongoDB, made-up accounts). Prompted by an access-control sweep across the plugins; the fix follows payload-plugin-sponsors. Kids' safety, so always covered.

- **The gap.** `canSetMinor`'s answer went straight into the field access of `minorUntil` and `minorCap` (create, update, and the cap's read), and `minorUntil`'s read was `self || await canSetMinor(...)`. Any truthy answer, `1`, `'yes'` or an object, let someone set, clear or read a child's minor status. A throw became a 500.
- **The change.** `src/access.ts`: `exactlyTrue` (only `true` passes; a throw or rejection is `false`) and `isStaff` (signed in, and `canSetMinor` answered exactly `true`). Both field guards use it.
- **Tests.** "only an exact yes from canSetMinor": each of `1`, `'yes'`, `{}`, a query-shaped object (`{ id: { exists: true } }`), a thrown error and a rejected promise. Staff and the child can't clear the status, staff can't create a minor, nobody else reads either field, the child still reads their own `minorUntil` and never the cap; every call resolves, none throws. Signed out is a no even with `true`. With `true`, staff read and change both. Then REST through `handleEndpoints` with a real login and a throwing `canSetMinor`: the read answers 200 without the field, the update answers below 500, and nothing changes.
- **Mutation checks.** 5 mutations, each a Python string replace on the file, restored byte for byte (checked by SHA-256). All 5 fail the suite: truthy passing in `exactlyTrue`; errors rethrown; `isStaff` without its sign-in check; the old `staff` guard; the old `selfOrStaff` read.
- **Skipped.** The client picker isn't covered by these tests. The entry below is the starter kit's and is now out of date: the promises are in the README, and `test/plugin.test.ts` and `test/check.test.ts` cover them.

## 2026-11-10: first audit (starter kit)

- Promises: none yet.
- Covered: none yet.
- Gaps added: none.
- Gaps skipped (and why): none.
