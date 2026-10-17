# Interní instalační balíčky ANITKA

`apps/mobile/eas.json` definuje profil `internal` pro oba operační systémy:

- Android vytvoří instalovatelný APK.
- iOS vytvoří interně distribuované IPA podepsané pro registrovaná zařízení (Ad Hoc).
- Oba balíčky používají veřejnou adresu API `https://mojeanitka.cz`; v konfiguraci nejsou žádné přihlašovací ani podpisové údaje.

## Požadavky pro sestavení

Sestavení běží přes Expo Application Services (EAS Build), takže iOS nevyžaduje lokální Mac/Xcode. Je potřeba přihlášený Expo účet s projektem propojeným přes `eas init`. Pro iOS je navíc nutné aktivní členství v Apple Developer Program a registrace každého testovacího zařízení (UDID) do Ad Hoc provisioning profilu. Bez Apple podpisových oprávnění nebo registrace zařízení nelze IPA na daný iPhone nainstalovat. Android APK lze instalovat přímo, pokud uživatel povolí instalaci z daného zdroje.

## Sestavení

Z adresáře `apps/mobile` po přihlášení do EAS a jednorázovém propojení projektu:

```bash
pnpm dlx eas-cli@latest build --profile internal --platform all
```

EAS vytvoří samostatný výsledek pro Android a iOS. Z výsledků sestavení lze sdílet příslušný instalační odkaz podle telefonu uživatele. Pro opakované sestavení jen jedné platformy nahraďte `all` hodnotou `android` nebo `ios`.

Tato konfigurace sama nic nesestavuje ani nevydává. K 2026-10-17 nebyly z tohoto prostředí žádné APK ani IPA vytvořeny: chybí přihlášení/token EAS, Apple podpisové údaje a registrovaná iOS zařízení. Build profil ani CI nemění produkční nasazení webu.
