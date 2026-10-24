# RoundReady — Product Requirements

Version 1.1 · 23 October 2026 · updated after implementation

---

## 1. Context

In an Indian campus placement season a training and placement office fits
thirty to sixty companies into roughly eight weeks. The student does not choose
the calendar, does not choose which companies visit, and in most colleges does
not freely choose which offers to pursue — a placement policy decides that.

Four facts are true of every drive, and no general-purpose job tracker models
any of them:

- **Eligibility is a hard filter, not a preference.** CGPA cutoff, maximum
  active backlogs, allowed branches, 10th and 12th percentage floors, sometimes
  a gap-year rule. Fail one and the application is discarded before a human
  reads it.
- **Rounds collide.** Online assessments are scheduled by the companies, not
  coordinated between them. Two tests in the same slot is an ordinary Tuesday.
- **Accepting an offer changes what you are allowed to sit for.** Under a
  one-offer policy, accepting anything ends your season. Under a
  dream-threshold policy, accepting at 8 LPA leaves open only drives above the
  dream cutoff.
- **The cost of accepting is invisible at the moment you must decide.** Offers
  carry about 48 hours. Which specific companies close is not something a
  student can work out from a list under that pressure.

The prevailing tool is a spreadsheet. A spreadsheet records what the student
typed; it cannot evaluate a cutoff, detect an overlap, know that an accepted
offer just closed eleven other doors, or tell them what the twelfth would have
paid.

**RoundReady computes the things the spreadsheet cannot.** It is a decision
engine with a list attached, not a list with filters attached.

## 2. Users

### Primary — the student

**Aarav, final-year CSE, CGPA 7.42, zero active backlogs.**

- Sitting for roughly thirty drives between October and January.
- Tracks them across a WhatsApp group, the TPO notice board, two portals and a
  spreadsheet his senior gave him.
- Has twice prepared for a company he was not eligible for, and once missed a
  deadline he had written down.
- Succeeds when he can answer, in one look, *what is the next thing I cannot
  afford to miss, and am I actually allowed to sit for it?*

His CGPA and backlog count are fixed facts, not aspirations — which is exactly
what makes eligibility computable rather than a judgement call.

### Secondary — the batch

Thirty students in one college and graduating year face the *same* drive list
with the *same* stated criteria. Only the profile differs. This is why drives
are shared per batch while profiles, applications and verdicts are private:
one student enters a notice, thirty get a verdict, and nobody sees anyone
else's CGPA.

## 3. Goals

1. Every drive on the board carries a correct eligibility verdict, with the
   specific failing criteria named.
2. Any scheduling clash is visible before the day of the round, flagged on both
   sides, and only between drives the student could actually sit.
3. Accepting an offer immediately and automatically re-evaluates which drives
   the student may still pursue, with no manual step.
4. Before accepting, the student can see the named list of what accepting would
   close and what it would cost.
5. A student with a profile and drives can see what is due in the next seven
   days without filtering, sorting or scrolling.

## 4. Non-goals

Recorded here so the boundaries are visible decisions rather than gaps:

- Scraping company portals, the TPO site, or any job board.
- Parsing eligibility criteria out of free text, email or PDFs.
- Resume building, interview preparation content, or question banks.
- Notifications of any kind — email, push or SMS.
- A TPO-facing administrative view, drive moderation, or an approval workflow.
- Any claim of authority: the tool evaluates what the student entered, and is
  not a substitute for the official notice.

## 5. Scope

### Delivered in v1

| # | Capability |
|---|---|
| F1 | Account: register and sign in; session in an httpOnly cookie |
| F2 | Batch: a college and graduating year form a shared drive namespace |
| F3 | Profile: CGPA, active backlogs, branch, 10th %, 12th %, gap years, placement policy |
| F4 | Create, edit and delete a drive: company, role, CTC, location, application deadline |
| F5 | Eligibility criteria per drive, every field optional |
| F6 | Rounds per drive: name, type, start and end datetime |
| F7 | Eligibility verdict — eligible / not eligible with reasons / cannot determine |
| F8 | Policy gating — `one_offer` and `dream_threshold`, derived from accepted offers |
| F9 | Clash detection across drives the student can still sit, flagged on both |
| F10 | Application status tracking with an append-only history |
| F11 | Priority ranking with a visible per-component breakdown |
| F12 | Offer simulator: the named cost of accepting, computed without writing |
| F13 | Seven-day agenda on the dashboard; six-week calendar view |
| F14 | `.ics` export of rounds on drives the student can act on |
| F15 | Expired state for drives whose deadline has gone unapplied-to |
| F16 | Seed script with 18 realistic drives exercising every branch of the engine |

