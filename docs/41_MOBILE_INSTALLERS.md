# Interní instalační balíčky ANITKA

Mobilní Expo projekt je propojený s EAS projektem [`@mojeanitka/shopping-buddy`](https://expo.dev/accounts/mojeanitka/projects/shopping-buddy), ID `71379d96-272a-4aa5-af0a-940a00b69b44`. Vazba je v `apps/mobile/app.config.ts`.

`apps/mobile/eas.json` definuje profil `internal`:

- Android vytvoří instalovatelný APK.
- iOS vytvoří interně distribuované IPA podepsané pro registrovaná zařízení (Ad Hoc).
- Obě platformy používají veřejnou adresu API `https://mojeanitka.cz`; do aplikace se nevkládají přihlašovací údaje.

## Požadavky pro sestavení

Sestavení běží přes Expo Application Services (EAS Build), takže Android ani iOS nevyžaduje lokální SDK/Xcode. Pro Android už jsou v EAS uložené podpisové údaje. Pro iOS je navíc nutné aktivní členství v Apple Developer Program a registrace každého testovacího zařízení (UDID) do Ad Hoc provisioning profilu.

## Sestavení

Z adresáře `apps/mobile` po přihlášení do EAS:

```bash
eas build --profile internal --platform android
```

APK a instalační odkaz se objeví v detailu sestavení v EAS dashboardu. Profil `internal` používá APK, které lze nainstalovat přímo; Android App Bundle (`.aab`) přímou instalaci nepodporuje. Na telefonu otevřete instalační odkaz, stáhněte APK a potvrďte instalaci z daného zdroje. Odkaz lze otevřít i jako QR kód z dashboardu.

Pro ověření na Android telefonu nejprve nainstalujte APK a přihlaste se testovacím účtem připojeným k domácnosti. Projděte nákupní seznam (přidání, změna množství, odškrtnutí), změnu zásoby ve spíži, vyhledání receptu, plán jídel a fotografii účtenky. U offline režimu zapněte režim Letadlo, změňte seznam a po opětovném připojení ověřte synchronizaci. Skenování čárového kódu a import účtenky vyžadují povolený fotoaparát.

Při ladění bez instalace spusťte `pnpm --filter @shopping-buddy/mobile start` z kořene repozitáře a otevřete QR kód v Expo Go. Fyzický telefon a počítač musí být na stejné síti; API URL pro tento režim nastavte v `apps/mobile/.env` na `https://mojeanitka.cz` nebo na dostupnou adresu lokálního serveru. `pnpm --filter @shopping-buddy/mobile export` pouze vytvoří JavaScriptový bundle, nikoli instalační APK.

Interní sestavení nevydává aplikaci do Google Play ani App Storu a nemění produkční web.
