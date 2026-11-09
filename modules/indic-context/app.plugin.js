// app.plugin.js — Expo Config Plugin for indic-context local module
// Runs during `npx expo prebuild` to patch AndroidManifest.xml with:
//   • SYSTEM_ALERT_WINDOW permission
//   • OverlayService registration
//   • ChatAccessibilityService registration
//   • FOREGROUND_SERVICE permission

const {
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ─── Helper: add a <uses-permission> if not already present ───────────────────
function addPermission(manifest, permissionName) {
  if (!manifest['uses-permission']) {
    manifest['uses-permission'] = [];
  }
  const already = manifest['uses-permission'].some(
    (p) => p.$['android:name'] === permissionName
  );
  if (!already) {
    manifest['uses-permission'].push({ $: { 'android:name': permissionName } });
  }
}

// ─── Helper: add a <service> entry if not already present ────────────────────
function addService(application, serviceDef) {
  if (!application.service) {
    application.service = [];
  }
  const already = application.service.some(
    (s) => s.$['android:name'] === serviceDef.$['android:name']
  );
  if (!already) {
    application.service.push(serviceDef);
  }
}

// ─── Step 1: Patch AndroidManifest.xml ───────────────────────────────────────
function withIndicContextManifest(expoConfig) {
  return withAndroidManifest(expoConfig, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application[0];

    // Permissions
    addPermission(manifest, 'android.permission.SYSTEM_ALERT_WINDOW');
    addPermission(manifest, 'android.permission.FOREGROUND_SERVICE');
    addPermission(manifest, 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE');
    addPermission(manifest, 'android.permission.FOREGROUND_SERVICE_MICROPHONE');
    addPermission(manifest, 'android.permission.RECORD_AUDIO');
    addPermission(manifest, 'android.permission.INTERNET');

    // OverlayService — draws the floating copilot panel
    addService(application, {
      $: {
        'android:name': 'com.indiccontext.OverlayService',
        'android:exported': 'false',
        'android:foregroundServiceType': 'specialUse|microphone',
      },
    });

    // ChatAccessibilityService — reads visible chat bubbles
    addService(application, {
      $: {
        'android:name': 'com.indiccontext.ChatAccessibilityService',
        'android:exported': 'true',
        'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } },
          ],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.accessibilityservice',
            'android:resource': '@xml/indic_accessibility_config',
          },
        },
      ],
    });

    return config;
  });
}

// ─── Step 2: Ensure strings.xml has accessibility_service_description ─────────
function withIndicContextStrings(expoConfig) {
  return withStringsXml(expoConfig, (config) => {
    config.modResults = config.modResults || { resources: { string: [] } };
    const strings = config.modResults.resources.string || [];
    const text =
      'ConvoAI reads the visible chat text in supported messaging apps to provide contextual AI suggestions, smart replies and deadline reminders. Chats are never stored; only the reminders it sets are saved on your phone.';
    const existing = strings.find((s) => s.$.name === 'accessibility_service_description');
    if (existing) {
      existing._ = text; // keep the description in sync with the app name on every prebuild
    } else {
      strings.push({ $: { name: 'accessibility_service_description' }, _: text });
    }
    config.modResults.resources.string = strings;
    return config;
  });
}

// ─── Step 3: Copy accessibility config XML into android/app/src/main/res/xml/ ─
function withIndicContextResources(expoConfig) {
  return withDangerousMod(expoConfig, [
    'android',
    (config) => {
      const srcXml = path.join(
        __dirname,
        'android/src/main/res/xml/indic_accessibility_config.xml'
      );
      const destDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/xml'
      );
      const destXml = path.join(destDir, 'indic_accessibility_config.xml');

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcXml, destXml);

      return config;
    },
  ]);
}

// ─── Compose and export ───────────────────────────────────────────────────────
module.exports = (config) => {
  config = withIndicContextManifest(config);
  config = withIndicContextStrings(config);
  config = withIndicContextResources(config);
  return config;
};
