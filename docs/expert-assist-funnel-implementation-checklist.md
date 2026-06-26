# Expert Assist funnel — implementation checklist

Source: `trigger-dev-v3-plan.md` (v2 funnel + v3 Trigger.dev contract).

**Invariants (never violate):**

- Supabase owns state; Trigger.dev owns timing/retries/logging only.
- No cron / `schedules` — event-triggered runs + durable `wait.for()` only.
- Never cancel drip/dormancy runs — wake, read fresh state, exit with reason.
- Stage is derived only — `recomputeStage(location_id)` is the sole writer of `stage` + `stage_changed_at`.
- Every external send goes through `sendOnce()` (insert-before-send on `shop_events`).
- Every `tasks.trigger()` uses `idempotencyKey`; state-mutating tasks use `concurrencyKey: locationId`.

**Identifier model (keep separate — do not conflate):**


| Identifier      | Storage                          | Audience   | Used for                                                                               |
| --------------- | -------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| **Shop code**   | `locations.consult_short_code`   | Staff only | Inbound SMS claim — writer texts toll-free and replies with code                       |
| **casePartner** | `locations.toolbox_case_partner` | Consumer   | QR codes, counter-card links, Toolbox diagnose, referral attribution (`?casePartner=`) |


- Generate casePartner via `ensureToolboxCasePartner()` (`lib/expert-assist/toolbox-partner.ts`): shop name (normalized) + last 4 of location id when the base collides.
- **Never** put `consult_short_code` in a QR, public URL, PDF, email CTA, or prefilled consumer `sms:` link.
- **No Flowcode (or similar) required for v1** — QR is a static encoding of a URL you own; scan logging happens in a redirect route or on Toolbox submit. Revisit a short-link SaaS only if marketing needs to change destinations without deploys.

**Consumer URL patterns (all use `casePartner` only):**

```
# Counter-card QR (printed on PDF)
https://app.fixlane.com/sign-up?casePartner=OILCHANGERSD0D9&utm_source=qr&utm_medium=counter_card

# Optional thin redirect for scan logging before Toolbox (same param)
GET /r/qr?casePartner=OILCHANGERSD0D9&src=card  → log qr.scanned → 302 to diagnose URL above

# Toolbox referral (owner toolkit, expert handoff)
https://app.fixlane.com/sign-up?casePartner=OILCHANGERSD0D9&utm_source=shop&utm_medium=toolkit
```

**Legend:** `[x]` done in repo · `[~]` partial · `[ ]` not started

---

## Phase 0 — Align with what exists today

Map current code before building new tables (avoid two parallel funnel systems).


| Status | Item                                            | Notes                                                                                                                             |
| ------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `[~]`  | `deriveExpertAssistFunnelStage`                 | `lib/expert-assist-funnel/stages.ts` — logic matches plan; reads `consult_cases` + messages, not `activation_state`               |
| `[~]`  | `syncExpertAssistEnrollmentStage`               | `lib/expert-assist-funnel/sync-stage.ts` — writes `location_program_enrollments.stage`; no `stage_changed_at`, no `shop_events`   |
| `[~]`  | Dormant scheduling                              | `trigger/expert-assist/schedule-dormant-check.ts` — 60d wait + supersede check only; no 21d email                                 |
| `[~]`  | Kanban + checklist UI                           | `ConsultActivationBoard`, `ExpertAssistProgramPanel`, `program-config` checklist keys                                             |
| `[~]`  | Signup + Variant B                              | `lib/expert-assist/complete-signup.ts` (`skipCard`) — no `activation_variant` column                                              |
| `[~]`  | casePartner codes                               | `lib/expert-assist/toolbox-partner.ts` — consumer QR/referral id; separate from `consult_short_code`; no referral fact writes yet |
| `[ ]`  | Migrate off manual stage PATCH                  | `app/api/expert-assist/enrollments/[id]/route.ts` still allows direct `stage` writes                                              |
| `[ ]`  | Deprecate `program_enrollment_checklist` for EA | Replace with `activation_state` timestamps                                                                                        |


**Exit criteria:** Decision documented — either migrate `activation_state` keyed by `location_id` (shops) or rename plan’s `shop_id` → `location_id` everywhere.

---

## Phase 1 — Supabase schema

### 1.1 `activation_state` (one row per location)

- [ ] Migration: create `activation_state` with `location_id` PK → `locations(id)`
- [ ] Checkbox timestamps: `card_added_at`, `owner_forward_clicked_at`, `front_desk_sms_delivered_at`, `counter_card_downloaded_at`, `welcome_kit_shipped_at`, `printout_photo_received_at`, `qr_first_scanned_at`, `free_consult_used_at`
- [ ] Funnel facts: `signed_up_at`, `first_inbound_at`, `first_consult_at`, `last_consult_at`, `consult_count` (default 0)
- [ ] Referral facts: `first_referral_at`, `referral_count` (default 0), `last_referral_at`
- [ ] Config: `activation_variant` (`card_required`  `card_after_first_consult`), `is_high_value` (bool), `sms_channel_dead` (bool, default false)
- [ ] QR: `qr_scan_count` (int, default 0)
- [ ] Derived cache: `stage`, `stage_changed_at`
- [ ] Backfill script: seed from `locations`, `program_enrollment_checklist`, `consult_cases`, `consult_messages` for enrolled Expert Assist shops
- [ ] Tests: backfill spot-checks on 3–5 real-shaped fixtures

### 1.2 `shop_events` (append-only, idempotent)

- [ ] Migration: `shop_events (id, location_id, event_type, dedupe_key, payload jsonb, created_at)`
- [ ] Unique index on `(location_id, event_type, dedupe_key)`
- [ ] Index on `(location_id, created_at)` for shop timeline UI (optional v1)

### 1.3 Enrollment / program cleanup

- [ ] Stop using `location_program_enrollments.stage` as source of truth (keep row for program membership; stage reads from `activation_state` or sync both in `recomputeStage` during transition)
- [ ] Remove or gate `manual_stage_override` for Expert Assist once ops sign off

**Exit criteria:** Tables live in Supabase; backfill run in staging; kanban can read `activation_state` in a feature branch.

---

## Phase 2 — Shared lib `lib/activation.ts`

Single module imported by Next.js routes and Trigger.dev tasks (not duplicated in `trigger/`).

### 2.1 State access

- [ ] `getState(locationId)` — load `activation_state` + join fields for sends (owner email, front desk phone, shop name, `toolbox_case_partner`); never expose `consult_short_code` to consumer send paths
- [ ] `ensureActivationState(locationId)` — upsert row on first touch (signup, enroll)

### 2.2 Stage derivation

- [ ] `computeStage(s, now)` — port from plan §1b (match existing `deriveExpertAssistFunnelStage` tests; add `signed_up_at` / `first_inbound_at` / `first_consult_at` facts as inputs)
- [ ] `recomputeStage(locationId)` — compute, write `stage` + `stage_changed_at` if changed, append `shop_events` row `stage.changed` with `{ from, to }`
- [ ] Edge cases covered in tests:
  - [ ] Inbound before signup → message stored, `first_inbound_at` null until claim
  - [ ] Consult while dormant → `last_consult_at` updates, stage → `activated`
  - [ ] Active = 2+ consults, last two within 60d, last consult within 60d
  - [ ] Variant B: no card does not block stage progression

### 2.3 Idempotent writes

- [ ] `writeFactIfNull(locationId, field, timestamp)` — `SET col = COALESCE(col, $ts)`
- [ ] `incrementCounter(locationId, field)` — safe under concurrency (or use event + single writer task)
- [ ] `sendOnce(locationId, dedupeKey, sendFn)` — plan §8.1 insert-before-send on `shop_events` (`event_type: message.sent`)
- [ ] `logShopEvent(locationId, eventType, dedupeKey, payload)` — generic insert with 23505 → no-op

### 2.4 Drip helpers

- [ ] `dripDone(s)` → `'first_inbound' | 'disabled' | false`
- [ ] `shouldSendDripStep(locationId, step)` — false if drip done, step already in `shop_events`, or shop disabled
- [ ] `sendOwnerEmailByGap(s)` — forward CTA → counter card → economics (plan §3.1 T+5d)

### 2.5 Trigger helpers

- [ ] `triggerActivationDrip(locationId)` — `idempotencyKey: activation-drip-${locationId}`
- [ ] `triggerInboundSms(payload)` — `idempotencyKey: inbound-${messageId}`, `concurrencyKey: locationId`
- [ ] `triggerConsultCompleted(payload)` — `idempotencyKey: consult-${consultId}`, `concurrencyKey: locationId`
- [ ] `triggerDormancyCheck(payload)` — `idempotencyKey: dormancy-${consultId}`

**Exit criteria:** Unit tests green for `computeStage`, `recomputeStage`, `sendOnce`; no Trigger.dev imports in this file.

---

## Phase 3 — Next.js routes (ingest only, no drip logic)

Each route: validate → persist raw record → write facts / trigger task → return 200 fast.

### 3.1 Signup

