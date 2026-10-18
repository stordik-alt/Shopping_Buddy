# Neon Auth: oprava `get-session` HTTP 500 po přesunu projektu

Provozní postup. Nic z něj se neprovádí automaticky; nebylo ověřeno proti živé databázi ani proti logům Neonu (request ID `87a4989a-1659-4862-b23a-7f11ad553dc0` může dohledat jen podpora Neonu).

## Příznak
`POST /sign-in/email` vrací 200 a cookie, `GET /get-session` s touto cookie vrací 500 s prázdným tělem. Chyba vzniká přímo na Neon Auth endpointu, ne v aplikaci.

## Pravděpodobné příčiny (hypotézy)
1. Řádek `neon_auth.jwks` z původního projektu: jeho privátní klíč je zašifrovaný tajemstvím starého projektu, nový backend ho nedešifruje. Veřejný JWKS přitom vrací 200, protože publikuje jen veřejnou část.
2. Dva řádky v `neon_auth.project_config` (starý projekt a `Moje-Anitka`): backend může použít špatný.
3. Změněné cookie secrety zneplatnily existující session cookies (očekávané, uživatelé se znovu přihlásí).

Kopírování celého interního schématu `neon_auth` (`project_config`, `jwks`, `session`) není podporovaný postup; přenášejí se jen uživatelská data (`user`, `account`). Potvrďte u podpory Neonu.

## Postup
1. Vytvořte Neon branch z produkce (záloha). Nic nemažte před dokončením kopie.
2. Otevřete ticket u Neonu: project ID, branch ID, `x-neon-ret-request-id`, `x-trace-id`, čas testu.
3. Na testovací branchi:
   - smažte jen starý řádek `project_config` (starý projekt),
   - smažte řádek v `jwks` (backend vygeneruje nový klíč),
   - smažte řádky v `session` (a případně `verification`),
   - `user` a `account` neměňte: hesla zůstanou jako hashe.
4. Ověřte `sign-in/email` -> `get-session` s novou cookie a registraci nového uživatele.
5. Až pak stejný postup na produkci.
6. Pokud po opravě hesla nefungují, ověřte kompatibilitu formátu hashe v `account.password`; jinak reset hesla e-mailem.

## Kontrola aplikace (Cloudflare Worker)
- `NEON_AUTH_BASE_URL` míří na nový endpoint.
- Cookie secret je nastaven a shodný ve všech prostředích.
- `https://mojeanitka.cz` je trusted origin v nové konfiguraci.
