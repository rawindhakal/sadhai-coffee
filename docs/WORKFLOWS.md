# Workflows: who does what, and how

Everything below is available on the web (`/owner`, `/manager`, `/station`) and the staff parts also in the mobile app. Each step opens the right screen from the sidebar or the command palette (press Ctrl or Cmd + K).

## Prices and recipes

- Every hot coffee is **Rs 100**, every flavored drink **Rs 120**, every iced drink **Rs 150**, at every station and partner cafe. Change a tier price once under *Settings and keys > Prices and rules*; all products on that tier are repriced, with an audit entry.
- Recipes are standard. Only the owner edits them (*Recipes and costing*); each edit raises the recipe version. Stations see a read-only **Recipes** tab with the exact quantities and the method, and no costs.

## Owner: first day

1. **Settings and keys**: company details, payment keys (eSewa, Khalti, Fonepay), Firebase and web push keys. Secrets are stored encrypted and shown masked. Every key has a *Test* button.
2. **Home page and pictures**: replace every hero layer, section picture, partner and investor page text and product picture. Anything left empty falls back to the built-in artwork.
3. **Stations**, **Managers**, **Staff and pay**: add the cafes, their managers, and each staff member with an hourly rate.
4. The *Get Sadhai ready* checklist on the overview tracks what is still missing.

## Staff: a normal day

1. Open **My shift**. The next 6-hour shift, the duty and the checklist are there.
2. **Start my shift** (allowed 30 minutes before it begins). Tick the checklist as you go.
3. **End my shift**. Paid minutes are counted from scheduled start to end, with a grace window, and never beyond the shift length unless a manager approves it.
4. Ask for time off from the same screen; a manager approves or declines.

## Manager: the week

1. **Staff and roster > Roster**: press **Auto-assign** for the week. The planner gives each person at most one 6-hour shift a day, keeps rest between shifts, skips days off and approved leave, puts a bar-skilled person on every shift, shares hours fairly and rotates duties (opening, closing, bar, counter).
2. Fix anything by tapping a shift, then **Publish**. Staff are notified.
3. **Attendance** flags late, early and unclosed shifts; correct the paid hours with a reason.
4. **Time off**: approve or decline requests.

## Owner: payroll

1. **Staff and pay > Payroll**: pick dates, **Preview**, then **Create a draft payroll**.
2. Pay = paid hours x hourly rate. Hours above 8 a day or 48 a week are overtime at 1.5x. Social security comes from settings. Bonuses, allowances and advances are added under *Bonuses, allowances and advances*.
3. **Approve** locks the hours and releases payslips to staff. **Mark as paid** with a bank reference closes it. CSV export is available.

## Partner cafes and investors

Public pages `/partners` and `/investors` show the model, the standard prices and an enquiry form. Enquiries arrive under *Enquiries* in the owner dashboard. Their text and pictures are edited under *Home page and pictures*.
