# 15. Mobile Release

> **Status:** Release **configuration** is in place; no native binary has been built yet (the Android SDK and Xcode were not available when this was written). Everything marked **⚠️** is a placeholder or an assumption that needs a real value from BCFC IT, the store accounts, or the web team. Commands are in [apps/mobile/README.md](../apps/mobile/README.md).

## 1. Environments

One build is one environment. The environment is chosen twice, and the two must agree:

1. **Dart-define file** (`--dart-define-from-file=env/<name>.json`): read by `AppConfig` (`apps/mobile/lib/core/config.dart`).
2. **Native flavor** (`--flavor <name>`): sets the application ID, app name, launcher icon and the deep-link host.

| | `dev` | `staging` | `prod` |
|---|---|---|---|
| Dart-define file | `env/dev.json` | `env/staging.json` | `env/prod.json` |
| `APP_ENV` | `dev` | `staging` | `prod` |
| Android application ID | `bh.bcfc.sahel.dev` | `bh.bcfc.sahel.staging` | `com.cbt.bcfc` ⚠️ must match the live listing |
| iOS bundle ID | `bh.bcfc.sahel.dev` | `bh.bcfc.sahel.staging` | `com.cbt.bcfc` ⚠️ VERIFY against App Store id 6443493467 |
| App name | Sahel Dev | Sahel Staging | Sahel |
| Launcher icon | purple tint | amber tint | brand blue |
| Banner on every screen | "Sandbox build" | "Staging build" | none |
| API base URL | `API_BASE_URL` or the local API (`10.0.2.2:3000` on the Android emulator, `localhost:3000` elsewhere) | `https://staging.sahel.bcfc.example` ⚠️ | `https://sahel.bcfc.example` ⚠️ |
| Web origin (deep links) | `https://dev.sahel.bcfc.example` ⚠️ | `https://staging.sahel.bcfc.example` ⚠️ | `https://sahel.bcfc.example` ⚠️ |
| Plain-http API allowed (Android) | yes (`src/dev` manifest only) | no | no |

`AppConfig` exposes `environment`, `apiBaseUrl`, `webOrigin` / `webHost`, and `features.sandboxBanner` (true when the environment is not `prod`). A bad `APP_ENV` or `WEB_ORIGIN` throws at start-up. `API_BASE_URL` still works as before (`--dart-define=API_BASE_URL=...`). A plain `flutter run` with no define file is `dev`.

The hosts ending in `.example` are **placeholders** (that top-level domain can never be registered, so nothing can accidentally claim them). Replace them in **four** places per environment: `env/<name>.json`, `AppConfig.defaultWebOrigins`, `android/app/build.gradle.kts` (`webHost`) and `ios/Flutter/<Flavor>.xcconfig` (`SAHEL_WEB_HOST`). A unit test (`test/session_storage_test.dart`, "build identity stays consistent") fails if they drift apart.

> Never ship a `prod` flavor built with `env/dev.json`: the app would show the sandbox banner and talk to the dev API. The release pipeline must pass `--flavor prod --dart-define-from-file=env/prod.json` together (see §7).

## 2. What the prototype can and cannot do yet

| Done (and tested without native toolchains) | Not done |
|---|---|
| Typed `AppConfig`, env files, environment banner | First Android / iOS binary (never built here) |
| Android product flavors, iOS schemes + xcconfig, per-flavor icons and names | Signing (keys are not in this repo and must not be) |
| Secure session storage (§5) | Real login and token storage (eKey / OIDC) |
| Deep-link resolver (pure Dart, table-tested), router redirect, intent filters, associated domains, `.well-known` templates (§4) | Real domain, Team ID, signing fingerprints; hosting the `.well-known` files on the real domain |
| Launcher icons and splash generated from the brand mark (§6) | Final BCFC brand artwork (the mark is the placeholder `S`) |
| CI smoke build (`flutter build web`) | Native build, signing, store upload jobs |
| This document: pipeline outline, forced update proposal, Huawei notes | Fastlane / Codemagic configuration |

## 3. Bundle IDs and signing (N5, P10)

