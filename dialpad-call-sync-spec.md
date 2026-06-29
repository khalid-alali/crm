# Spec — Dialpad Call Summary Sync to Channel-Partner CRM

**Owner:** Khalid (BizOps) · **Status:** Draft for review · **Last updated:** 2026-06-29

---

## Problem Statement

When a shop calls or is called by the RepairWise team, that conversation lives only in Dialpad. The success manager has no visibility into what was discussed, what was committed, or even that a call happened, unless someone manually logs it — which doesn't happen reliably. The result is blind spots on partner health: a shop can raise an issue or get a verbal commitment on a call, and it never surfaces in the CRM where the success manager works. Dialpad already generates an AI recap for every AI-enabled call; the gap is purely that nothing carries it into the CRM.

## Goals

1. **Every in-scope shop call appears on the shop's CRM record automatically**, with no manual logging step, within minutes of the call ending.
2. **The success manager can see the AI summary, who spoke, when, and how long** without leaving the CRM or opening Dialpad.
3. **Match rate of in-scope calls to the correct shop is ≥95%**, driven off the existing contacts table.
4. **Unmatched calls are recovered, not lost** — any call to a technicians-department member that doesn't auto-match lands in a manual-match queue, and resolving it backfills the contacts table so the same number auto-matches next time.
5. **Call metadata is captured even when no AI summary exists** (short calls, voicemails), so a call is never invisible.
6. **The sync is self-maintaining** as the technicians department roster changes, without engineering intervention per hire.

## Non-Goals

- **Recordings and full transcripts.** Out of scope for v1 — raises the privacy bar (requires `recordings_export` scope, role-gated access) and isn't needed for visibility. Summary + metadata only.
- **Action items, call purpose, outcome, CSAT.** Dialpad exposes these (`recap_action_items`, `recap_purposes`, `recap_outcome`), but v1 ships summary only. Captured as P2 because they feed nudge automation later.
- **SMS / text logging.** Separate event stream, separate initiative.
- **Auto-creating shop contacts from unknown numbers.** Unmatched calls go to a manual-match queue for a human to resolve; the system never guesses a shop or silently creates one.
- **A net-new partner timeline.** v1 reuses the existing activity timeline; the only new surface is the manual-match queue itself.

## Users & Stories

**Primary persona: Success Manager (shop success — Nic).**

- As a success manager, I want every shop's recent calls with our team to appear on their CRM record so that I walk into a check-in already knowing what was discussed.
- As a success manager, I want to read the AI summary of a call I wasn't on so that I don't have to chase the teammate who took it.
- As a success manager, I want to see calls that happened even when there's no summary so that I know a shop reached out at all.
- As a success manager, I want a queue of calls the system couldn't auto-match so that I can attach a real shop call to the right record instead of losing it, and dismiss anything that isn't a shop.

**Secondary persona: BizOps / Ops (Khalid).**

- As the operator, I want new technicians-department members to be picked up automatically so that I'm not editing subscriptions on every hire.
- As the operator, I want to trust that a shop number stored in any common format still matches so that the match rate doesn't quietly degrade.

## Technical Design

### Source

Dialpad Ai Recaps, delivered via the **call-events webhook**. The recap is not available at hangup — it's a `recap_summary` string populated on a **separate, later `recap_summary` state event** after post-call AI processing. This is the single fact that shapes the write path: the system cannot write one complete row at call end.

Prerequisite: **Ai Recaps must be enabled at the company level with AI active during the call.** This is distinct from basic transcription and must be confirmed on the account before build (see Open Questions).

### Scope of calls

- **Subscription:** one call-event subscription per user (`target_type=user`) for every member of the technicians department. This captures all of that user's calls in both directions, not only calls routed through the department.
- **Subscribed states:** `hangup` and `recap_summary`.
- **Ingestion + routing:** every call to/from a technicians-department member is written. Match `external_number` (the external party, E.164) against the contacts table. If it matches a shop → `matched`, `shop_id` set. If it doesn't → `unmatched`, `shop_id` null, and the call enters the manual-match queue. If the number is on the ignore list (previously dismissed as "not a shop") → `dismissed`, kept out of the active queue.
- **Queue noise guard:** to keep the queue useful, only *connected* calls (those with a `date_connected`) above a short duration floor (default 30s) enter the active queue. Missed calls, voicemails, and sub-floor calls are still written but flagged so they don't clutter triage. This floor is a tunable, not a hard rule — see Open Questions on who owns triage.

