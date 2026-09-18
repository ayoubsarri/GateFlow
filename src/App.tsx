import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { BrandLogo } from "./components/BrandLogo";
import { LoginScreen } from "./components/LoginScreen";
import { makeDemoSnapshot } from "./data/demo";
import { getEventClient, waitForAuthState } from "./lib/api";
import { enabledEntrances, loadEntrances, saveEntrances } from "./lib/entrances";
import { copy } from "./lib/i18n";
import { flushOfflineQueue, getOfflineQueue } from "./lib/offlineQueue";
import { ConfirmationsScreen } from "./screens/ConfirmationsScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { PeopleScreen } from "./screens/PeopleScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import type { AppView, EntranceConfig, EntranceName, EventSnapshot, Language, StaffSession } from "./types";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __inasInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

const client = getEventClient();

export default function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("inas-language") as Language) || "ar");
  const [view, setView] = useState<AppView>("scan");
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [entrances, setEntrances] = useState<EntranceConfig[]>(() => loadEntrances());
  const [snapshot, setSnapshot] = useState<EventSnapshot>(() => makeDemoSnapshot());
  const [online, setOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(() => getOfflineQueue().length);
  const [dataError, setDataError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(() => window.__inasInstallPrompt || null);

  const direction = language === "ar" ? "rtl" : "ltr";
  const t = copy[language];

  const changeLanguage = (next: Language) => {
    localStorage.setItem("inas-language", next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    setLanguage(next);
  };

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [direction, language]);

  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    const onOnline = () => {
      setOnline(true);
      void flushOfflineQueue(client).then(() => setQueueCount(getOfflineQueue().length)).catch(() => undefined);
    };
    const onOffline = () => setOnline(false);
    const onQueueUpdate = () => setQueueCount(getOfflineQueue().length);
    const onInstall = (event: Event) => {
      event.preventDefault();
      const prompt = event as BeforeInstallPromptEvent;
      window.__inasInstallPrompt = prompt;
      setInstallPrompt(prompt);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("inas-queue-updated", onQueueUpdate);
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("inas-queue-updated", onQueueUpdate);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await waitForAuthState();
      const active = await client.hasSession();
      if (!mounted) return;
      if (active) {
        const saved = localStorage.getItem("inas-station") as EntranceName | null;
        const activeEntrances = enabledEntrances(entrances);
        setSession({ stationName: saved && activeEntrances.includes(saved) ? saved : activeEntrances[0] || "A", expiresAt: new Date(Date.now() + 12 * 60 * 60_000).toISOString(), demo: client.demo });
      }
      setBooting(false);
    })();
    return () => { mounted = false; };
  }, [entrances]);

  useEffect(() => {
    if (!session) return;
    const unsubscribe = client.subscribe(
      (next) => { setSnapshot(next); setDataError(null); },
      (error) => setDataError(error.message)
    );
    return unsubscribe;
  }, [session]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => window.cancelAnimationFrame(frame);
  }, [session, view]);

  const signIn = async (pin: string, stationName: string) => {
    const nextSession = await client.startSession(pin, stationName);
    setSession(nextSession);
    return nextSession;
  };

  const signOut = async () => {
    await client.endSession();
    setSession(null);
    setView("scan");
  };

  const install = async () => {
    const prompt = installPrompt || window.__inasInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    window.__inasInstallPrompt = null;
    setInstallPrompt(null);
  };

  const updateEntrances = (next: EntranceConfig[]) => {
    const normalized = saveEntrances(next);
    setEntrances(normalized);
  };

  if (booting) {
    return <main className="boot-screen" dir={direction}><BrandLogo /><LoaderCircle className="spin" size={28} /><span>{t.loading}</span></main>;
  }

  if (!session) {
    return <LoginScreen language={language} entrances={enabledEntrances(entrances)} onLanguageChange={changeLanguage} onSubmit={signIn} />;
  }

  return (
    <AppShell
      event={snapshot.event}
      activeView={view}
      language={language}
      online={online}
      stationName={session.stationName}
      onViewChange={setView}
      onLanguageChange={changeLanguage}
    >
      {queueCount > 0 && (
        <div
          role="status"
          style={{
            background: "#dfad24",
            color: "#062f33",
            padding: "8px 14px",
            textAlign: "center",
            fontWeight: 700,
            fontSize: "0.82rem",
            borderRadius: "8px",
            margin: "8px 14px 0"
          }}
        >
          {language === "ar"
            ? `قيد الانتظار: ${queueCount} عمليات مسح غير متزامنة (سيتم الرفع تلقائياً عند توفر الاتصال)`
            : `Pending Sync: ${queueCount} offline scan(s) queued for sync`}
        </div>
      )}
      {dataError && <div className="global-error">{dataError}</div>}
      {view === "scan" && <ScanScreen language={language} status={snapshot.event.status} client={client} online={online} />}
      {view === "people" && <PeopleScreen language={language} participants={snapshot.participants} client={client} />}
      {view === "confirmations" && <ConfirmationsScreen language={language} participants={snapshot.participants} client={client} />}
      {view === "dashboard" && <DashboardScreen language={language} stats={snapshot.stats} recent={snapshot.recent} participants={snapshot.participants} />}
      {view === "settings" && <SettingsScreen language={language} stationName={session.stationName} entrances={entrances} installAvailable={Boolean(installPrompt)} onEntrancesChange={updateEntrances} onLanguageChange={changeLanguage} onInstall={() => void install()} onSignOut={() => void signOut()} />}
    </AppShell>
  );
}