Sahel is already in **Google Play** (`com.cbt.bcfc`), the **App Store** (id `6443493467`) and **Huawei AppGallery**. Open questions N5 and P10 ask whether Sahel 2.0 can ship as an **update** of those listings. The prototype's `prod` flavor assumes yes:

- **Android:** `applicationId = "com.cbt.bcfc"` in the `prod` flavor (`android/app/build.gradle.kts`). The Kotlin / Java package (`namespace`) stays `bh.bcfc.sahel`; it is independent of the application ID.
  - ⚠️ Google Play only accepts the bundle as an update if the **application ID** matches **and** it is signed with the existing **upload key** (or the app is enrolled in Play App Signing and Google holds the app signing key, in which case any upload key registered for the app works). Wrong ID or key means a new app and no update for existing customers. **Owner: BCFC IT** (Play Console owner).
  - The `version code` must be higher than the live app's (the prototype uses `pubspec.yaml` `version: 2.0.0+1`). ⚠️ Raise the build number above the live app's current version code before the first upload.
- **iOS:** `ios/Flutter/Prod.xcconfig` has `SAHEL_BUNDLE_ID = com.cbt.bcfc`. ⚠️ VERIFY: the App Store id (`6443493467`) is not the bundle ID. Read the real bundle ID in App Store Connect (App Information) and fix `Prod.xcconfig`. A different bundle ID is a different app. Also needs the `SAHEL_DEVELOPMENT_TEAM` (Apple Team ID) of the account that owns the listing. **Owner: BCFC IT** (Apple Developer account holder).
- **Huawei:** see §8.
- **dev / staging** use `bh.bcfc.sahel.dev` / `.staging` so they install next to the live app and never touch its data.

**Signing keys never go in the repository.**

- Android: `android/key.properties` (git-ignored) with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. The release build type uses it when present. Without it, a release build is signed with the **debug key** so `flutter run --release` works locally; that bundle is rejected by Google Play. CI writes `key.properties` and the keystore from the secret vault before a release build.
- iOS: automatic signing locally; CI uses an App Store Connect API key plus fastlane `match` (or Codemagic managed signing).
- Rotate or revoke through the store consoles; never reuse the upload key for dev / staging.

If the answer to N5 is **no** (new listings), change the `prod` application ID and bundle ID, re-key `.well-known`, and plan a migration (in-app message in the old app, data cannot move because sessions are per install).

## 4. Deep links

The same URLs as the web open the same screen in the app: `https://<web host>/{en|ar}/cars/{id}`, `/checkout?...`, `/account`, `/rewards`, `/requests/{id}`, `/claims/{id}`, `/applications/{id}`, `/notifications`, and so on. A `sahel://` custom scheme also works (it does not need a verified domain).

| Layer | What it does | Where |
|---|---|---|
| Android | Intent filter with `android:autoVerify="true"` for `https://${webHost}` with path prefixes `/en` and `/ar`, plus one for `sahel://` | `android/app/src/main/AndroidManifest.xml`; `webHost` placeholder per flavor in `build.gradle.kts` |
| iOS | Associated Domains entitlement `applinks:$(SAHEL_WEB_HOST)`; URL scheme `sahel`; Flutter deep linking enabled | `ios/Runner/Runner.entitlements`, `Info.plist`, `ios/Flutter/<Flavor>.xcconfig` |
| Dart resolver | `resolveDeepLink(url, webOrigin:)`, a pure function: web URL, `sahel://` URL or web path to an app route | `lib/core/deep_links.dart` |
| Router | Top-level go_router `redirect` runs the resolver on any link with a scheme, host or locale prefix; `onException` sends unknown routes home; the link's language (`en` / `ar`) is applied to the app locale | `lib/app.dart` (`buildRouter`) |

**Resolver rules.** Strip the `/en` or `/ar` prefix and apply it as the app language; keep the query string (re-encoded, dropped if over 1024 characters); only the **configured web origin** (https host and port exact, no user info) is trusted; anything else (other hosts, `javascript:`, `file:`, `data:`, protocol-relative `//host`, backslashes, control characters, `..` or encoded `%2e%2e`, empty path segments, `%2F` inside an id, unknown locale, a second locale, ids with characters outside `A-Z a-z 0-9 _ -` or over 80 characters) resolves to **home**. Only routes in the allow-list (the same list as the go_router routes that the web also has) can be opened. Web-only areas (`dealer`, `backoffice`) are not in it.

