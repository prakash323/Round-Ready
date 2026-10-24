# RoundReady

**Campus placement season, with the eligibility maths already done.**

Live: _add the deployed client URL_ · API: _add the deployed API URL_
Repository: _add the GitHub URL_

---

## The problem

During placement season a final-year student is tracking twenty to forty
company drives across a WhatsApp group, the TPO's notice board, four portals
and a spreadsheet. The spreadsheet can tell them what they wrote down. It
cannot tell them the four things that actually decide their season:

1. **Am I even eligible?** Every drive has hard cutoffs — CGPA, active
   backlogs, branch, 10th and 12th percentages. Students routinely prepare for
   a company they were never eligible for, and miss one they were.
2. **Does this clash?** Two companies scheduling an online assessment in the
   same two-hour slot is normal, not rare. You find out the morning of.
3. **Am I allowed to sit for this?** Most colleges run a one-offer or
   dream-threshold policy. Accepting an 8 LPA offer can silently remove you
   from every drive below the dream cutoff — a rule students discover after
   they have spent a week preparing.
4. **What does saying yes cost me?** An offer comes with about 48 hours to
   decide. The question nobody can answer from a spreadsheet is which specific
   companies, still live and still open to you, close the moment you accept.

The honest state of the art is a spreadsheet that answers none of these, and a
batch-mate who says "I think you're eligible, no?"

## Why not an existing job tracker

Huntr, Teal, Simplify and Notion templates are built for self-directed job
hunting in a market where *you* choose when to apply. Campus placement inverts
every assumption: the calendar is imposed, eligibility is a hard filter rather
than a preference, drives overlap because the TPO is fitting forty companies
into six weeks, and your college's placement policy constrains which offers you
may even pursue. None of those tools model eligibility criteria, scheduling
conflicts or placement policy, because outside campus recruitment those
concepts do not exist.

RoundReady is narrow on purpose: it does the calculations a general tracker
cannot.

## Who it is for

**A final-year engineering student in an Indian campus placement season.** Has
a fixed CGPA, a known backlog count and a branch. Is sitting for between twenty
and forty drives over roughly eight weeks. Does not need another to-do list —
needs to know what is worth their next four hours.

**And the CDC officer who publishes to them.** Two roles, with a deliberate
asymmetry between them.

| | Student | CDC officer |
|---|---|---|
| See the batch's drives | ✓ | ✓ |
| Add, edit or withdraw a drive | | ✓ |
| Set the batch's higher-offer multipliers | | ✓ |
| Read those multipliers | ✓ | ✓ |
| Record their own applications and offers | ✓ | ✓ |
| Fill in their own profile and preparation | ✓ | ✓ |

A drive is a notice published to three hundred people, and its eligibility
criteria decide who may sit for it — so a student editing the CGPA cutoff on
one changes what every classmate sees. The multipliers are the same kind of
fact: a statement of college policy rather than anything true of one student.
Both are therefore the officer's, and everything about a student's own season
stays the student's.

Students can *read* the policy that gates them. Hiding it would leave someone
staring at "you need 14 LPA" with no way to see where 14 came from.

**Becoming an officer** needs a code the server holds (`CDC_OFFICER_CODE`),
entered at registration. It fails closed: with no code configured, nobody can
claim the role at all. The comparison is constant-time, wrong attempts are
rate-limited per address, and the role is never read from a request body on
any other route — so there is no field to send to promote yourself.

## What it does

**Set your profile once.** CGPA, active backlogs, branch, 10th and 12th
percentages, gap years, and your college's placement policy.

**Add drives as the TPO announces them.** Company, role, CTC, the eligibility
criteria from the notice, and the round schedule. Drives are shared with your
batch — everyone in your college and graduating year sees the same list, so
thirty students do not type the same thirty notices.

**Open the board.** Every drive is labelled **Eligible**, **Not eligible** with
the specific criteria you fail, **Cannot determine**, **Blocked by policy** or
**Deadline passed**. Clashing rounds are flagged on both sides. Drives you can
act on are ranked, with the arithmetic shown.

