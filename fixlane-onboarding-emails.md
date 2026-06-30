# Fixlane Shop Onboarding — Automated Email Specs
**Emails E1–E7 · Shop-facing · Triggered by onboarding flow events**

> This document is the companion to the Shop Onboarding Process FigJam board.
> The diagram shows **when** and **why** each email fires. This document defines **what it says**.
> Email content should be reviewed by brand before activation.

---

## Quick Reference

| ID | Name | Trigger | Sender | Reply-to | CC |
|----|------|---------|--------|----------|----|
| E1 | Contract reminder | Shop did not sign within 5 days | onboarding@notifications.fixlane.com | BDR (role) | — |
| E2 | Welcome & bank link | Shop signs contract | onboarding@notifications.fixlane.com | nic@fixlane.com | onboarding@notifications.fixlane.com |
| E3 | Bank link nudge | Shop has not linked bank account after 3 days | onboarding@notifications.fixlane.com | nic@fixlane.com | onboarding@notifications.fixlane.com |
| E4 | Portal invite | Shop links bank account | onboarding@notifications.fixlane.com | nic@fixlane.com | onboarding@notifications.fixlane.com |
| E5 | Expert Assist invite | 2 weeks after portal invite sent | onboarding@notifications.fixlane.com | nic@fixlane.com | onboarding@notifications.fixlane.com |
| E6 | Tesla check-in | 1 week after Tesla enrollment confirmed, tasks incomplete | onboarding@notifications.fixlane.com | justin@fixlane.com | onboarding@notifications.fixlane.com |
| E7 | VinFast survey nudge | 1 week after VinFast enrollment confirmed, 3+ surveys incomplete | onboarding@notifications.fixlane.com | nic@fixlane.com | onboarding@notifications.fixlane.com |

**Routing logic summary:**
- All emails send from `onboarding@notifications.fixlane.com`
- CC on `onboarding@notifications.fixlane.com` on all replies (E2–E7) gives Nic visibility on where shops are getting stuck
- All shop replies must be logged to the CRM against the shop record — configure reply-to threading in the CRM accordingly
- E6 (Tesla) routes to `justin@fixlane.com` — Justin owns the Tesla program escalation path
- E1 (contract reminder) reply-to remains BDR-assigned; no CC needed at that stage

---

## E1 — Contract Reminder
**Node:** Zoho sends reminders every 5 days, contract cancelled at 15 days
**Trigger:** Shop has not signed the contract within 5 days of it being sent. Repeats every 5 days. Suppressed if contract is signed. Final send at day 10 — no send at day 15 (contract cancelled at that point; separate cancellation flow handles communication).
**Sender:** onboarding@notifications.fixlane.com
**Reply-to:** Assigned BDR's email
**CC:** —
**CRM:** Replies logged against shop record
**Subject:** Your Fixlane contract is waiting

---

Hey [First Name],

Your Fixlane partnership contract is still sitting unsigned — just wanted to make sure it didn't get buried.

Signing takes about two minutes. Once it's done, we'll get your shop set up and ready to go.

**[Sign your contract →]**

If you've got questions or something's holding you up, just reply to this email and [BDR Name] will get back to you fast.

— The Fixlane Team

---
*If you didn't expect this email, you can ignore it or reply to let us know.*

---

## E2 — Welcome & Bank Link
**Node:** Automated Email — Congrats / welcome. Next step is to securely connect your bank account
**Trigger:** Shop signs contract (contract status → signed)
**Sender:** onboarding@notifications.fixlane.com
**Reply-to:** nic@fixlane.com
**CC:** onboarding@notifications.fixlane.com
**CRM:** Replies logged against shop record
**Subject:** You're in. Here's what's next.

---

Hey [First Name],

Contract signed. Welcome to Fixlane.

Here's where things stand: your account is being set up on our end. While we do that, there's one thing we need from you — connect your bank account through Routable so payments can flow through without a hitch.

It takes about 5 minutes and it's the only step that's blocking your go-live.

**[Connect your bank account →]**

Use `{{routable_bank_link}}` in the template — on send this becomes a direct link to Routable's secure bank-link form (Fixlane-branded). When the shop finishes, they're redirected back to the onboarding portal automatically.

Any questions, reply here — your onboarding manager will handle it personally.

— The Fixlane Team

---
*Questions? Reply to this email and we'll get back to you.*

---

## E3 — Bank Link Nudge
**Node:** Auto-remind every 3 days (not linked)
**Trigger:** Shop received Routable invitation but has not linked bank account after 3 days. Repeats every 3 days. Suppressed once bank account is linked. Escalates to human task at 15 days.
**Sender:** onboarding@notifications.fixlane.com
**Reply-to:** nic@fixlane.com
**CC:** onboarding@notifications.fixlane.com
**CRM:** Replies logged against shop record
**Subject:** One step left before you go live

