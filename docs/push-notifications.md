# Push notifications

Phone/browser notifications for the household's existing notifications (budget thresholds, best-price deals, shopping reminders, pantry check-ins, new members). The in-app bell panel and the `notifications` table stay the source of truth. Push is a best-effort copy of each notification.

## How it works

```text
event (Server Action / cron)
  → lib/notify.ts createHouseholdNotification()   stores the notification
  → after the response: lib/push/deliver.ts pushToHousehold()
      → push_subscriptions of the household (minus the member who caused it)
      → lib/push/web-push.ts sendWebPush()        RFC 8291 encryption + RFC 8292 VAPID, WebCrypto only
      → the browser's push service (Google FCM, Apple, Mozilla, Windows)
  → phone: public/sw.js shows the notification; a tap opens /?tab=…
```

- **Subscribing:** the bell panel's "Upozornění do telefonu" switch (`components/notifications/push-toggle.tsx`) does the following:
  - asks for permission;
  - registers `/sw.js`;
  - subscribes with the server's public key;
  - stores the subscription through `savePushSubscriptionAction` (`app/actions/push.ts`).

  Household and member always come from the session. The switch only appears when the server has push configured.
- **Validation** (`lib/push/subscription.ts`):
  - Only `https` endpoints of the known push services are stored. The server later POSTs to that URL, so anything else would let a member make the server call arbitrary addresses.
  - The keys must be a 65-byte P-256 point and a 16-byte auth secret.
- **One row per device:** the endpoint is unique. Re-subscribing updates the row. A browser used by another account moves to that member.
- **Cleanup:** a 404/410 from the push service deletes the row. Other failures are logged as `push_failed` with the service host, never the endpoint, and the row is kept.
- **iPhone/iPad:** Web Push works only in the app added to the home screen (iOS 16.4+). In a Safari tab the switch explains how to add it.
- **Cloudflare:** everything uses WebCrypto and `fetch`, so the prepared Worker build needs only the same three variables (`.dev.vars.example`).

## Setting it up (owner)

1. Apply the migration: `pnpm db:migrate` (creates `push_subscriptions`, migration 0031).
2. Generate the keys **once**, locally: `pnpm push:vapid-keys`. The script prints them and writes nothing.
3. In Vercel → Project → Settings → Environment Variables (Production and Preview), set:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`, marked as sensitive, never in git or chat
   - `VAPID_SUBJECT`, e.g. `mailto:you@example.com`. Apple rejects senders without a contact.
4. Redeploy. The bell panel now shows "Upozornění do telefonu". Switch it on and press "Poslat zkušební upozornění".

Without the variables the feature is off: no switch, nothing sent. A partial configuration is logged as `push_config_error` and also keeps it off.

**Do not replace the keys later without need.** Existing subscriptions are bound to the public key. After a change, every member has to switch the notifications on again; the app replaces an old subscription when they do.

## Tests

- `lib/push/web-push.test.ts`:
  - the RFC 8291 Appendix A example, byte for byte;
  - decryption as the browser would do it;
  - VAPID JWT claims and signature verification;
  - request headers;
  - gone vs. temporary failures.
- `lib/push/subscription.test.ts`: accepted services, SSRF cases, malformed keys.
- `lib/push/client.test.ts`: what the switch offers per browser (iPhone tab, blocked permission, unsupported).
- `app/actions/push.test.ts` (test database):
  - saving, and moving a device to another account;
  - removing only one's own device;
  - excluding the actor;
  - deleting gone subscriptions.