### Payload → record mapping

| CRM field | Dialpad source | Notes |
|---|---|---|
| `call_id` | `call_id` | Upsert key |
| `shop_id` / `contact_id` | join on `external_number` → contacts | The match |
| `direction` | `direction` | `inbound` / `outbound` |
| `rw_user_id` / `rw_user_name` | `target.id` / `target.name` | The internal party = "who" on our side |
| `external_number` | `external_number` | E.164 |
| `started_at` / `connected_at` / `ended_at` | `date_started` / `date_connected` / `date_ended` | unix-ms UTC → timestamptz |
| `talk_sec` / `total_sec` | `duration` / `total_duration` | float ms → seconds |
| `summary` / `summary_at` | `recap_summary` | Patched in on the later event |
| `match_status` | derived | `matched` if number in contacts, else `unmatched`; `dismissed` if on ignore list |

### Write path

- **On `hangup`:** upsert the row keyed on `call_id` with all metadata. `summary` null.
- **On `recap_summary`:** patch `summary` and `summary_at` onto the existing `call_id` row.
- Direct write to Postgres; no API layer.
- Events can arrive out of order — order by `event_timestamp`, and use upsert semantics so either event can land first.

### Schema

```sql
create table shop_call_activity (
  call_id            bigint primary key,        -- Dialpad call_id = upsert key
  shop_id            bigint references contacts(shop_id),  -- null until matched
  contact_id         bigint references contacts(id),       -- null until matched
  direction          text,                      -- inbound | outbound
  rw_user_id         bigint,                    -- target.id
  rw_user_name       text,                      -- target.name
  external_number    text,                      -- E.164
  started_at         timestamptz,
  connected_at       timestamptz,
  ended_at           timestamptz,
  talk_sec           int,                       -- duration / 1000
  total_sec          int,                       -- total_duration / 1000 (incl ring)
  summary            text,                      -- recap_summary, nullable
  summary_at         timestamptz,
  match_status       text not null default 'unmatched',  -- matched | unmatched | manually_matched | dismissed
  in_queue           boolean not null default false,     -- passes the noise guard and awaiting triage
  matched_by         text,                      -- who resolved it; null if auto-matched
  matched_at         timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- numbers a human marked "not a shop" so they never re-enter the queue
create table dialpad_ignored_numbers (
  external_number text primary key,
  dismissed_by    text,
  dismissed_at    timestamptz default now()
);
```

Resolution write-back: when a human matches an unmatched call to a shop, set `shop_id`/`contact_id`, `match_status = 'manually_matched'`, `in_queue = false`, and **append the number to that shop's contact record** so future calls auto-match. When a human dismisses, set `match_status = 'dismissed'`, `in_queue = false`, and insert the number into `dialpad_ignored_numbers`.

## Requirements

### Must-Have (P0)

**P0-1 — Webhook receiver ingests call events.**
- Given a subscribed user completes a shop call, when the `hangup` event fires, then a `shop_call_activity` row exists within 1 minute with all metadata populated and `summary` null.
- Given the `recap_summary` event later fires for that `call_id`, then the existing row is updated with the summary, not duplicated.
- Given events arrive out of order (recap before hangup), then the row still ends up complete and singular.
- Given delivery fails, then the receiver returns a non-2xx so Dialpad retries, and failures are logged/monitored.

**P0-2 — Shop matching off the contacts table.**
- Given a call's `external_number`, when it matches a contacts-table number after E.164 normalization, then `shop_id` and `contact_id` are set and `match_status = 'matched'`.
- Given the number is not in contacts and not on the ignore list, then the row is written with `shop_id` null and `match_status = 'unmatched'` (it is not dropped).
- Given the number is on `dialpad_ignored_numbers`, then the row is written as `dismissed` and stays out of the active queue.
- Acceptance: numbers stored in the contacts table in mixed formats — `(619) 555-1234`, `619-555-1234`, `6195551234` — all match the E.164 `external_number`. Normalization happens on both sides of the join.

