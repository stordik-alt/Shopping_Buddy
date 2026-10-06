# New flyer notifications (Nové letáky) — concept

Status: **implemented 2026-10-06** (owner request and decisions of the same day).

## 1. Request

The owner: *"Přidat upozornění při začátku nových akcí s odkazem na dané akce řetězce. Takže známe vydání nových
letáků, mělo by přijít uživateli upozornění na nové akce. Ideálně v takový čas, kdy je databáze probuzená kvůli nějakému
cronu, aby se nemusela probouzet."*

## 2. Owner decisions (2026-10-06)

- **Only for the household's chosen stores**: a chain a member picked in "Moje obchody v okolí" (`member_stores`, as a
  chain or through one of its branches) or that the household lists among its preferred stores
  (`preferences.preferred_stores`, matched to the chain's name ignoring case). A household with no chosen store gets none.
- **One notification per chain** — "Nové akce v Penny" — and a tap opens Akce filtered to that chain.

## 3. What counts as a new flyer

The chains with weekly flyers start hundreds of promotions on one day (measured in production 2026-10-06: Albert, Albert
Hypermarket, Billa, Globus, Lidl and Penny with 100–400 deals per start date). Online shops (Rohlík, Košík) start
promotions nearly every day; they are `stores.is_online` and never announced.

A **flyer period** is a chain's set of deals sharing one `valid_from`. It is announced when:

- the chain is not online;
- it has at least **30** deals (a handful of deals starting on some day is no flyer);
- it starts no earlier than **yesterday** and no later than **3 days ahead** — flyers are published a day or two
  before they start, and a late import still announces the period that began yesterday, but never an old one;
- it has not been announced yet (`deal_announcements`, one row per chain and start date).

## 4. When

In the daily morning cron (`/api/cron/shopping-reminders`, 8:00 UTC = 10:00 Prague time), which runs anyway, so no
extra database wake-up is needed. The flyer imports run in the evening and at night, so a flyer imported overnight is
announced the next morning — at a decent hour, not at 23:00.

## 5. The notification

- Kind **`new_deals`** ("Nové letáky"), which each member can switch off in Profil ▸ Upozornění.
- Title "Nové akce v <chain>", detail "Od čtvrtka 8. 10. — 266 nabídek." (or "Od dneška …" / "Od včera …").
- Link `/?tab=akce&retezec=<chain>`: Akce opens filtered to the chain.
- The announcement row is written before any notification goes out, with "do nothing on conflict", so two overlapping
  cron runs never announce the same flyer twice.

## 6. Code

- `lib/deal-announcements.ts` (pure): which flyer periods to announce, and the notification text.
- `lib/db/deal-announcements.ts`: loads the start dates, the households' chosen chains, writes the announcements and
  the notifications.
- Migration `0072_new_deals_notifications.sql` (additive): `deal_announcements`, and `new_deals` added to the
  notification-kind check.