| Link | Opens |
|---|---|
| `https://<host>/en` or `/ar` | Home (language set) |
| `/{l}/cars`, `/{l}/cars/{id}?requestId=&bidId=` | Cars list, car page (with the bid context) |
| `/{l}/property`, `/{l}/property/{id}` | Property list and page |
| `/{l}/cards`, `/{l}/cards/{id}/apply` | Cards, card application |
| `/{l}/account`, `/{l}/rewards`, `/{l}/assistant`, `/{l}/trade-in?garage=` | Account, rewards, assistant, trade-in |
| `/{l}/checkout?purpose=&amount=&reference=` | Checkout |
| `/{l}/finance/personal`, `/{l}/applications/{id}` | Personal finance, application status |
| `/{l}/insurance`, `/travel`, `/home?propertyId=`, `/medical`, `/life` | Insurance hub and forms |
| `/{l}/life-events`, `/{l}/life-events/{id}?structure=` | Life events |
| `/{l}/claims/new?policyId=&plate=`, `/{l}/claims/{id}` | Claim form, claim status |
| `/{l}/requests/new`, `/{l}/requests/{id}` | Bid request form, bids |
| `/{l}/notifications`, `/{l}/notifications/preferences` | Inbox, preferences |
| `sahel://rewards`, `sahel://cars/{id}`, `sahel:///ar/claims/{id}` | Same, via the custom scheme |

When a new route is added to `app.dart`, add it to the allow-list in `deep_links.dart` (and a row to the test table) if it should be reachable from a link.

### `.well-known` files (served by the web app)

Templates are in `apps/web/public/.well-known/`. Next.js serves `public/` at the site root, so they appear at `https://<host>/.well-known/...`.

| File | For | ⚠️ Placeholders to replace | Owner |
|---|---|---|---|
| `assetlinks.json` | Android App Links | `sha256_cert_fingerprints`: the SHA-256 of the **app signing certificate** (Play Console > App integrity > App signing key certificate; for staging / dev, their own keystores). `REPLACE_...` values make verification fail on purpose | Android release owner (IT) |
| `apple-app-site-association` (no extension) | iOS universal links | `REPLACE_TEAM_ID` (Apple Team ID); the bundle IDs after `.` must match `Prod.xcconfig` | iOS release owner (IT) |

Notes:

- **Trim before production.** The templates list the staging and dev apps too, so the same file works on every environment's host. On the **production** host, keep only the `com.cbt.bcfc` entries.
- Both must be served over HTTPS with **no redirect**, `200`, and `Content-Type: application/json`. `assetlinks.json` gets the right type from its extension. `apple-app-site-association` has no extension, and `next start` serves it as `application/octet-stream` (checked). Apple documents `application/json`, so **add this** to the `headers()` list in `apps/web/next.config.ts` before relying on universal links (not done here, that file is owned elsewhere): `{ source: '/.well-known/apple-app-site-association', headers: [{ key: 'Content-Type', value: 'application/json' }] }`. The existing CSP and other security headers do not affect these files.
- Apple caches these files through its CDN, so a change can take days to reach devices. Test with the `sahel://` scheme or `adb shell am start -W -a android.intent.action.VIEW -d "https://<host>/en/rewards"`.
- Verify Android with `adb shell pm get-app-links <applicationId>` (state should be `verified`) and Google's Digital Asset Links tester; iOS with `xcrun simctl openurl booted "https://<host>/en/rewards"` on a build that has the Associated Domains capability (needs a paid Apple Developer team).
- `sahel://` is registered by every flavor; with dev, staging and prod installed together the OS may ask which app to open. Use the https links to target one.

## 5. Secure session storage

The sandbox customer session id (`X-Sahel-Session`) is now kept in **Keychain** (iOS, `first_unlock_this_device`: not synced or backed up to other devices) and **Keystore-backed encrypted storage** (Android, `allowBackup` is off so it is not restored from a cloud backup) through `flutter_secure_storage`.

