# Workflows: who does what, and how

Everything below is available on the web (`/owner`, `/manager`, `/station`) and the staff parts also in the mobile app. Each step opens the right screen from the sidebar or the command palette (press Ctrl or Cmd + K).

## Prices and recipes

- Every hot coffee is **Rs 100**, every flavored drink **Rs 120**, every iced drink **Rs 150**, at every station and partner cafe. Change a tier price once under *Settings and keys > Prices and rules*; all products on that tier are repriced, with an audit entry.
- Recipes are standard. Only the owner edits them (*Recipes and costing*); each edit raises the recipe version. Stations see a read-only **Recipes** tab with the exact quantities and the method, and no costs.

## Owner: first day

1. **Settings and keys**: company details, Fonepay keys, Firebase and web push keys. Secrets are stored encrypted and shown masked. Every key has a *Test* button.
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

## From order to cup (every channel)

1. **Order.** The customer orders in the app or web (QR at the counter, or the app), at the kiosk, or the counter staff key it in.
2. **Pay.** Fonepay QR, a pass, a coupon or promo that brings it to Rs 0, or cash at pickup. A Fonepay order waits as *awaiting payment*: the station does not see it and no ingredients are used until Fonepay confirms. A failed or abandoned payment cancels the order.
3. **Accept.** The order appears on the station queue as *New*. Staff press **Accept and start**, or **Decline** with a reason (a paid order is refunded and the customer is told).
4. **Prepare.** **Mark prepared** moves it to *Ready for pickup* and notifies the customer.
5. **Hand over.** The customer says the **4-digit pickup code** shown on their phone or kiosk screen. Staff enter it and press **Check code and hand over**. Wrong codes are refused; five wrong codes lock the order to a manager. A manager or owner can hand over without the code by writing a reason, which stays in the order's audit trail. Walk-in counter orders paid on the spot need no code.
6. Cash orders are marked paid at hand-over. Beans are credited and the referral reward is released when the order is picked up.

## Sadhai-run station or partner cafe

| | Sadhai-run station | Partner cafe |
|---|---|---|
| Who the staff work for | Sadhai | The cafe owner |
| Roster, 6-hour shifts, duties, attendance, payroll | Yes, managed under *Staff and pay* | No. Sadhai does not roster, schedule or pay them. |
| Staff screen | Queue, new order, stock, recipes, **My shift** | Queue, new order, stock, recipes |
| Who sees it | Owner, the manager assigned to it | Owner, the manager assigned to it, **and the partner cafe owner** |
| Partner cafe owner sign-in | not applicable | Sees sales, orders, live queue, stock, ratings, cash counts, their settlement statement; can add logins for their own counter staff, pause orders, and update their stock counts. Cannot see costs, margins, customer phone numbers, other cafes, or change prices, offers, recipes or push messages. |
| Money | All sales belong to Sadhai | Fonepay money is received by Sadhai. Cash stays at the cafe. Each period the cafe's share (a percentage of net sales) is netted against the cash it holds; the statement says who pays whom. |
| Stock | Sadhai buys centrally and dispatches; managers count and record loss | Same dispatches; the partner owner can update counts |

The owner creates a partner login under *Managers > Add person > Partner cafe owner* and links it to the cafe.
