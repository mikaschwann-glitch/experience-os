# Wave 2 — Host usability test protocol

**Status: PENDING a real human run.** This protocol is prepared and ready. Wave 2 is
NOT "host-validated" until a person with low-to-medium software confidence completes it
and the observations below are filled in. Automated coverage (Playwright, repository
verifications, build) proves correctness — it does not prove comprehension.

## Who
One tester, **low-to-medium software confidence**, ideally older / not a daily SaaS user,
with **no prior exposure** to this product. Do not pre-explain the navigation, the
terminology, or the workflow. Do not coach during the test. Sit beside them, watch, and
write down where they pause.

## Setup (facilitator, before the tester sits down)
1. `npm run db:seed` (clean canonical fixture).
2. Start the app (`npm run build && npx next start`), open `/dashboard`, hand over.
3. Have this sheet open to record observations. Optionally screen-record.

## Task 1 — a request the system can prepare
Give the tester **only** this, written on a card:

> Maria & Tom would like a quiet beach walk. Please prepare something useful for their stay.

Say nothing else. Observe and record:

| Step | Observed? (Y/N) | Hesitation / exact label they stumbled on |
|---|---|---|
| Found Maria & Tom (navigated to the guest) | | |
| Created a Preparation without help | | |
| Understood the suggested action (could say what it is) | | |
| Could explain what they need to do next | | |
| Marked it ready | | |
| Found it again from **Today** | | |
| Found it again from **Preparations** | | |
| Found it again from the **Guest** record | | |
| Did NOT get distracted by / confused about the other ideas | | |

## Task 2 — a request the system cannot safely answer
Give the tester **only**:

> Maria & Tom are interested in local architecture and historical buildings.

Observe and record:

| Step | Observed? (Y/N) | Hesitation / exact label they stumbled on |
|---|---|---|
| Understood the system has no reliable idea **yet** | | |
| Did **not** believe the system was broken / errored | | |
| Created a custom Preparation without confusion | | |
| Found it again afterwards | | |

## What to measure (summary)
- Can they find Maria & Tom?
- Can they create a Preparation without help?
- Do they understand the suggested action?
- Can they explain what they need to do next?
- Can they mark it ready?
- Can they later find it again from Today, Preparations, and Guests?
- Can they handle the no-match architecture request without believing the system is broken?
- **At which exact label or step do they hesitate?** (most important — capture verbatim)

## Pass / fail
- **Pass:** both tasks completed unaided, no belief that the system failed, ≤1 minor
  hesitation that the tester self-recovered from.
- **Revise:** any step needed facilitator help, or the tester believed the no-match
  response was an error, or any label caused a stall. Record the label and the fix idea.

## Observation report (fill in after the run — keep it short, not a theory paper)
- Tester profile (one line):
- Task 1 result (pass/revise) + the single biggest friction point:
- Task 2 result (pass/revise) + did they feel the system "broke"? :
- Exact labels/steps that caused hesitation (verbatim):
- Smallest change that would have removed the top friction:
