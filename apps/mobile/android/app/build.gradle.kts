import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing: android/key.properties (never committed, see android/.gitignore) holds storeFile, storePassword,
// keyAlias and keyPassword. CI writes it from the secret vault (docs/15-mobile-release.md).
val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "bh.bcfc.sahel"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // The application ID is set per flavor below. `namespace` above is only the code package (MainActivity).
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Flavors: build with `flutter run --flavor dev --dart-define-from-file=env/dev.json` (see apps/mobile/README.md).
    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            applicationId = "bh.bcfc.sahel.dev"
            resValue("string", "app_name", "Sahel Dev")
            // ⚠️ PLACEHOLDER web host for verified App Links. Keep equal to WEB_ORIGIN in env/dev.json.
            manifestPlaceholders += mapOf("webHost" to "dev.sahel.bcfc.example")
        }
        create("staging") {
            dimension = "env"
            applicationId = "bh.bcfc.sahel.staging"
            resValue("string", "app_name", "Sahel Staging")
            // ⚠️ PLACEHOLDER web host for verified App Links. Keep equal to WEB_ORIGIN in env/staging.json.
            manifestPlaceholders += mapOf("webHost" to "staging.sahel.bcfc.example")
        }
        create("prod") {
            dimension = "env"
            // ⚠️⚠️ MUST MATCH THE LIVE SAHEL LISTING (open questions N5 / P10). Google Play will only accept this build as
            // an UPDATE of the existing Sahel app if the application ID is exactly `com.cbt.bcfc` AND the bundle is
            // signed with the EXISTING upload key (or the app is enrolled in Play App Signing with that key). A
            // different ID or key publishes a new app: existing customers get no update. IT holds the keys.
            applicationId = "com.cbt.bcfc"
            resValue("string", "app_name", "Sahel")
            // ⚠️ PLACEHOLDER web host for verified App Links. Keep equal to WEB_ORIGIN in env/prod.json.
            manifestPlaceholders += mapOf("webHost" to "sahel.bcfc.example")
        }
    }

    signingConfigs {
        create("release") {
            if (keystoreProperties.isNotEmpty()) {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // ⚠️ Without android/key.properties this signs with the debug key so `flutter run --release` works locally.
            // That bundle can NOT be uploaded to Google Play. Release builds in CI must provide key.properties.
            signingConfig = if (keystoreProperties.isNotEmpty()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