**P0-3 — Manual-match queue.**
- Given an `unmatched` call that passes the noise guard (connected, ≥30s), when the success manager opens the queue, then they see the external number, the technician who spoke, date/time, duration, and the summary if present.
- Given a queued call, when the success manager assigns it to a shop, then the row becomes `manually_matched` with `shop_id` set, leaves the queue, and the number is written back to that shop's contact so future calls auto-match.
- Given a queued call that isn't a shop, when the success manager dismisses it, then the row becomes `dismissed`, the number is added to the ignore list, and that number never re-enters the queue.
- Given a number is resolved or dismissed, when a later call from the same number arrives, then it is auto-routed (matched or dismissed) without re-queueing.

**P0-4 — Calls render on the partner timeline.**
- Given a matched or manually-matched `shop_call_activity` row, when the success manager opens that shop's CRM record, then the call shows direction, date/time, duration, who handled it, and the summary if present.

**P0-5 — Subscription reconciliation.**
- Given the technicians department roster, when the reconcile job runs (scheduled), then exactly one active subscription exists per current member, new members gain one, and departed members' subscriptions are removed.

### Nice-to-Have (P1)

- **P1-1 — Cross-partner recent-calls view.** A single list of recent in-scope calls across all shops, filterable by user and date, so the success manager can scan activity without opening each record.
- **P1-2 — Summary-pending indicator.** Rows awaiting a recap show a "summary processing" state rather than appearing permanently summary-less.

### Future Considerations (P2)

- **P2-1 — Outcome → nudge.** Ingest `recap_outcome`; "needs follow-up" feeds the stalled-deal nudge logic. Design the schema to allow adding `outcome` without migration pain.
- **P2-2 — Action items → tasks.** Ingest `recap_action_items` as CRM tasks.
- **P2-3 — Transfer dedup.** If shop calls route through a department/call center, transfers spawn multiple `call_id`s linked by `operator_call_id` / `master_call_id`. v1 captures the operator leg per user; add `master_call_id`-based dedup only if double rows appear.

## Success Metrics

**Leading (days–weeks)**
- **Sync coverage:** % of in-scope completed calls that produce a `shop_call_activity` row. Target ≥98%. Measured by reconciling Dialpad call counts for subscribed users against rows written, weekly.
- **Match rate:** % of in-scope calls correctly attributed to a shop. Target ≥95%.
- **Queue volume & burn-down:** size of the active manual-match queue and median time-to-resolution. Target: queue stays small and trends down as the ignore list and contact backfill mature; a persistently growing queue signals the noise guard is too loose or contacts coverage is poor.
- **Auto-match lift:** % of calls auto-matched over time. Should rise as manual resolutions backfill contacts — the leading sign the queue is self-extinguishing.
- **Summary fill rate:** % of rows that receive a summary (excludes voicemails/short calls). Hypothesis ≥85%; if low, indicates Ai Recaps isn't fully enabled.
- **Latency:** time from `hangup` to row written. Target <1 min for metadata; summary lands when Dialpad processes it.

**Lagging (weeks–months)**
- **Manual-logging elimination:** zero expectation of manual call logging by the success manager.
- **Qualitative:** success manager reports walking into check-ins informed by call history (confirm at 30 days).

## Open Questions

- **[Stakeholder/Ops — blocking]** Is Ai Recaps enabled at the company level with AI active on the relevant lines? If not, summaries arrive null across the board. Confirm before build.
- **[Ops — blocking]** Are the technicians department's shop-facing calls direct-dial, or do they route through a department/call center? Determines whether transfer dedup (P2-3) matters at launch.
- **[Data — non-blocking]** What's the current format consistency of phone numbers in the contacts table, and is there an existing E.164 column to join on, or does one need adding?
- **[Stakeholder — non-blocking]** Should calls with no summary (voicemails, very short calls) appear on the timeline, or be suppressed? Default in this spec is to show them.
- **[Stakeholder — non-blocking]** Who owns triaging the manual-match queue (success manager, ops, shared), and what's the right duration floor for the noise guard? 30s is a starting default — tune once real volume is visible.
- **[Engineering — non-blocking]** Where does the receiver run — extend an existing Railway service (DataBot pattern) or stand up its own?

## Timeline & Phasing

- **Phase 1 (P0):** receiver + ingestion + contacts match + manual-match queue + partner-timeline rendering + reconcile job. Delivers full visibility with no dropped calls. No hard external deadline.
- **Phase 2 (P1):** cross-partner recent-calls view + summary-pending indicator.
- **Phase 3 (P2):** outcome→nudge, action-items→tasks, transfer dedup if needed.

**Key dependency:** Ai Recaps enablement (Open Questions) gates the value of the entire feature and should be confirmed first.
