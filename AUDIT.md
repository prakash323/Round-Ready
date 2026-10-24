# RoundReady — defect audit

Findings from a full read of the pre-port Next.js application, with each one
reproduced against the real engine before being written down rather than
inferred from reading. Verified at the time of audit: `tsc --noEmit` clean,
`next build` clean, 217 tests passing.

Status is as of the MERN port.

| ID | Defect | Severity | Status |
|---|---|---|---|
| D1 | A deleted drive silently blocks every classmate's board | High | Fixed |
| D2 | One-click destruction of shared data | High | Fixed |
| D3 | Duplicate round names collapse calendar events | Medium | Fixed in port |
| D4 | `z.coerce.date()` accepts `null` as 1 Jan 1970 | Medium | Fixed in port |
| D5 | Undecidable drives ranked against themselves | Medium | Fixed in port |
| D6 | A round in progress reports "nothing scheduled" | Medium | Fixed in port |
| D7 | `O(n²)` policy evaluation | Low | Fixed |
| D8 | Accessibility and loading-state gaps | Low | Partly fixed in port |
| D9 | `npm run lint` does not run; no CI | Low | Fixed in port |
| D10 | Smaller findings (see below) | Low | Open |

---

## D1 — A deleted drive silently blocks every classmate's board

**Severity: high.** This produced the exact failure the product exists to
prevent: a wrong verdict with no visible reason.

`DELETE /api/drives/:id` removed applications **scoped to the deleting user**,
so every other student in the batch kept a row pointing at a drive that no
longer existed. That orphan was still loaded and fed to the engine, where
`activeOffers` resolved the missing drive to `ctcLpa: 0`. Under a
`dream_threshold` policy the floor became `max(0, 12) = 12`, so **every drive at
or below 12 LPA was blocked** — attributed to a company with no card on the
board, which the student could therefore neither see nor clear.

Reproduced:

```
status: blocked | reason: "At 10 LPA this is not above the 12 LPA line,
and the dream cutoff is 12 LPA." | offers: 1
```

**Fix.** Three layers. The cleanup is no longer scoped to one user; drives are
soft-deleted (`deletedAt`) and filtered at read time so a shared record is
never destroyed under other people's applications; and `activeOffers`
distinguishes two cases, because the directions of error are not symmetrical:

- An offer carrying its own `offerCtcLpa` still gates. That number came from
  the student, not the drive, so it survives the drive's deletion. Dropping it
  would wrongly show blocked drives as open, which is the dangerous direction.
- With neither a drive nor a recorded amount there is no number to reason
  about. The offer is dropped and reported through `PolicyResult.warning`, so
  the board says so out loud instead of blocking silently.

`policy.test.ts` previously *asserted* the zero-CTC fallback as correct
behaviour; that test was rewritten, and the regression is covered at both the
policy and board level.

## D2 — One-click destruction of shared data

**Severity: high.** The delete control fired the request straight from
`onClick`. Any batch member destroyed a record thirty classmates depended on
with one click — no confirmation, no undo, no record of who did it.

**Fix.** A typed confirmation naming the company, which states the real blast
radius (removes the drive from every student's board along with each of their
application records). Matched against the *saved* company name rather than the
live input, since that is the record being destroyed. `Enter` inside the
confirm field is suppressed, because it would otherwise submit the surrounding
form. `createdBy` is shown on the drive card so a shared edit has an author.

## D3 — Duplicate round names collapse calendar events

`roundSchema` enforces no uniqueness, so two rounds both called "Technical
Interview" are accepted. The `.ics` UID was `${drive.id}-${slug(round.name)}`,
so both emitted the **same UID** — calendar clients treat the second as an
update to the first, and one of the two interviews silently vanishes from the
student's phone. `agenda()`'s clash set was keyed off the display name too, so
it flagged both rounds when only one actually clashed.

**Fix.** Rounds are a Mongoose subdocument array and so carry their own stable
`_id`. The UID and the clash set are keyed off that id, never off the name.

## D4 — `z.coerce.date()` accepts `null` as 1 Jan 1970

`new Date(null)` is a *valid* epoch date, and `roundSchema.startAt` is
`z.coerce.date()`. The client builds `startAt: istInputToUtc(value)`, which
returns `null` for any string its regex does not match. Reproduced:
`null startAt accepted: true → 1970-01-01T00:00:00.000Z`. A 1970 round is a
permanent "deadline passed" ghost.

