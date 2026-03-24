---
name: Product Scope
description: AI Home Exercise Platform for clinicians prescribing rehab programs to patients/clients
type: project
---

Platform for physiotherapists/clinicians to create AI-generated home exercise programs (HEPs) for their clients.

**Key models:** User (CLINICIAN/PATIENT roles), Exercise (56 seed entries), WorkoutPlan, PlanExercise, ExerciseFeedback, WorkoutSession, SessionExercise, Assessment, Message, ExerciseMedia, ExerciseProgression.

**Current seed library:** 56 exercises across LOWER_BODY, UPPER_BODY, CORE, BALANCE, FLEXIBILITY, FULL_BODY. Seed script at lib/db/seed/seed.ts. No musclesTargeted, exercisePhase, commonMistakes, or images seeded yet.

**AI generation:** lib/services/ai.service.ts — fetches all active exercises, sends flat list to GPT-4o, returns JSON plan. No phase structuring, no variety enforcement.

**Key domain concepts:**
- Exercise Library (curated, not AI-invented)
- AI workout generation constrained to library exercises
- Progression/regression chains
- Adherence tracking, feedback loops
- Patient-clinician messaging
- HIPAA considerations

**Why:** Anchors all architectural decisions to the actual product.
**How to apply:** Every technical recommendation must trace back to concrete product requirements.
