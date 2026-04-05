---
name: Product Scope
description: AI Home Exercise Platform evolving into TrueCoach-competitive coaching platform for clinicians and patients
type: project
---

Platform for physiotherapists/clinicians to create AI-generated home exercise programs (HEPs) for their clients. Actively evolving into a full TrueCoach competitor.

**Key models (current):** User (CLINICIAN/PATIENT roles), Exercise (56 seed entries), WorkoutPlan, PlanExercise, ExerciseFeedback, WorkoutSession, SessionExercise, Assessment, Message, ExerciseMedia, ExerciseProgression, ClinicProfile.

**V2 hierarchy (planned):** Program > Workout > WorkoutBlockV2 > BlockExerciseV2 > ExerciseSet. New domains: CheckIns, BodyMetrics, ProgressPhotos, Habits, Nutrition, Notifications, Billing (Stripe Connect), CoachBranding.

**Active strategy doc:** `TRUECOACH_COMPETITIVE_STRATEGY.md` — authoritative reference for all phases.

**5 Phases:** (1) Calendar + Program Builder, (2) Client Portal + Session Logging, (3) Progress/Check-ins/Habits, (4) Nutrition/Analytics, (5) Billing/Branding/Notifications.

**Why:** Anchors all architectural decisions to the actual product trajectory.
**How to apply:** Every technical recommendation must trace back to concrete product requirements. V2 models coexist with V1 during migration.