---

Hey [First Name],

Your Fixlane account is ready — we're just waiting on your bank connection through Routable.

This is the last thing standing between you and go-live. It takes about 5 minutes.

**[Connect your bank account →]**

Use `{{routable_bank_link}}` in the template — a fresh direct bank-link URL is minted on each send. If it expired, send E2 again or reply for help.

— The Fixlane Team

---
*Link expired? Open the portal again — it will generate a fresh bank-link session.*

---

## E4 — Portal Invite
**Node:** Automated email — Success Manager with link to onboarding portal
**Trigger:** Shop successfully links bank account to Routable
**Sender:** onboarding@notifications.fixlane.com
**Reply-to:** nic@fixlane.com
**CC:** onboarding@notifications.fixlane.com
**CRM:** Replies logged against shop record
**Subject:** Bank account linked. Here's your onboarding portal.

---

Hey [First Name],

Bank account connected — you're making progress.

Next up: your onboarding portal. This is where you'll complete the program-specific requirements to get fully approved and activated. Your onboarding manager Nic has already set up your account and flagged what needs to get done.

**[Open your onboarding portal →]**

What you'll find inside:
- Your program enrollment checklist
- Any documents or certifications we still need
- Direct line to your onboarding manager if you get stuck

The faster you move through the portal, the faster you're live and receiving jobs.

— The Fixlane Team

---
*Need help navigating the portal? Reply here and Nic will walk you through it.*

---

## E5 — Expert Assist Invite
**Node:** 2 weeks post-invite: Expert Assist invitation
**Trigger:** 2 weeks after E4 (portal invite) was sent, regardless of portal completion status
**Sender:** onboarding@notifications.fixlane.com
**Reply-to:** nic@fixlane.com
**CC:** onboarding@notifications.fixlane.com
**CRM:** Replies logged against shop record
**Subject:** A tool that'll save your techs time — Expert Assist

---

Hey [First Name],

While you're wrapping up your onboarding, we wanted to flag something worth knowing about: Expert Assist.

It's the diagnostic and technical support tool available to all Fixlane network shops. Your techs get live access to repair guidance, wiring diagrams, and technical support — without the back-and-forth.

No extra setup. It's included in your program.

**[Learn more about Expert Assist →]**

You'll get the most out of it once you're fully live — but take a look now so you know what's available to your team.

— The Fixlane Team

---
*Questions about what's included in your program? Reply here.*

---

## E6 — Tesla Check-in
**Node:** Automated one week check-in if tasks incomplete
**Trigger:** 1 week after Tesla enrollment confirmed, and tasks in the Tesla program checklist are still incomplete
**Sender:** onboarding@notifications.fixlane.com
**Reply-to:** justin@fixlane.com
**CC:** onboarding@notifications.fixlane.com
**CRM:** Replies logged against shop record
**Subject:** Your Tesla program tasks need attention

---

Hey [First Name],

You're enrolled in the Tesla program — but there are still a few tasks open in your onboarding portal that are blocking your approval.

Tesla certification has specific requirements and a defined timeline. The sooner these are completed, the sooner you're approved and eligible for Tesla jobs.

**[Complete your Tesla tasks →]**

Here's what's still open:
- [Dynamic list pulled from portal — task names + due dates]

If something is unclear or you've hit a blocker, reply here and Justin will help you through it.

— The Fixlane Team

---
*Tesla program approval won't be confirmed until all tasks are complete.*

---

## E7 — VinFast Survey Nudge
**Node:** If in one week, 3 surveys incomplete, sent auto reminder to shop
**Trigger:** 1 week after VinFast enrollment confirmed, and 3 or more required surveys remain incomplete
**Sender:** onboarding@notifications.fixlane.com
**Reply-to:** nic@fixlane.com
**CC:** onboarding@notifications.fixlane.com
**CRM:** Replies logged against shop record
**Subject:** 3 VinFast surveys still need to be completed

---

Hey [First Name],

You've got 3 (or more) VinFast surveys still open in your onboarding portal.

These surveys are a required part of the VinFast approval process — they can't be skipped, and your program approval won't move forward until they're done.

**[Complete your VinFast surveys →]**

Each one takes about 5–10 minutes. If you're unsure what's being asked or why, reply here and we'll walk you through it.

— The Fixlane Team

---
*VinFast program approval is on hold until all required surveys are submitted.*

---

## Open Questions

Two items still need a decision before this spec can be finalised:

1. **Dynamic task list in E6** — The email references a live list of open tasks pulled from the portal. Confirm whether the email platform can pull that data at send time, or whether E6 should just link to the portal without listing tasks inline.

2. **Cancellation email** — The flow cancels the contract at day 15 on the E1 path. There is no email drafted for that event. A cancellation notification should be added to this spec before go-live.