### Deferred (stated in README as known limitations)

Notifications and reminders · portal scraping · criteria parsing from notices ·
resume storage · more than two placement policies · drive moderation and edit
history · a calendar subscription feed · a TPO view.

## 6. User flows

### Flow A — join a batch and set up

1. Register with name, email, password, college and graduating year.
2. The college and year are normalised into a batch key
   (`demo-institute-of-technology:2027`). Everyone with the same key shares a
   drive list.
3. An empty profile is created at registration, so the rest of the app never
   branches on "profile missing".
4. The dashboard refuses to pretend: until branch and CGPA are set, it shows a
   prompt rather than a board of undecidable verdicts.

### Flow B — add a drive

1. Student opens "Add drive" with the TPO notice beside them.
2. Enters company, role, CTC in LPA, location, application deadline.
3. Enters the eligibility criteria from the notice. **Every criterion is
   optional** — a notice that does not mention 12th percentage leaves that
   field empty, and it is then not evaluated at all.
4. Adds rounds with start and end times as they are announced. A drive with no
   rounds is valid and displays "dates to be announced".
5. On save the drive appears on every batch member's board with their own
   verdict already computed.

### Flow C — read the board and act

1. The board groups drives as **Open to you**, **Cannot determine**, **Blocked
   by policy**, **Not eligible**, **Deadline passed** and **Closed**.
2. A not-eligible card names the failures: "CGPA 7.42 vs 7.5 · Active backlogs
   1 vs 0 allowed".
3. A clash badge appears on both drives involved, naming the other company and
   the overlap in minutes.
4. The top three open drives show their full priority breakdown.
5. Student marks a drive `applied`, advances it through rounds, and records the
   outcome.

### Flow D — decide on an offer

1. From a drive page or the simulator, pick the drive and the offered CTC.
2. The system builds the board twice and reports the difference: which drives
   close, which survive, the best-paid drive forgone, and the premium it
   carried over the offer in hand.
3. A verdict — low cost, worth thinking about, or expensive — with the
   reasoning spelled out, and an explicit statement that the decision is the
   student's.
4. Nothing is written. Recording the offer for real is a separate, deliberate
   action on the drive page.

## 7. Data model

```
users
  _id, email, name, passwordHash, batchId, createdAt
  unique index: { email: 1 }

profiles
  _id, userId, cgpa, activeBacklogs, branch,
  tenthPercent, twelfthPercent, gapYears,
  policy: 'none' | 'one_offer' | 'dream_threshold',
  dreamCtcLpa, updatedAt
  unique index: { userId: 1 }

drives                                  // shared across a batch
  _id, batchId, company, role, ctcLpa, location,
  applicationDeadline: Date | null,
  criteria: {
    cgpaMin, maxActiveBacklogs,
    allowedBranches: string[],          // empty array = all branches
    tenthPercentMin, twelfthPercentMin, gapYearsAllowed
  },
  rounds: [{ _id, name, type, startAt, endAt }],   // _id per round: see below
  createdBy, createdAt,
  deletedAt: Date | null                           // soft delete: see below
  index: { batchId: 1, 'rounds.startAt': 1 }
  index: { batchId: 1, company: 1, role: 1 }

applications                            // private to one student
  _id, userId, driveId, status, currentRound,
  offerCtcLpa, history: [{ status, at }], updatedAt
  unique index: { userId: 1, driveId: 1 }
```

**Design notes.**

*Nothing derived is ever stored.* There is no `isEligible` field, no
`hasClash` flag, no `blockedByPolicy` boolean, no `priorityScore`. All are
computed at read time from the profile, the drives and the applications. This
is the single most important decision in the design: a student who corrects
their CGPA, or who accepts an offer, changes the verdict on every drive at
once. Stored verdicts would require a fan-out update that can partially fail,
and a stale "eligible" badge is exactly the failure the product exists to
prevent. It is also what makes the offer simulator possible without a
transaction.

*A `null` criterion means "not specified", not zero.* `cgpaMin: null` is not
evaluated; `cgpaMin: 0` passes everyone. Conflating them would invent cutoffs
the notice never stated — and would make the `unknown` verdict impossible.

*`allowedBranches: []` means every branch.* The alternative reading — no branch
qualifies — makes the common case (a notice listing no branch restriction) the
one that breaks.

*Drives carry no student-specific fields*, which is what lets them be shared
across a batch without leaking anything. Eligibility is a function of (profile,
criteria), evaluated per reader.

*The unique index on `(userId, driveId)`* makes one application per student per
drive a database guarantee rather than a UI convention, so a double-submitted
form cannot produce two conflicting statuses for the same company.