- **Restore** on the first request after launch; a value that does not look like an API-issued id (16 to 128 URL-safe characters) is treated as corrupted, deleted, and a new session starts.
- **Persist** whenever the API issues a new id; **clear** on a 401 response (and via `SandboxSession.clear()`, which logout will call).
- **Fallback:** if storage throws (locked keystore, restore from backup on a new device, OEM bug) the id lives in memory for that run; the app keeps working.
- **Web build:** `MemorySessionStore` (a browser has the HttpOnly cookie model instead; no tokens in `localStorage`, see [12](12-web-platform.md)).
- The id is never logged and `SandboxSession.toString()` hides it. Storage is injectable (`SessionStore`) so tests use a fake. Code: `lib/core/api/session.dart`, `session_store.dart`; tests: `test/session_storage_test.dart`.
- This is **sandbox** data (the id of a fictional demo customer). When real login arrives, the same store holds the refresh token; access tokens stay in memory.

## 6. App identity

- **Brand mark:** the `S` on the brand colour (`#0B4F8A`, `packages/design-tokens`), the same look as `apps/web/public/icon.svg`, drawn as a path so no font is needed. ⚠️ Placeholder until the BCFC brand guidelines are applied. `apps/mobile/tool/render_brand_assets.mjs` renders `assets/brand/*.png` (1024 px icons for prod, dev, staging; the adaptive-icon foreground; the splash mark) with `sharp`.
- **Launcher icons:** `flutter_launcher_icons` (dev dependency) with `flutter_launcher_icons.yaml` (prod) and `-dev.yaml` / `-staging.yaml`. Generated and committed: Android `mipmap-*` (prod in `main`, dev and staging in `src/dev` and `src/staging`) with adaptive icons, and iOS `AppIcon`, `AppIcon-dev`, `AppIcon-staging` (the flavor's xcconfig selects it with `SAHEL_APP_ICON`). The prod icon has no alpha channel (App Store rule).
- **Splash:** `flutter_native_splash` with `flutter_native_splash.yaml` (brand colour and white mark, Android 12 splash included). Generated and committed.
- **App name per flavor:** Android `resValue app_name` ("Sahel", "Sahel Dev", "Sahel Staging"); iOS `CFBundleDisplayName = $(SAHEL_APP_NAME)`.
- **Permissions:** Android declares only `INTERNET` (release builds need it; it used to exist only in the debug manifest). The claim photos use the system camera and photo picker through `image_picker`, which need no Android permission. iOS has `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` for the claim photos. **Location is used by the web only**; the app declares no location permission. Add strings and permissions together with the feature that needs them, and keep the App Store privacy answers and Play data-safety form in step.
- **Minimum OS versions:** Android API 24 (Android 7.0), the Flutter default (`flutter.minSdkVersion`); iOS 15.0 (`IPHONEOS_DEPLOYMENT_TARGET`). Raise them deliberately; `flutter_secure_storage` needs Android 6+ and iOS 13+.
- **Regenerate** after changing the mark: `node apps/mobile/tool/render_brand_assets.mjs`, then in `apps/mobile`: `dart run flutter_launcher_icons` (processes the dev and staging flavor files) and the prod icon with the flavor files moved aside, `dart run flutter_launcher_icons -f flutter_launcher_icons.yaml`, then `dart run flutter_native_splash:create`. Check `git diff ios/Runner.xcodeproj/project.pbxproj`: the icon tool may rewrite a build setting (`ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS`); revert any such change.

## 6a. Native project changes to check on the first real build

These were written by hand (no Android SDK or Xcode here), so the first native build is the real test:

- Android: `./gradlew` flavor tasks (`assembleDevDebug`), manifest placeholders, `resValue`, and the `release` signing config.
- iOS: the nine build configurations per target (`Debug-dev`, `Release-dev`, `Profile-dev`, ...), schemes `dev`, `staging`, `prod` (the old `Runner` scheme is gone, so `flutter run` needs `--flavor`), `Runner.entitlements`. Open `Runner.xcodeproj` once in Xcode and confirm Signing & Capabilities shows Associated Domains for each configuration.
- If a plugin that needs CocoaPods is added later (the current plugins use Swift Package Manager), add the flavor configurations to the `Podfile` `project 'Runner', {...}` map.

## 7. CI and release pipeline

### CI today (`.github/workflows/ci.yml`, job `mobile`)

`flutter pub get` (pub cache cached), `flutter analyze`, `flutter test`, then a **smoke build**: `flutter build web --dart-define-from-file=env/dev.json`. This compiles the whole app with the new configuration on the web target, which needs no native SDK. (The project has no `web/` folder on purpose; the job scaffolds one with `flutter create . --platforms web` and commits nothing.) It does not exercise Android or iOS code. There are no signing or release jobs.

### Pipeline to build (outline; fastlane on GitHub Actions macOS runners, or Codemagic)

Per [10-team-repo-devops.md](10-team-repo-devops.md) §5. Signing material lives in the CI secret vault, never in the repo.

1. **Every merge to `main`:** analyze, test, web smoke build (today), then native builds of `dev` (Android APK + iOS simulator) as artifacts.
2. **Release candidate (tag `mobile-v2.x.y`)**, `prod` flavor with `env/prod.json`:
   - Android: write `key.properties` + keystore from secrets, `flutter build appbundle --release --flavor prod --dart-define-from-file=env/prod.json --obfuscate --split-debug-info=build/symbols`, then upload to **Play Internal Testing** (fastlane `supply`).
   - iOS: `match` for certificates and profiles, `flutter build ipa --release --flavor prod --dart-define-from-file=env/prod.json --obfuscate --split-debug-info=build/symbols`, upload to **TestFlight** (fastlane `pilot`).
   - Huawei: separate job and flavor, see §8; upload to **AppGallery testing**.
   - Upload the split-debug-info symbols to the crash reporter.
   - `staging` builds go to the same internal tracks (different application ID), signed with a non-prod key.
3. **Promotion (manual approval):** Play internal, closed, production; TestFlight, App Store review, release; AppGallery testing, production.
4. **Staged rollout:** 1%, 10%, 50%, 100% (Play staged rollout; App Store phased release; AppGallery staged release). Gate each step on **crash-free sessions of at least 99.5%** and no spike in API errors. Halt or roll back (Play: halt rollout; App Store: pause phased release).
5. **Web and mobile versions share feature flags**, so a feature can be switched on for both channels together.

### Forced update (proposal only, not implemented)

For security fixes, the app must be able to refuse to run an old version. Proposal: add to **`GET /api/v1/config`** (a public, cacheable endpoint, see `api/openapi.yaml`) an optional block:

```json
"app": {
  "minimumVersion": { "ios": "2.0.0", "android": "2.0.0", "huawei": "2.0.0" },
  "recommendedVersion": { "ios": "2.1.0", "android": "2.1.0", "huawei": "2.1.0" },
  "storeUrl": { "ios": "https://apps.apple.com/app/id6443493467", "android": "https://play.google.com/store/apps/details?id=com.cbt.bcfc", "huawei": "..." }
}
```

The app compares its own version (`package_info_plus`, build number) on launch and on resume: below `minimumVersion` shows a blocking "Update required" screen with a store button; below `recommendedVersion` a dismissible banner. Rules: the version is compared as numbers, never as strings; if the config cannot be fetched the app keeps working (fail open, so an outage cannot lock customers out); the minimum is a business decision made by the release owner, not by Dart code (no business logic in Dart). Needs an OpenAPI change, an API change, a Flutter screen, new `mob` strings in both languages and tests. This replaces the "Remote Config" wording in 10 §5 without adding a vendor.

## 8. Huawei AppGallery

Sahel is also on **Huawei AppGallery** (Huawei phones have no Google services). A `huawei` flavor is **not** added yet, and **no HMS dependency** is in the project. This section is the plan.

**What is store-agnostic today.** The app uses none of the Google-only or Huawei-only services: no Firebase / FCM, no Google Maps, no Google Sign-In, no in-app purchase, no Play Services. The HTTP client, secure storage (Keystore, no Play Services needed), `image_picker`, `qr_flutter` and the web-style deep links work on both. So the same Dart code runs on Huawei devices.

**What replaces what.**

| Need | Google devices | Huawei devices |
|---|---|---|
| Push (not built yet: notifications are derived in the API, nothing is sent) | FCM | **HMS Core Push Kit** (`huawei_push`) |
| Maps (not used yet; the web has none either) | Google Maps | **HMS Map Kit** (`huawei_map`) |
| Install / update check | Play | AppGallery |
| Analytics, crash reporting | choose a vendor that works without Google Services (or both) | same |

**To do before submitting to AppGallery.**

1. Create the AppGallery Connect project and app; ⚠️ the existing listing's **package name** must match (the live Huawei listing may use `com.cbt.bcfc` or something else: verify, owner IT). Add an `agconnect-services.json` (secret, not committed).
2. Add a `huawei` productFlavor (same `env` dimension, `applicationId` as the listing, name "Sahel") with `agconnect` Gradle plugin and the HMS Maven repository **only in that flavor** so Google builds stay free of HMS.
3. Put push and maps behind small Dart interfaces (`PushService`, `MapService`) with one implementation per store, chosen by a `STORE` dart-define (`google`, `huawei`, `apple`). Only when push is built: nothing is sent today.
4. Sign with the Huawei key (separate from the Play key); register its SHA-256 for AppGallery Connect and add the Huawei app to `assetlinks.json` only if its package name differs. Huawei does not verify App Links the same way: expect to rely on the `sahel://` scheme and a browser chooser.
5. Test on a real Huawei device without Google Services (secure storage, image picker, deep links).
6. Upload to AppGallery testing, then production with a staged release. Review needs the privacy policy URL and permission justifications (§6).

## 9. Release checklist

**Decisions and accounts (owner: BCFC IT unless noted)**

- [ ] N5 / P10 answered: same listings and IDs. Access to Play Console, App Store Connect, AppGallery Connect
- [ ] ⚠️ Real bundle IDs confirmed (Android `com.cbt.bcfc`; iOS read from App Store Connect; Huawei package)
- [ ] ⚠️ Existing Android upload key (or Play App Signing) available to CI; Apple Team ID and distribution certificate / `match` repo; Huawei signing key
- [ ] ⚠️ Real web domains for dev, staging, prod; `.well-known` files updated (fingerprints, Team ID) and served with 200, no redirect, JSON
- [ ] ⚠️ Real API base URLs in `env/staging.json` and `env/prod.json`; hosts in `AppConfig.defaultWebOrigins`, `build.gradle.kts`, `*.xcconfig` equal to the env files (test passes)
- [ ] BCFC brand artwork replaces the placeholder mark; icons and splash regenerated (§6)

**Build and verify**

- [ ] Version name and a build number above the live app's
- [ ] First native builds of `dev` and `staging` on real devices (Android and iOS); sandbox banner visible; app name and icon per flavor
- [ ] `prod` build has no banner, points to the prod API, signs with the release key (not debug)
- [ ] Deep links verified on Android (`pm get-app-links` = verified) and iOS for `/en` and `/ar` URLs, cold start and warm start; Arabic link switches the app to Arabic
- [ ] Secure storage: kill and relaunch keeps the session; 401 clears it; app works with storage failing
- [ ] RTL and Arabic checked on a small Android and an iPhone SE class device
- [ ] Obfuscation (`--obfuscate --split-debug-info`) on, symbols uploaded; RASP / jailbreak decision made (security, [07](07-security-compliance.md))
- [ ] Privacy policy URL, App Store privacy answers, Play data-safety form, permission justifications (camera, photos)
- [ ] Penetration test of web and mobile for this release cycle ([12](12-web-platform.md))

**Roll out**

- [ ] TestFlight, Play Internal and AppGallery testing sign-off by QA
- [ ] Staged rollout 1% to 10% to 50% to 100% with the crash-free sessions gate of 99.5%
- [ ] Forced-update field in `GET /config` available before the first security fix is needed (§7, proposal)
- [ ] Rollback plan agreed (halt rollout, previous build kept available)