**Run the simulator before you accept anything.** Pick a drive, enter the offer,
and see exactly which companies would close, which would survive, and how much
the best forgone drive pays over the offer in hand.

## The five calculations

Everything below is derived at read time and never stored, so a change to your
profile or an accepted offer re-evaluates the whole board at once — nothing can
go stale.

**Eligibility** evaluates each criterion independently and returns the reasons
for failure, not a boolean. "CGPA 7.42 is below the 7.5 cutoff" is actionable;
"ineligible" is not. A criterion the profile cannot answer returns **unknown**
rather than quietly passing — a student who has not entered their 12th
percentage is not eligible for a drive requiring 60%, their eligibility is
undecided, and guessing in their favour costs them a drive.

**Secured-placement gating** handles the student who is already placed. Accepting
a service-based offer at 6 LPA sets their bar at 1.5× — 9 LPA — and a
product-based offer at 10 LPA sets it at 2×, or 20 LPA. Drives below the bar
close, and each one says which employer, which multiplier and which arithmetic
closed it. The bar is inclusive, so a drive paying exactly the threshold stays
open, and the multipliers are configurable. Being placed is something the
student states: an offer *received* is not an offer *accepted*, and inferring
one from the other would close a whole board the moment a company called.

**Policy gating** models the two rules colleges actually use. Under
`one_offer`, accepting any offer blocks every remaining drive. Under
`dream_threshold`, accepting at 8 LPA with a 12 LPA cutoff leaves open only
drives above 12. Withdrawn and rejected applications never block anything,
because only an application's current status counts.

**Clash detection** compares round windows with a half-open interval —
`a.start < b.end && a.end > b.start` — so a test from 10:00 to 11:00 does not
clash with one starting at 11:00. It runs only over drives you could actually
sit: a company whose CGPA cutoff you miss is not competing for your Tuesday
morning.

**Priority ranking** scores each open drive out of 100 from compensation
(relative to the best drive available *to you*), urgency, how far through the
funnel you already are, and a penalty for scheduling conflicts. The components
are always shown, because a student cannot act on "87".

**Offer simulation** builds the board twice — once as things stand, once with a
hypothetical accepted offer — and diffs the policy gate. Nothing is written: no
transaction, no rollback, no chance of a hypothetical leaking into the real
record. That is only possible because every verdict is derived rather than
stored.

## Architecture

A MERN monorepo: an Express API and a React client, each with its own
`package.json`.

```
backend/
  server.ts                 thin entry — loads env, connects, listens
  src/server.ts             builds and exports the Express app (no listen)
  src/config/               env.ts (validated, fails loudly) · db.ts (mongoose)
  src/models/               User · Profile · Drive · Application
                            JobDescription · SkillProfile · SavedResource
                            BatchPolicy (one per batch, the officer's)
  src/middleware/           requireAuth · validate · errorHandler
  src/controllers/          one per resource
  src/routes/               mounted under /api
  src/lib/engine/           pure functions — no DB, no React, no ambient clock
    eligibility.ts          criteria → verdict + reasons
    policy.ts               offers + policy → open or blocked
    clash.ts                rounds → overlapping pairs
    priority.ts             → an explainable score out of 100
    board.ts                composes the above into the view a student reads
    simulate.ts             the board, rebuilt against a hypothesis
  src/lib/jd/               the preparation layer — pure, under the same rules
    taxonomy.ts             the skill vocabulary, with aliases and implications
    analyze.ts              a job description → the skills it actually names
    gap.ts                  those skills against your ratings → what is missing
    plan.ts                 gaps + hours a day → a dated, rebuildable plan
    resources.ts            curated guidance per skill — no invented links
  src/lib/                  schemas · repo · session · ics · calendar · format
  tests/                    427 tests

frontend/
  src/pages/                one per route
  src/components/           the board, the forms, the simulator
  src/lib/                  api.ts (one fetch wrapper) · format.ts · types.ts
```

The engine takes plain objects and returns plain objects, and the current time
is always passed in rather than read from ambient scope. That one constraint is
what makes the suite fast, deterministic, and cheap enough to write
exhaustively — and it is why the tests are concentrated there rather than spread
thinly over the UI.