*Rounds carry their own `_id`*, because two rounds on one drive may legitimately
share a name — "Technical Interview" twice is normal. The calendar UID and the
clash set key on that id; keying them on the name made the second round collide
with the first, and a repeated iCalendar UID is read as an update rather than a
second event (AUDIT.md D3).

*Drives are soft-deleted.* A drive is shared and other students' applications
reference it, so removing the row left every classmate holding an application
that pointed at nothing — which the policy gate then valued at zero CTC and used
to block their entire board (AUDIT.md D1). `deletedAt` is set instead and every
read filters it out.

*`history` is append-only*, and a re-save of an unchanged status does not add a
duplicate entry, so "when did I apply?" stays answerable.

## 8. Rules

### Eligibility

| ID | Rule |
|---|---|
| R1 | A criterion that is `null` on the drive is not evaluated. |
| R2 | A criterion present on the drive but missing from the profile yields **unknown** for that criterion. |
| R3 | A definite failure outranks a missing field: if any criterion fails, the verdict is **not eligible** even when another is unknown. "Not eligible" is a fact; reporting "unknown" there would be worse information, not more careful information. |
| R4 | Numeric cutoffs are inclusive: `profile.cgpa >= criteria.cgpaMin` passes. |
| R5 | `maxActiveBacklogs` and `gapYearsAllowed` are upper bounds: `value <= limit`. |
| R6 | `allowedBranches: []` matches every branch; otherwise the profile branch must be in the list, compared case-insensitively and trimmed. |
| R7 | A not-eligible verdict returns the complete list of failing criteria, in a fixed order, not the first one found. |

### Placement policy

| ID | Rule |
|---|---|
| R8 | Policy `none` never blocks anything. |
| R9 | Under `one_offer`, any application with status `offer` blocks every other drive. |
| R10 | Under `dream_threshold`, an application with status `offer` and CTC *c* blocks every drive whose `ctcLpa <= max(c, dreamCtcLpa)`. |
| R11 | Applications with status `rejected` or `withdrawn` never block anything, whatever CTC they carried. Only the current status counts, never the history. |
| R12 | The drive that produced the governing offer is never reported as blocked by it. |
| R13 | An offer with no recorded amount falls back to the drive's advertised CTC, so a half-filled record still gates correctly. |
| R14 | With more than one live offer, the highest CTC governs and the board shows a warning. |
| R27 | A student who has **accepted** a placement may only sit for a drive paying at least a multiple of it: 1.5× from a service-based employer, 2× from a product-based one. The bar is a floor and it is **inclusive** — a drive paying exactly 1.5× is open. This is deliberately the opposite boundary to R10, so the two gates are evaluated separately and never collapsed into one number. |
| R28 | Being placed is recorded explicitly and never inferred. An application reaching `offer` is an offer *received*, which R9–R10 already handle; it is not an offer *accepted*. |
| R29 | The secured-placement bar and the college policy gate both apply. A drive must clear both. The secured bar is reported first when it binds, because naming the employer the student actually accepted is more actionable. |
| R30 | The multipliers are **set by the batch's CDC officer** and stored per batch. A batch with none set is gated by the standard 1.5× and 2×, so nothing branches on "policy missing". |
| R31 | A multiplier below 1 is refused. It would let a placed student sit for something paying less than what they already hold, which inverts the rule the gate exists to enforce. Exactly 1 is allowed, and means "anything strictly better". |
| R32 | The bar the board reports at summary level and the bar each drive was judged against are **the same computation**, not two. Deriving it twice is how a headline comes to say 1.5× over verdicts that used 1.75×. |

### Roles

| ID | Rule |
|---|---|
| R33 | An account is a `student` or a `cdc_officer`. Only an officer may create, edit or withdraw a drive, or set the batch's multipliers. |
| R34 | Any member of a batch may **read** its multipliers. A student gated by a rule must be able to see where the number came from. |
| R35 | The role is set once, at registration, from a code the server holds. It is never read from a request body on any other route, so there is no field a student can send to promote themselves. |
| R36 | With no code configured, nobody can claim the role. The check fails closed. |
| R37 | Authorisation reads the role from the **database**, not from the session token. A role revoked today takes effect at the next request, not at the next login. |
| R38 | Withdrawing a drive deletes no applications. A student's record of their own season — that they applied, reached the final round, hold an offer — does not stop being true because the notice came down. |

### Scheduling

