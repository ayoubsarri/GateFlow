import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.inasnetwork.checkin",
  appName: "INAS Check-in",
  webDir: "dist",
  server: {
    androidScheme: "https"
  },
  android: {
    allowMixedContent: false,
    captureInput: true
  }
};

export default config;
