# Calculation contract

## Units and provenance

All stored force values use newtons and all user-entered mass values use kilograms. Tindeq `unit=SI` force samples are exported as kilogram-force and converted with exactly `1 kgf = 9.80665 N`. Original metadata, vendor summary values, source SHA-256, parser version, algorithm version, and immutable metric payload are retained for replay.

## RFD 20–80

The RFD adapter uses parser `tindeq-rfd-csv/v1` and algorithm `rfd-20-80/v1`. It subtracts the configured baseline force, finds the corrected peak, linearly interpolates the first crossings at 20% and 80% of that peak, and calculates:

`RFD = (force80 - force20) / (time80 - time20)` in N/s.

The present import pipeline uses the first trace sample as the baseline. This must be independently accepted or replaced by an approved baseline rule before the RFD oracle is approved. Body-weight-relative RFD is `(N/s ÷ body weight N) × 100`, displayed as `%BW/s`. Sessions without body weight never receive a relative score.

## Selection

Each uploaded CSV is one attempt. Publication selects the highest eligible oracle-approved metric from the session, with attempt order as the deterministic tie-break. Leaderboards then select one best eligible session per active member for the exact group, protocol version, hand, date window, score basis, and trust filter. Equal scores share rank. Invalidation, membership removal, account deletion, missing oracle approval, or protocol mismatch removes eligibility without rewriting the immutable metric run.

## Capability gate

RFD ranking requires all of the following:

- an approved oracle manifest with the exact fixture hash and parser/algorithm versions;
- a CI replay whose result is inside the independently supplied tolerance;
- the server-side database capability enabled by a reviewed migration;
- a published immutable protocol version.

No value should be copied from the Tindeq export and called an independent expected result.