| ID | Rule |
|---|---|
| R15 | Two rounds clash iff `a.startAt < b.endAt && a.endAt > b.startAt` — half-open, so touching windows do not clash. |
| R16 | Clash detection runs only over drives whose status is `actionable` or `unknown`. A drive you are ineligible for, blocked from, or whose deadline has gone is not competing for your time, and reporting it would bury the conflicts that are real. |
| R17 | Two rounds of the same drive never clash with each other — they are sequential stages. |
| R18 | Clashes are symmetric: if A clashes with B, both cards show it. |

### Board state

| ID | Rule |
|---|---|
| R19 | Status precedence: resolved → not eligible → expired → blocked → unknown → actionable. |
| R20 | A drive is `expired` when its deadline has passed and the student has not applied (no application, or status `interested`). Having applied makes the deadline moot. |
| R21 | A drive the student is not eligible for is still shown, with its reasons, and is never silently hidden. |
| R22 | Priority is computed only for drives the student can act on, and compensation is normalised against the best drive *available to them* — not the best on the board. "Available" means the `actionable` and `unknown` groups together: taking `actionable` alone left every undecidable drive scoring full marks for pay (AUDIT.md D5). |
| R23a | A round that has started and not finished is the drive's next date, labelled live, and takes full urgency. Nothing is more urgent than a round the student is supposed to be sitting now (AUDIT.md D6). |
| R23 | All datetimes are stored in UTC and rendered in IST (UTC+05:30), with the zone named explicitly rather than inherited from the server or browser. |

### Simulation

| ID | Rule |
|---|---|
| R24 | The simulator writes nothing. It builds the board twice in memory and diffs the policy gate. |
| R25 | Only drives that were available before the hypothesis count as a cost. Ineligible and expired drives are excluded — both would inflate the number and neither is something the student could have had. |
| R26 | Under `one_offer` the internal floor is infinite; the API reports `null`, because `JSON.stringify(Infinity)` is `null` and a value that changes meaning crossing the wire is a bug waiting to happen. |

## 9. Edge cases and error states

This doubles as the test plan. All 427 tests in `backend/tests` map to these.

**Eligibility boundaries**

- CGPA exactly equal to `cgpaMin` → eligible (R4).
- CGPA 7.49 against a 7.5 cutoff → not eligible, reason names both numbers.
- `activeBacklogs: 0` against `maxActiveBacklogs: 0` → eligible.
- Drive with `criteria` entirely null → eligible for everyone.
- `allowedBranches: []` → eligible regardless of branch, and the branch check
  does not appear in the criteria list at all.
- Branch comparison is case-insensitive and trims: `cse `, `CSE`, `Cse` match.
- Profile branch blank against a stated list → **unknown**, not a failure.
- Three criteria failing → all three reasons, in a stable order.
- Profile `twelfthPercent: null`, drive `twelfthPercentMin: 60` → **unknown**.
- Profile `twelfthPercent: null`, drive `twelfthPercentMin: null` → eligible.
- `cgpaMin: 0` with a null profile CGPA → unknown; `cgpaMin: null` → eligible.
  A zero cutoff is a real cutoff.
- CGPA 6.0 against a 8.0 cutoff *and* a missing 12th percentage → **not
  eligible** (R3), with one failure and one unknown both reported.

**Placement policy**

- Policy `none` with an accepted 8 LPA offer → nothing blocked.
- Policy `one_offer` with an accepted offer → every other drive blocked; the
  offering drive is not shown as blocked.
- `dream_threshold`, dream 12, accepted 8 → 10 LPA blocked, 14 LPA open, a
  drive at exactly 12 blocked.
- `dream_threshold`, dream 12, accepted 15 → only drives above 15 remain open.
- An application that reached `offer` and was then `withdrawn` → blocks nothing.
- A `rejected` application carrying 32 LPA → blocks nothing.
- Two live offers → the highest governs, with a warning on the board.
- An application pointing at a deleted drive → valued at 0, not a crash.

**Clash detection**

- 10:00–11:00 and 11:00–12:00 → no clash.
- 10:00–11:00 and 10:59–12:00 → clash, both drives flagged, 1 minute reported.
- A round fully contained in another → clash. Identical windows → clash.
- Three mutually overlapping rounds → each card names the other two.
- Two rounds of the same drive overlapping → not a clash.
- A clash with a drive the student is rejected from, ineligible for, blocked
  from, or whose deadline has passed → not reported.
- A clash between a decided drive and an undecidable one → **is** reported,
  because "cannot determine" means the student may well be eligible.
- A drive with an empty `rounds` array → "dates to be announced", no error.
- 200 non-overlapping rounds → no clashes, and the sweep stops early rather
  than comparing every pair.

**Priority**

- The best-paid available drive scores the full compensation weight; half the
  CTC scores half the weight; more than the maximum does not exceed it.