**The engine was ported from the previous Next.js version unchanged.** Its
twelve library files imported only relative siblings and `zod`, so moving them
needed no edits at all; git recorded all twenty-three moved files as
byte-identical renames. The only subsequent edits are the four numbered defect
fixes below, each with a regression test.

### The data model stores nothing derived

There is no `isEligible` field, no `hasClash` flag, no `blockedByPolicy`
boolean, no cached `priorityScore`. Every verdict is recomputed from the
profile, the drives and the applications on each read. A stored verdict needs a
fan-out update that can partially fail, and a stale "eligible" badge is exactly
the failure this tool exists to prevent. It is also what makes the offer
simulator possible without a transaction.

Two indexes are correctness guarantees rather than performance tuning:

| Index | Guarantees |
|---|---|
| `users { email }` unique | one account per email, under simultaneous sign-ups |
| `applications { userId, driveId }` unique | one application per student per drive, so a double-submitted form cannot leave two conflicting statuses |

Rounds are a Mongoose subdocument array, so each round carries its own `_id`.
The calendar UID and the clash set key on that id rather than the round's name —
see D3 below.

## Preparing for a role

Paste a job description and the analyser pulls out what it recognises:
required and preferred skills separated by the headings the notice uses,
the experience it states, and the assessment rounds it actually names.

Two rules govern it, and both are about not misleading the reader.

**It never invents.** Every extracted skill carries the exact line it came
from, so the analysis can be checked against the notice rather than trusted.
Nothing about interview rounds or assessment formats is produced unless the
text says it — a description that is silent gets “nothing has been assumed
about them”, not a plausible guess.

**It separates what the notice said from what it concluded.** A skill found
verbatim is *explicit*; one reached through the taxonomy (React, therefore
JavaScript) is *inferred* and carries its reasoning. The two are never merged,
because a plan built on a guess should look like one.

The vocabulary is a curated list rather than “any capitalised word”: a notice
saying “work with the Payments team in Bengaluru” must not produce *Payments*
and *Bengaluru* as things to study. Precision beats recall here, because every
false skill is an evening a student wastes.

The analysis is a draft. Every row can be reclassified, removed or added to,
and nothing is saved until the student says so — `POST /api/jd/analyse` is
read-only, like `/api/simulate`.

### Skill gaps

Rate what you can do and the saved analysis turns into a gap list: what the
role asks for, against what you say you have, ordered so required work always
outranks preferred work — a preferred skill you have never touched never
jumps above a required one you are halfway through.

The rule that shapes the module is the one the eligibility engine already
lives by: **an unrated skill is unknown, never zero.** A student who has not
told us about Kubernetes has an undecided gap, not a missing skill, and
reporting it as missing would send them to study something they may already
know.

Target levels are the tool’s suggestion and say so — no job description names
the proficiency it wants on a four-point scale, so claiming one would be
inventing hiring criteria. Proficiency is self-assessment and is labelled as
such; the type admits an assessment-derived source so practice results can
never later be merged silently into a guess, and the API refuses a request
that tries to claim one.

Nothing reports readiness. Clearing the list means the described skills are
covered, which is not the same as passing an interview, and the wording never
pretends otherwise.

### The study plan

The ranked gaps, your hours a day and a date become a schedule. It is
**derived on every read, never stored** — the same decision the placement
board is built on. Only three things persist: hours per day, the deadline,
and which task ids you have ticked.

That is what makes "do not discard completed work when the plan regenerates"
true by construction rather than by care: there is no regeneration step.
Rate a skill, move the deadline, lose an evening — the schedule reshapes and
the ticks survive, because they were never part of the thing being rebuilt.
Task ids are derived from the skill and block number so they do not move
between builds.

When the work does not fit the time, it says so. Nothing is crammed into the
last day: what did not fit is listed with how many hours short it is, and
whether it was required. A plan you cannot finish is worse than one that
tells you what it left out.

