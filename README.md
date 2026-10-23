# Shopping_Buddy

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_h97X26r4vqtvPcewfzkkTUhbJtTQ)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Mobile app (Expo)

The React Native + Expo (SDK 57, Expo Router, TypeScript) app lives in `apps/mobile`. It connects to the same backend as the web app and includes sign-in, a shopping list with offline changes, budget and pantry screens, recipes, meal planning, barcode scanning, and receipt imports.

```bash
pnpm install                                  # from the repository root (pnpm workspace)
cp apps/mobile/.env.example apps/mobile/.env
pnpm --filter @shopping-buddy/mobile start    # start the Expo dev server; press a for Android
pnpm --filter @shopping-buddy/mobile typecheck
pnpm --filter @shopping-buddy/mobile export   # verify the Android JS bundle; this is not an APK
```

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to the backend URL. The example uses `http://localhost:3000`; on a physical device use the computer's LAN address, and in the Android emulator use `http://10.0.2.2:3000`. This value is public app configuration; never put secrets in the mobile app.

To create an APK for a physical Android phone, run `eas build --profile internal --platform android` from `apps/mobile`. Download and install the artifact from its EAS build page. See [the mobile installer guide](docs/41_MOBILE_INSTALLERS.md) for setup and device testing steps.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