- Urgency is full within 24 hours, zero at and beyond the 21-day horizon, half
  at half the horizon, and zero for a date that has passed.
- Progress rewards each funnel stage more than the last.
- A clash with a better-paid drive costs the full penalty; with a worse- or
  equally-paid one, half — and the wording distinguishes the three cases.
- The total equals the sum of its components, reaches 100 for the best case,
  and never goes below zero.

**Simulation**

- Under `one_offer`, accepting the cheapest drive closes every other live
  eligible drive and names the best of them.
- Under `dream_threshold`, accepting at 11 with a 12 cutoff closes everything
  at or below 12 and leaves everything above it open.
- Accepting the best drive on the board is always safe.
- An ineligible or expired drive is never counted as a cost.
- The real application list is not mutated, and the board before and after a
  simulation is identical.
- Simulating a drive that does not exist throws rather than returning nonsense.

**Dates and time zones**

- A round at 23:30 IST renders on the correct IST date.
- A UTC instant at 19:00 renders as 00:30 IST the following day.
- `datetime-local` values round-trip to UTC and back without drift across an
  IST midnight, independent of the browser's own zone.
- "Next 7 days" includes an item exactly 7 days out and excludes one a minute
  later.

**Input validation**

- CGPA above 10 or below 0, negative backlogs, a fractional backlog count, a
  negative CTC, an empty company name → rejected inline with a field message.
- An empty numeric form field becomes `null`, never `0`.
- `dream_threshold` with no dream CTC → rejected.
- A round ending at or before its start → rejected, so a zero-width event that
  silently never clashes cannot be stored.
- Recording an `offer` with no CTC → rejected.
- A malformed JSON body → 422 with a readable message, even when the database
  is unreachable: validation runs before any database access.

**Authorisation and error states**

- An unknown drive id, or a valid id from another batch → 404, never 403.
- Any API route without a session → 401 with one message.
- Login failure is one message for both "no such email" and "wrong password".
- A duplicate email or a duplicate application → 409, from the unique index.
- A missing `MONGODB_URI` → 503 with a readable sentence.
- Any unhandled error → a generic 500; stack traces are logged, never returned.
- Deleting a drive removes the student's application with it.

## 10. Acceptance criteria

v1 is done when all of the following hold on the deployed URL.

1. A student can go from registration to a populated board — profile, drives,
   applications — entirely through the UI.
2. Every drive displays one of exactly six states, and a not-eligible verdict
   names its failing criteria.
3. Changing the CGPA in the profile visibly changes the verdicts on the board
   with no other action.
4. Recording an offer under `one_offer` blocks the remaining drives
   immediately.
5. Two rounds overlapping by 30 minutes are flagged on both cards; two rounds
   that merely touch are not.
6. The simulator names the companies that would close and the premium forgone,
   and leaves the board unchanged.
7. `npm test` is green and the engine is above 95% branch coverage.
8. No error state renders a stack trace or a blank page.
9. The seed script produces a board legible to a first-time viewer in under
   thirty seconds.

**Status at v1.1: all nine met.** 427 tests passing; 99% statement and 95%
branch coverage of the engine, the preparation layer, schemas and calendar
export.

## 11. If there were more time

In priority order:

**Reminders** at T-2 days on an application deadline, and the morning of a
round. The board already knows; nothing tells you.

**A calendar subscription feed** rather than a download, done properly with a
rotatable per-user token rather than a secret in a URL.

**More placement policies.** Tiered dream companies, limits on the number of
offers rather than one, blacklisting after a no-show.

**Drive provenance.** Who added this drive, when, and what changed — so a batch
can trust a shared list it did not write.

**Preparation load.** Given what the student is eligible for in the next two
weeks, which topics recur across those companies' known patterns. This is where
the product stops being a tracker and starts allocating the student's time, and
it is only possible because eligibility is already computed.

## 12. Open questions

- Should a drive the student is ineligible for be collapsed by default? Showing
  everything is honest but noisy at forty drives; hiding is the failure mode of
  the spreadsheet. v1 shows everything, grouped.
- Under `dream_threshold`, should the comparison use CTC or base pay? Colleges
  differ, and CTC is what the notice states, so v1 uses CTC and says so.
- Is "active backlogs" the right single number? Some notices distinguish
  current from historical backlogs. v1 models the one number the student
  actually knows, and treats a drive asking something finer as a case for the
  **unknown** verdict rather than inventing a field.
- Should a batch's drive list be moderated? Anyone can currently edit any drive
  their batch shares. For classmates this is correct; past some size it is not,
  and the answer is probably provenance rather than permissions.