An unrated skill gets a short slot to work out where you stand, not a study
block — there is no honest way to size work for a gap nobody has measured.
Durations are estimates and are labelled as such; what the planner can
honestly promise is consistency, spending more on a required gap than a
preferred one.

## The API

Everything is mounted under `/api`.

```
POST   /api/auth/register    POST /api/auth/login     POST /api/auth/logout
GET    /api/auth/me
GET    /api/profile          PUT  /api/profile
GET    /api/policy           PUT  /api/policy             ← PUT is officer-only
GET    /api/drives           POST /api/drives             ← officer-only
GET    /api/drives/:id       PATCH /api/drives/:id        ← officer-only
                             DELETE /api/drives/:id       ← officer-only
GET    /api/applications     PUT  /api/applications   DELETE /api/applications
GET    /api/board            GET  /api/board/agenda
POST   /api/jd/analyse       GET  /api/jd                 PUT    /api/jd
GET    /api/jd/:id           PATCH /api/jd/:id            DELETE /api/jd/:id
GET    /api/jd/for-drive/:driveId   GET /api/jd/:id/gaps
GET    /api/skills           PUT  /api/skills
GET    /api/jd/:id/plan      PATCH /api/jd/:id/plan
POST   /api/simulate         GET  /api/calendar
GET    /api/health
```

- **Validation runs before any database access**, so a malformed body is a 422
  whether or not Mongo is reachable. A misconfigured deployment cannot mask a
  client bug as a 503.
- **One error shape:** `{ error: { message, fields? } }`. `fields` appears only
  on validation failures. Stack traces are logged, never returned.
- A duplicate key (Mongo 11000) is a **409**, not a 500 — an index doing its job.
- An unknown drive id, or a valid id belonging to another batch, is **404, never
  403**. A 403 confirms the id exists and is worth guessing at.
- Login failure is **one message** for both "no such email" and "wrong
  password", so the form is not a tool for discovering who has an account.
- The officer-only routes answer **401 before 403**. An anonymous caller learns
  only that they are not signed in; a signed-in student is told plainly that
  the route is an officer's, because nothing about it is secret — they simply
  are not the one who may use it.
- `requireOfficer` reads the role **from the database, not the token**. The
  token is signed, so this is not about forgery: a session lasts seven days,
  and someone who leaves the role should lose the ability to publish at their
  next request rather than at their next login.
- `POST /api/simulate` is a **read-only POST**: it builds the board twice in
  memory and diffs the policy gate. Nothing is written.

### Cross-origin auth

The session is a signed JWT in an httpOnly cookie. Splitting the app across two
origins is the one thing the single-deployable version never had to solve:

| | development | production |
|---|---|---|
| `sameSite` | `lax` | `none` |
| `secure` | `false` | `true` |
| why | the Vite proxy makes it same-origin | different sites, and `None` requires `Secure` |

`SameSite=None` requires `Secure`, which requires HTTPS — so **both
deployments must be on HTTPS in production**. `loadEnv` refuses to boot if
`NODE_ENV=production` and `FRONTEND_URL` is not `https://`, or is `*` (CORS
forbids a wildcard origin with credentials), because both fail silently at
request time instead. Every client request sends `credentials: "include"`;
without it the cookie is never attached and everything 401s.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| API | Express 4 + Node | Express 5's `path-to-regexp` v8 changed wildcard syntax; not worth the risk here |
| Database | MongoDB Atlas (M0) + Mongoose | Drives carry nested, variable-shape criteria and round arrays; subdocument `_id`s give rounds a stable identity |
| Client | React 19 + Vite + React Router | |
| Language | TypeScript, strict, on both sides | The three-state eligibility verdict is a type, not a convention. Converting the engine to plain JavaScript would have meant hand-porting it, which is where every subtle bug would come from |
| Validation | Zod 3 | One schema module shared by every write route. Pinned to v3: the engine's schema file is ported unchanged and v4 is breaking |
| Auth | `jose` JWT in an httpOnly cookie, bcrypt | No third-party dependency for a single-purpose tool |
| Styling | Tailwind CSS | |
| Tests | Vitest | The engine is pure functions over plain objects |
| Hosting | Render (API) + Vercel or Netlify (client) | Both on HTTPS, which the cross-origin session cookie requires |