**Fix.** Reject non-string and empty input explicitly in the schema, and have
the form surface an `istInputToUtc` failure as a field error instead of posting
`null`.

## D5 — Undecidable drives ranked against themselves

`bestAvailableCtcLpa` was computed from the `actionable` group only, then
`scoreDrive` fell back to the drive's own CTC for rankable drives. So when
nothing was actionable, a 3 LPA undecidable drive earned the **full 45
compensation points** — "3 LPA against the best available 3 LPA". The `unknown`
group's ordering was therefore meaningless in exactly the situation a new user
hits first, before their profile is filled in.

**Fix.** Use `actionable ∪ unknown` for the denominator.

## D6 — A round in progress reports "nothing scheduled"

`nextDateFor` only considered rounds with `startAt > now`. During a 10:00–12:00
test at 10:30, `nextDate` was `null`, urgency scored 0, and the card read
"Dates to be announced". "In progress right now" is the most urgent state a
drive can be in and the board could not express it.

**Fix.** A round whose `endAt` is still in the future is the current item, and
is labelled live.

## D7 — `O(n²)` policy evaluation

`buildBoard` calls `evaluatePolicy(profile, drive, applications, drives)` once
per drive, and each call rebuilds `new Map(drives.map(...))` and re-scans every
application. Irrelevant at forty drives, but the resolved floor could be
hoisted out of the loop and passed in.

**Fixed.** `resolvePolicyContext` resolves the gate once — who holds the
governing offer, where that draws the line, and whether the application set
warrants a warning — and `evaluatePolicyFor` applies it per drive. `buildBoard`
is now O(drives) rather than O(drives² + drives·applications).

`evaluatePolicy` keeps its original signature and resolves its own context, so
every existing caller and test is untouched. There is no test that failed before
this fix, because there was no behavioural symptom: the guard is an equivalence
test asserting the two paths produce identical results across a matrix of
policies, offer states and drives. A refactor whose whole point is that nothing
changed needs something watching that nothing changed.

## D8 — Accessibility and loading-state gaps

- `.field` used `focus:outline-none` with only a border-colour change, and
  buttons had no `focus-visible` style at all, so keyboard navigation had no
  reliable focus indicator.
- Form status messages had no `aria-live`, so "Saved" and error text were
  silent to screen readers.
- No `loading.tsx` anywhere. Every page was `force-dynamic` with database round
  trips, so navigation hung with no feedback.

**Partly fixed in the port:** `aria-live` on form status, a visible
`focus-visible` ring, and loading states on every page that fetches. A full
audit (contrast ratios, landmark structure, keyboard traps) is still open.

## D9 — `npm run lint` does not run; no CI

`"lint": "next lint"` — removed in Next 16, so the script failed with
`Invalid project directory provided, no such directory: .../lint`. There was no
ESLint configuration in the repository at all, and no CI workflow for a project
whose pitch is its test suite.

**Fix.** `eslint.config.mjs` in both workspaces with working `lint` scripts, and
a GitHub Actions workflow running typecheck, lint and test on push.

## D10 — Smaller findings

Recorded for completeness; none fixed during the port.

- **`currentRound` is unvalidated free text** rather than a reference to one of
  the drive's own rounds, so funnel position is not queryable and a typo is
  invisible.
- **No duplicate-drive guard.** The `{ batchId, company, role }` index exists
  and nothing queries it. Thirty students can still type the same notice thirty
  times, which the design claims to prevent.
- **`GET /api/drives` sorts by `applicationDeadline: 1`** and Mongo sorts `null`
  first, so drives with no deadline lead the list.
- **No way to fix a mistyped college or graduating year.** Registration derives
  `batchId` and discards the raw `college` and `gradYear`, so a typo lands the
  student in a batch of one with no path out except a new account. For a product
  whose core sharing mechanic is the batch key, this is the most serious
  remaining gap.
- **The 48-hour clock is not modelled.** Both the README and the write-up open
  on "an offer comes with about 48 hours to decide", and no
  `offerDeadline` / `respondBy` field exists anywhere.
- **Clashes are reported but not resolvable.** Deciding "I am sitting A,
  dropping B" requires marking B `withdrawn`, which overstates what happened.
- **No rate limiting on login**, and no email verification on registration.
