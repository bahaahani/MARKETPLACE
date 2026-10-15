# Sahel 2.0 — Flutter mobile app

iOS, Android, and Huawei. See the [root README](../../README.md) for how to run and test.

- Renders what **API v1** returns (`../../api/openapi.yaml`). Pricing and rules live in `packages/domain`, never in Dart.
- Strings (`lib/l10n/*.arb`) and tokens (`lib/core/theme/tokens.g.dart`) are **generated** by `npm run gen`. Edit `packages/i18n` and `packages/design-tokens` instead.
- Bundle IDs: dev `bh.bcfc.sahel.dev`, staging `bh.bcfc.sahel.staging`, prod `com.cbt.bcfc`. ⚠️ Prod must match the live Sahel listing (`com.cbt.bcfc` on Android, App Store id `6443493467`) and be signed with the existing upload key. See open question N5 and [docs/15-mobile-release.md](../../docs/15-mobile-release.md).

## Environments and flavors

An environment is a Dart-define file **and** a native flavor of the same name. Always pass both:

```bash
cd apps/mobile && flutter pub get
flutter run   --flavor dev     --dart-define-from-file=env/dev.json       # local API (10.0.2.2:3000 on the Android emulator)
flutter run   --flavor staging --dart-define-from-file=env/staging.json
flutter build appbundle --release --flavor prod --dart-define-from-file=env/prod.json   # Android
flutter build ipa       --release --flavor prod --dart-define-from-file=env/prod.json   # iOS
```

| Flavor | Android ID / iOS bundle ID | App name | Banner |
|---|---|---|---|
| `dev` | `bh.bcfc.sahel.dev` | Sahel Dev | "Sandbox build" |
| `staging` | `bh.bcfc.sahel.staging` | Sahel Staging | "Staging build" |
| `prod` | `com.cbt.bcfc` (⚠️ verify, iOS especially) | Sahel | none |

`env/*.json` keys (all optional): `APP_ENV` (`dev` / `staging` / `prod`), `API_BASE_URL`, `WEB_ORIGIN` (the web host that deep links use). `--dart-define=API_BASE_URL=...` still works. The typed `AppConfig` is in `lib/core/config.dart`. Hosts ending in `.example` and the empty Apple Team ID are ⚠️ placeholders.

Without Android or iOS tooling, check that everything compiles on the web target (CI does this):

```bash
flutter create . --platforms web --project-name sahel   # scaffolds web/ (not committed); then delete test/widget_test.dart
flutter build web --dart-define-from-file=env/dev.json
```

## Secure session storage and deep links

- The sandbox session id is kept in Keychain / Keystore (`lib/core/api/session.dart`, `session_store.dart`), restored on launch, cleared on logout or a 401. Tests use a fake store.
- `https://<web host>/{en|ar}/...` and `sahel://...` open the matching screen (`lib/core/deep_links.dart`, wired in `lib/app.dart`). Add a route to the allow-list there when you add one to the router. Domain verification templates: `../web/public/.well-known/`.

## App icons and splash

Brand assets are in `assets/brand/` (rendered from the brand mark by `node apps/mobile/tool/render_brand_assets.mjs` from the repo root). Generated and committed; regenerate after changing the mark:

```bash
dart run flutter_launcher_icons                              # dev and staging icons (flavor files)
dart run flutter_launcher_icons -f flutter_launcher_icons.yaml   # prod icon (move the -dev / -staging files aside first; the tool always picks flavor files up)
dart run flutter_native_splash:create
```

Then revert any change the icon tool makes to `ios/Runner.xcodeproj/project.pbxproj`.

## Minimum OS versions

Android 7.0 (API 24, Flutter default), iOS 15.0.

## Tests

`flutter analyze && flutter test` (needs `npm run gen` and `flutter gen-l10n` first when strings change).