## Running locally

Two terminals. The backend first.

```bash
git clone <repo-url>
cd roundready

# --- terminal 1: the API ---
cd backend
npm install
cp .env.example .env          # fill in MONGODB_URI and AUTH_SECRET
npm run seed                  # 18 realistic drives, so the board is not empty
npm run dev                   # http://localhost:5001

# --- terminal 2: the client ---
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

The client needs no `.env` in development: the Vite dev server proxies `/api`
to `http://localhost:5001`, which keeps the browser on one origin so the
session cookie is attached without `SameSite=None` or a certificate.

**If something else already owns port 5001**, change both ends or the dev
server will proxy the entire API to that other process — and the symptom is a
401 on login, which points nowhere near the proxy:

```bash
# backend/.env
PORT="5099"

# frontend/.env.local
VITE_API_PROXY="http://localhost:5099"
```

`curl http://localhost:5173/api/health` should return exactly `{"ok":true}`. If
it returns anything else, you are talking to a different application.

Generate the auth secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Environment variables

No secrets are committed to this repository. `.env` and `.env*.local` are
gitignored in both workspaces, and `.env.example` is committed in both.

**`backend/.env`**

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string. Required |
| `MONGODB_DB` | Database name (optional, defaults to `roundready`) |
| `AUTH_SECRET` | Random 32-byte string for session signing. Required, min 32 chars |
| `PORT` | API port (optional, defaults to `5001`) |
| `FRONTEND_URL` | The exact origin allowed to send credentialed requests. Must be `https://` in production |
| `NODE_ENV` | Decides the cookie's `SameSite`/`Secure` pair |
| `CDC_OFFICER_CODE` | Grants the officer role at registration. Optional, min 12 chars. **Unset means nobody can claim the role** |

**`frontend/.env.local`** — only needed once deployed.

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | The API origin. Leave empty in development so the proxy handles it |

The API refuses to start rather than misbehave quietly:

```
$ node dist/server.js
Cannot start RoundReady:
  - MONGODB_URI is not set. Copy backend/.env.example to backend/.env.
  - AUTH_SECRET must be set to at least 32 characters. Generate one with: …
```

A short `CDC_OFFICER_CODE` is refused the same way. It is the whole of the
authorisation to publish to a batch, so a guessable one is worse than none.

### The seeded demo

`npm run seed` creates a demo batch and prints its login. The data is chosen so
every branch of the engine is visible within ten seconds: a 0.08-CGPA near
miss, a branch exclusion, one verdict that cannot be determined, two genuine
clashes, one pair of rounds that merely touch and is correctly *not* flagged, a
drive whose deadline has gone, and drives on both sides of the dream line so
the simulator has something to say.

It seeds **two accounts**, because the app now has two kinds of person in it: a
student, and the CDC officer whose name appears on the drives. Signing in as
each is the quickest way to see the split — the officer has *Add a drive* and
*Batch policy*; the student has neither, and the same drive page shows an
*Edit* button to one and not the other.

The officer is seeded directly rather than through the registration code. The
script already has database access, so making it ask for a secret it could
simply write would be theatre; the code gates the *public* route, which is the
one an attacker can reach.

The seeded credentials are demo data, not a secret, and they are printed by the
seed script rather than written into the repository. Override them with
`SEED_EMAIL`, `SEED_PASSWORD`, `SEED_OFFICER_EMAIL` and
`SEED_OFFICER_PASSWORD`.

## Deploying

Two services. [`render.yaml`](./render.yaml) is a blueprint for both, or deploy
them separately — the API on Render, the client on Vercel or Netlify.

**Both must be on HTTPS.** This is not a preference. The session cookie is
`SameSite=None` in production, browsers accept that only with `Secure`, and
`Secure` requires HTTPS. The API refuses to boot otherwise rather than serve a
login that silently never persists.

| Service | Root | Build | Start |
|---|---|---|---|
| API | `backend/` | `npm ci && npm run build` | `npm start` |
| Client | `frontend/` | `npm ci && npm run build` | serve `dist/` |

