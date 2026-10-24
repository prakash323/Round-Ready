# RoundReady — product write-up

**The problem.** In an Indian campus placement season the TPO fits forty
companies into eight weeks. A student tracks them across a WhatsApp group, a
notice board, two portals and a spreadsheet — which answers none of the four
questions that decide their season. Am I eligible? Does this clash? Does my
college's placement policy let me sit for it at all? And when an offer arrives
with 48 hours to decide, what does saying yes close?

**Why not an existing tracker.** Huntr, Teal and Notion templates are built for
self-directed job hunting, where you choose when to apply. Campus placement
inverts every assumption: the calendar is imposed, eligibility is a hard filter,
rounds collide because nobody coordinates them, and accepting an offer can
silently remove you from eleven other drives. None of those tools model any of
that, because outside campus recruitment those concepts do not exist.

**What I built.** A decision engine with a list attached. Enter your CGPA,
backlogs and branch once, add drives as the TPO announces them, and the board
labels each one eligible, not eligible with the cutoffs you miss, blocked by
policy, or undecidable — then ranks what is open to you and flags every
scheduling conflict on both sides. Drives are shared across your college and
graduating year, so thirty students do not type the same thirty notices, while
profiles and verdicts stay private.

**The decision I am proudest of.** Nothing derived is stored — no `isEligible`
column, no clash flag, no cached score. Every verdict is recomputed from the
profile, the drives and the applications on each read. That makes a stale
"eligible" badge structurally impossible — and it is what let me build the
offer simulator, which builds the board twice — once with a hypothetical
accepted offer — and names the companies that would close and the premium the
best of them carried. No transaction, no rollback, no chance of a
hypothetical touching real data.

**The detail that matters most.** Clash detection uses a half-open interval, so
a 10:00–11:00 test does not conflict with one starting at 11:00. Closed
intervals would flag every back-to-back slot, and a tool that cries wolf gets
ignored within a day.

**Two roles, one asymmetry.** A drive is a notice published to three hundred
people, and its eligibility criteria decide who may sit for it — so publishing
belongs to the CDC officer and everything about a student's own season stays
the student's. The higher-offer multipliers are the officer's for the same
reason: 1.5× for a service-based employer, 2× for a product-based one is a
statement of college policy, not a fact about any one student. Students can
read it, because being told "you need 14 LPA" without being able to see where
14 came from is not an explanation.

Building that surfaced a defect worth the whole exercise. The board's headline
figure was deriving the bar a *second* time, in the controller, without the
batch's own multipliers — so a student on a batch set to 1.75× would have read
"1.5× — 12 LPA" at the top of the page over drives blocked at 14 LPA, with
both numbers looking equally authoritative. The fix was to stop computing it
twice and read it off the board that produced the verdicts.

**Where I stopped.** No scraping, no notifications, two placement policies. The
time went into the engine instead: 427 tests at 99% statement and 95% branch
coverage, including one that asserts the demo data still shows what the demo
claims.