- [ ] `POST /api/expert-assist/signup/complete` — on success: `signed_up_at`, set `activation_variant` from payload, `recomputeStage`, log `shop.signed_up`, trigger drip if Variant B
- [ ] Wire `activation_variant` on signup UI / API contract

### 3.2 Stripe

- [ ] `app/api/stripe/webhook/route.ts` — on `setup_intent.succeeded` / checkout setup: `card_added_at`, `recomputeStage`, log `billing.card_added`, trigger drip if Variant A
- [ ] Variant B billing gate unchanged: card required before 2nd consult / first paid (existing `billing-gates.ts`)

### 3.3 Twilio

- [ ] Inbound webhook — store message, resolve shop (existing `inbound-sms.ts`); on matched approved shop: trigger `handleInboundSms` task (do not recompute in route)
- [ ] Status callback — on `delivered`: `front_desk_sms_delivered_at`; on `failed`/`undelivered` for welcome SMS: `sms_channel_dead = true`, `internalFollowUp` reason `bad-frontdesk-number` (plan §8.7, not a separate task)

### 3.4 Resend

- [ ] Click webhook route — forward CTA link only → `owner_forward_clicked_at`, log `email.forward_clicked`

### 3.5 Assets & tracking (casePartner only)

- [ ] Counter-card PDF download route — auth/signed URL → `counter_card_downloaded_at`, log `asset.counter_card_downloaded`; embed QR encoding diagnose URL with `casePartner` + `utm_medium=counter_card` (generate via `ensureToolboxCasePartner` at PDF build time)
- [ ] `GET /r/qr` (or equivalent) — query `casePartner` + `src`; lookup `locations.toolbox_case_partner`; log `qr.scanned` (`src` in payload); set `qr_first_scanned_at` / `qr_scan_count++`; 302 to Toolbox diagnose with same `casePartner` and UTM params. **Do not** accept or resolve `consult_short_code` on this route.
- [ ] Photo upload / inbound MMS path — `printout_photo_received_at`, trigger `handlePhotoReceived`

### 3.6 Consult close (CRM)

- [ ] `closeConsultCaseWithBilling` — after DB close: trigger `handleConsultCompleted` (facts + emails + dormancy in task, not in route)

### 3.7 Referral (Toolbox)

- [ ] Webhook or API from diagnose form — match shop by `casePartner` (not shop code); `referral.submitted` facts + log
- [ ] Booking confirmed webhook — `referral.booked` + trigger `handleReferral`

### 3.8 Admin (manual)

- [ ] Internal action: `welcome_kit_shipped_at` + log `kit.shipped` (stays manual until toll-free approval)

**Exit criteria:** Every event in plan §2 has a route handler; none contain `wait.for` or drip sends.

---

## Phase 4 — Trigger.dev tasks

Refactor/replace `trigger/expert-assist/*` to match plan §8. Env: `SUPABASE_SERVICE_ROLE_KEY`, Twilio, Resend, `TRIGGER_SECRET_KEY`.


| Task               | ID                      | Status | Checklist                                                                                                                                                                                                                                      |
| ------------------ | ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activation drip    | `activation-drip`       | `[ ]`  | Single run with `wait.for({ days: N })`; T0 welcome email + front desk SMS; T+2 nudge1; T+5 owner email by gap; T+7 nudge2+CALL; T+14 internal if `is_high_value`; respect `sms_channel_dead`; `retry: { maxAttempts: 3 }`; exit reason logged |
| Inbound SMS        | `inbound-sms`           | `[ ]`  | `setFirstInboundIfNull`, `recomputeStage`, notify expert, `CALL` → `handleCallRequest`; `queue: { concurrencyLimit: 1 }`                                                                                                                       |
| Consult completed  | `consult-completed`     | `[ ]`  | `writeConsultFacts`, `recomputeStage`, money-kept email, receipt if paid, `active-referral-push` on first transition to active, spawn `dormancyCheck`                                                                                          |
| Dormancy           | `dormancy-check`        | `[~]`  | Replace `schedule-dormant-check`: wait 21d → muscle memory email (no stage change); wait 39d more → `recomputeStage`, reactivation email, internal if HV; supersede if `last_consult_at > anchor`                                              |
| Call request       | `handle-call-request`   | `[ ]`  | Callback task + confirm SMS + log `walkthrough_requested`                                                                                                                                                                                      |
| Photo received     | `handle-photo-received` | `[ ]`  | Free consult unlock, front desk SMS, owner one-liner                                                                                                                                                                                           |
| Referral           | `handle-referral`       | `[ ]`  | submitted = facts only; booked = owner loop-close email (`sendOnce` per referralId)                                                                                                                                                            |
| Internal follow-up | `internal-follow-up`    | `[ ]`  | Slack/admin queue; reasons: `never-activated-high-value`, `dormant-high-value`, `bad-frontdesk-number`                                                                                                                                         |