Set these in the host's dashboard, never in a committed file:

| Service | Variable | Value |
|---|---|---|
| API | `NODE_ENV` | `production` |
| API | `MONGODB_URI` | the Atlas connection string |
| API | `AUTH_SECRET` | a fresh 32-byte random string |
| API | `FRONTEND_URL` | the **exact** client origin, e.g. `https://roundready-web.onrender.com` |
| Client | `VITE_API_BASE_URL` | the API origin, e.g. `https://roundready-api.onrender.com` |

`FRONTEND_URL` cannot be `*`: CORS forbids a wildcard origin with credentials,
and the session cookie is the only way the API identifies anybody. Render sets
`PORT` itself. On Atlas, allow the API's egress IPs (or `0.0.0.0/0` on the free
tier) under Network Access, or every request times out looking like a bug in
the app.

### The client needs a deep-link rewrite

React Router resolves `/drives/:id` in the browser, so the host must serve
`index.html` for any path that is not a real file. Without it, refreshing a
drive page — or opening a link someone pasted into the batch group — is a 404
from the CDN, which looks exactly like the drive having been deleted. Config is
committed for all three hosts:

- Vercel — [`frontend/vercel.json`](./frontend/vercel.json)
- Netlify and Render static — [`frontend/public/_redirects`](./frontend/public/_redirects), copied into `dist/` by the build
- Render blueprint — the `rewrite` route in [`render.yaml`](./render.yaml)

### After deploying

```bash
curl https://<api-host>/api/health          # {"ok":true}
```

Then register, and confirm the session survives a refresh. If it does not, the
cookie is being rejected: check that both origins are HTTPS and that
`FRONTEND_URL` matches the client origin exactly, scheme included.

## Testing

```bash
cd backend
npm test
npm run test:coverage
npm run typecheck            # src and tests
npm run lint
```

**427 tests, 99% statement and 95% branch coverage** of the engine, the preparation
layer, the schema layer, calendar export and IST formatting. The cases that matter:

- CGPA exactly at the cutoff is **eligible** — the comparison is `>=`, not `>`.
- A `null` criterion is not evaluated; a `0` criterion is a real cutoff. An
  empty allowed-branches list means *all* branches, not *none*.
- A profile missing its 12th percentage returns **unknown** — but a definite
  failure elsewhere still outranks a missing field, because "not eligible" is a
  fact and "unknown" would be worse information rather than more careful
  information.
- Rounds that touch — 10:00–11:00 and 11:00–12:00 — do **not** clash. Rounds
  overlapping by one minute do, and both sides are flagged.
- Under `dream_threshold` with an accepted 8 LPA offer and a 12 LPA cutoff: a
  10 LPA drive is blocked, a 14 LPA drive is not, and a drive at exactly 12 is
  blocked. An accepted 15 LPA offer raises the line to 15.
- A withdrawn or rejected application never blocks another drive, whatever CTC
  it carried.
- The simulator never counts an ineligible or expired drive as a cost, and
  never mutates the real board.
- All times are stored in UTC and rendered in IST; a round at 23:30 IST does
  not drift to the previous day, and the datetime inputs round-trip without
  drift across an IST midnight regardless of the browser's own time zone.
- The `.ics` export folds lines at 75 **octets** without splitting a multi-byte
  character, and escapes commas, semicolons and newlines.
- The seeded demo data is itself asserted against the engine, so the demo
  cannot quietly drift away from what the video claims about it.
- The HTTP error contract is exercised over a real socket: a missing session is
  401, a malformed body is 422 with per-field messages, unparseable JSON is 400,
  an unknown endpoint is 404 in the same JSON shape, and no error body carries a
  stack trace. None of those paths touch Mongo, which is the point — the
  ordering they assert is what keeps a misconfigured deployment from reporting a
  client bug as a server fault.

CI runs typecheck, lint, test and build for both workspaces on every push
(`.github/workflows/ci.yml`).

## Defects fixed during the port

