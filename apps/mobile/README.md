# Sahel 2.0 — Flutter mobile app

iOS, Android, and Huawei. See the [root README](../../README.md) for how to run and test.

- Renders what **API v1** returns (`../../api/openapi.yaml`). Pricing and rules live in `packages/domain`, never in Dart.
- Strings (`lib/l10n/*.arb`) and tokens (`lib/core/theme/tokens.g.dart`) are **generated** by `npm run gen`. Edit `packages/i18n` and `packages/design-tokens` instead.
- ⚠️ The bundle ID is currently `bh.bcfc.sahel`. To ship as an update to the existing Sahel listing it must match the live app (`com.cbt.bcfc` on Android, App Store id `6443493467`). See open question N5.
