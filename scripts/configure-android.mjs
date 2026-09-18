import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "android/app/src/main/AndroidManifest.xml");
const buildPath = resolve(root, "android/app/build.gradle");

if (!existsSync(manifestPath) || !existsSync(buildPath)) {
  console.error("Android project is missing. Run: npm run android:add");
  process.exit(1);
}

let manifest = readFileSync(manifestPath, "utf8");
if (!manifest.includes("android.permission.CAMERA")) {
  manifest = manifest.replace(
    "<application",
    '<uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n\n    <application'
  );
}
if (!manifest.includes("android:usesCleartextTraffic")) {
  manifest = manifest.replace("<application", '<application android:usesCleartextTraffic="false"');
}
manifest = manifest
  .replace('android:icon="@mipmap/ic_launcher"', 'android:icon="@drawable/inas_launcher"')
  .replace('android:roundIcon="@mipmap/ic_launcher_round"', 'android:roundIcon="@drawable/inas_launcher"');
writeFileSync(manifestPath, manifest);

const stringsPath = resolve(root, "android/app/src/main/res/values/strings.xml");
if (existsSync(stringsPath)) {
  let strings = readFileSync(stringsPath, "utf8");
  strings = strings.replace(/<string name="app_name">.*?<\/string>/, '<string name="app_name">INAS Check-in</string>');
  strings = strings.replace(/<string name="title_activity_main">.*?<\/string>/, '<string name="title_activity_main">INAS Check-in</string>');
  writeFileSync(stringsPath, strings);
}

const logoSource = readFileSync(resolve(root, "src/assets/inasLogo.ts"), "utf8");
const base64 = logoSource.match(/INAS_LOGO_BASE64 = "([A-Za-z0-9+/=]+)"/)?.[1];
if (!base64) throw new Error("Could not read the INAS logo asset.");
const drawable = resolve(root, "android/app/src/main/res/drawable/inas_logo.png");
mkdirSync(dirname(drawable), { recursive: true });
writeFileSync(drawable, Buffer.from(base64, "base64"));
writeFileSync(resolve(root, "android/app/src/main/res/drawable/inas_launcher.xml"), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#F7FAF8" />
        </shape>
    </item>
    <item android:left="12dp" android:right="12dp" android:top="33dp" android:bottom="33dp">
        <bitmap android:src="@drawable/inas_logo" android:gravity="fill" />
    </item>
</layer-list>
`);

const googleServicesSource = resolve(root, "firebase-config/google-services.json");
if (existsSync(googleServicesSource)) {
  copyFileSync(googleServicesSource, resolve(root, "android/app/google-services.json"));
}

const signingPath = resolve(root, "android/app/signing.gradle");
writeFileSync(signingPath, `android {
    signingConfigs {
        release {
            def path = System.getenv("INAS_KEYSTORE_PATH")
            if (path) {
                storeFile file(path)
                storePassword System.getenv("INAS_KEYSTORE_PASSWORD")
                keyAlias System.getenv("INAS_KEY_ALIAS")
                keyPassword System.getenv("INAS_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv("INAS_KEYSTORE_PATH")) signingConfig signingConfigs.release
        }
    }
}
`);

let build = readFileSync(buildPath, "utf8");
if (!build.includes("signing.gradle")) {
  build += "\napply from: 'signing.gradle'\n";
  writeFileSync(buildPath, build);
}

console.log("Android camera, branding, HTTPS and release-signing configuration applied.");