### 4.1 Remove / replace legacy tasks

- [ ] Retire `expert-assist-sync-enrollment-stage` as primary path — `recomputeStage` called from event handlers instead
- [ ] Retire `expert-assist-on-stage-changed` stub OR repurpose to side effects only (Slack) triggered from `recomputeStage` when stage changes
- [ ] Update `lib/expert-assist-funnel/trigger.ts` → `lib/activation/trigger.ts` with new task IDs and idempotency keys

### 4.2 Email templates (hardcoded)

- [ ] T0 owner welcome (forward CTA + counter card link)
- [ ] T+5 owner emails (3 variants by missing checkbox)
- [ ] Money-kept (+ optional Toolbox handoff block)
- [ ] Active referral toolkit (`active-referral-push`) — links use `?casePartner=` only
- [ ] 21d muscle memory (optional — plan allows cut)
- [ ] 60d reactivation
- [ ] Referral booked owner notification
- [ ] Photo received owner one-liner

**Exit criteria:** Staging shop can complete signup → drip T0 → inbound → consult close → active email → dormancy waits scheduled; Trigger dashboard shows exit reasons.

---

## Phase 5 — UI & API read path

- [ ] Kanban reads `activation_state.stage` + 8 checkbox timestamps (not derived ad hoc from consult_cases in list view)
- [ ] `ExpertAssistProgramPanel` / board: remove manual checklist PATCH for auto-resolved boxes (keep manual only for `welcome_kit_shipped`)
- [ ] Remove direct stage override from enrollment PATCH (or admin-only behind flag)
- [ ] Shop detail: show `shop_events` timeline (optional v1)
- [ ] `deriveExpertAssistNextAction` reads `activation_state` gaps
- [ ] Display `activation_variant`, `sms_channel_dead`, referral counts

**Exit criteria:** BDR sees same stage in kanban, shop detail, and `activation_state` row.

---

## Phase 6 — Metrics & experiment (post-MVP)

- [ ] Activation: % signed-up → first consult ≤ 30d
- [ ] Engagement: second consult ≤ 60d rate, % shops in Active
- [ ] Checkbox velocity: median days signup → each `*_at` column
- [ ] Referral north star: % Activated/Active with ≥1 referral; referrals per Active shop / month; time first consult → first referral
- [ ] Funnel integrity: expert-escalated Toolbox vs direct `?casePartner=` (shop-initiated QR/toolkit) submissions
- [ ] A/B: compare metrics by `activation_variant` including referral rate

---

## Phase 7 — Deliberately out of scope (do not build)

- [ ] AI orchestration
- [ ] Physical welcome kit automation (manual `kit.shipped` until toll-free)
- [ ] Shop-facing activation dashboard
- [ ] Second writer of `stage` anywhere
- [ ] Cron / nightly sweep jobs

---

## Suggested build order (sequential PRs)

1. **Schema + `lib/activation.ts`** — tables, `computeStage`, `recomputeStage`, `sendOnce`, tests
2. **Fact writers** — signup, Stripe, Twilio status, consult close triggers (no drip yet)
3. **Inbound + consult tasks** — `inbound-sms`, `consult-completed`, `dormancy-check` (replace existing dormant task)
4. **Activation drip** — `activation-drip` + templates + dead-channel flag
5. **QR + assets + Resend click** — `/r/qr?casePartner=…`, counter-card PDF with casePartner QR, forward click
6. **Referral + photo** — Toolbox webhooks, `handle-photo-received`, `handle-referral`
7. **UI migration** — kanban reads `activation_state`, remove manual stage override
8. **Backfill + cutover** — production migration, deprecate checklist-based EA funnel

---

## Test plan (minimum per PR)

- [ ] Idempotency: replay same webhook / `tasks.trigger` twice → one fact write, one send
- [ ] Drip: shop gets inbound at T+1d → run exits at next wake with `first_inbound`
- [ ] Drip: welcome SMS fails → `sms_channel_dead` → T+2/T+7 SMS skipped, email continues
- [ ] Consult close: 2nd consult within 60d → `active` + exactly one `active-referral-push`
- [ ] Dormancy: newer consult before day 60 → anchor run exits `superseded`
- [ ] Variant B: signup starts drip without card; card gate still blocks paid path per existing gates
- [ ] QR / public links: `casePartner` resolves correctly; `consult_short_code` never appears in consumer URLs or redirects