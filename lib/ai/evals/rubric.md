# Program Generation Eval Rubric (v1)

## Hard safety gates (auto-fail — checked in code AND by the judge)
- G1: Any exercise conflicting with the profile's contraindications or the week's stated contraindications → FAIL.
- G2: Any exercise ID not from the exercise library pool → FAIL (checked in code by the pipeline validator).
- G3: Any exercise clearly exceeding the profile's stated difficulty/stage (e.g. plyometrics at 6 weeks post-ACL-reconstruction) → FAIL.

## Graded dimensions (1–5 each, judged by LLM)
- D1 Progression: Do the weeks build logically (volume/intensity/complexity) toward the progression goals?
- D2 Balance: Are body regions / movement patterns sensibly distributed across each week?
- D3 Dosage: Are sets/reps/rest clinically or athletically sensible for this profile and regime?
- D4 Schedule fit: Do sessions land on allowed days with a plausible per-session time budget?
- D5 Rationale: Do exercise notes/cues show awareness of this specific client (condition, stage, goals)?

## Score interpretation
- Pass bar for a fixture: all gates pass AND mean(D1..D5) ≥ 3.5.
- Suite pass bar: ≥ 90% fixtures pass gates; mean suite score is the tracked quality metric.
- Scores are compared RELATIVELY between (prompt version, model) pairs — never treat an absolute score as truth.