Full write-ups in [`AUDIT.md`](./AUDIT.md). Each has a regression test that
failed before the fix.

| ID | Defect | Fix |
|---|---|---|
| D1 | Deleting a shared drive left every classmate holding an application pointing at nothing, which the policy gate valued at 0 LPA and used to block their whole board — blamed on a company with no card on it | Soft delete (`deletedAt`), filtered at read time; `activeOffers` drops an offer it cannot value and the board says so instead of blocking silently |
| D2 | One click destroyed a record thirty classmates depended on | Typed confirmation naming the company, and `createdBy` shown on the card |
| D3 | Two rounds sharing a name emitted the same iCalendar UID, so one interview vanished from the student's calendar | Rounds carry their own `_id`; the UID and clash set key on it, never on the name |
| D4 | `z.coerce.date()` accepted `null` as 1 Jan 1970, creating a permanently expired ghost round | The schema requires a real non-empty string or `Date`; the form surfaces an unreadable datetime as a field error |
| D5 | With nothing actionable, every undecidable drive scored full marks for pay, leaving that group in no order at all | Compensation is normalised against `actionable ∪ unknown` |
| D6 | A round running *right now* reported "nothing scheduled" and scored zero urgency | A round whose end is still future is the current item, labelled live, at full urgency |
| D7 | The policy gate was rebuilt once per drive — a Map of every drive and a rescan of every application, for an answer identical across the whole board | Resolved once; `buildBoard` is O(drives). Guarded by an equivalence test, since there was no behavioural symptom to fail first |
| D8 | No focus ring, no `aria-live`, no loading states | `:focus-visible` ring, `aria-live` on form status, a skeleton on every page that fetches |
| D9 | `npm run lint` was `next lint`, removed in Next 16, and there was no ESLint config or CI at all | Flat config in both workspaces, plus the CI workflow above |

D10 (smaller findings, including the unmodelled 48-hour offer clock and the
inability to correct a mistyped college) is open and documented.

## Known limitations

Deliberate scope decisions, not oversights.

- **Drives are entered manually.** No scraping of portals and no parsing of job
  posts — both are unreliable and would have consumed the time that went into
  the engine.
- **No notifications.** The board surfaces what is due; nothing emails you.
- **Only two placement policies are modelled** — `one_offer` and
  `dream_threshold`. Colleges have stranger rules than these two.
- **No edit history on drives.** Only a CDC officer can add, change or withdraw
  one, and the board records who added it — but a criterion changed after
  students have read it leaves no trace of what it used to say. Withdrawing a
  drive still asks for the company name to be typed first, which is a speed
  bump against a misclick rather than an audit trail.
- **The officer-code rate limiter is in memory.** It holds for a single
  process; a multi-instance deployment would need a shared store. Ordinary
  logins are not rate-limited at all yet.
- **One batch, one policy.** The higher-offer multipliers apply to a whole
  college-and-year. A college running different rules for different branches
  would need the policy keyed more finely than `batchId`.
- **A soft-deleted drive still leaves one edge.** An offer carrying its own
  recorded CTC keeps gating correctly after its drive is removed, which is right
  — the student does hold that offer — but there is then no card to clear it
  from. The board labels it "a drive no longer on your board" in the reason
  rather than hiding it, which is visible but not yet actionable from the UI.
- **The calendar is a download, not a subscription feed.** A feed would need a
  bearer token in a URL that then lives in a calendar client's config and in
  server logs indefinitely.
- **Eligibility reflects what you typed.** If the TPO notice says 7.0 and you
  enter 7.5, the tool is confidently wrong. It checks arithmetic, not sources —
  which is why every page says to check the official notice.

## Project documents

- [`PRD.md`](./PRD.md) — users, scope, flows, data model, numbered rules, test plan
- [`AUDIT.md`](./AUDIT.md) — the defect audit, D1 to D10, with reproductions
- [`WRITEUP.md`](./WRITEUP.md) — the 400-word product write-up

## Attribution

Built with Express, MongoDB/Mongoose, React, Vite, Tailwind CSS, Zod and
Vitest. No starter template.
