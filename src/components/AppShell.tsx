import { BarChart3, ClipboardCheck, Languages, QrCode, Settings, UsersRound, Wifi, WifiOff } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { copy } from "../lib/i18n";
import type { AppView, EventRecord, Language } from "../types";

interface AppShellProps {
  event: EventRecord;
  activeView: AppView;
  language: Language;
  online: boolean;
  stationName: string;
  children: React.ReactNode;
  onViewChange: (view: AppView) => void;
  onLanguageChange: (language: Language) => void;
}

const navItems = [
  { id: "scan" as const, icon: QrCode, key: "scan" as const },
  { id: "people" as const, icon: UsersRound, key: "people" as const },
  { id: "confirmations" as const, icon: ClipboardCheck, key: "confirmations" as const },
  { id: "dashboard" as const, icon: BarChart3, key: "dashboard" as const },
  { id: "settings" as const, icon: Settings, key: "settings" as const }
];

export function AppShell({ event, activeView, language, online, stationName, children, onViewChange, onLanguageChange }: AppShellProps) {
  const t = copy[language];
  const statusText = event.status === "live" ? t.live : event.status === "draft" ? t.draft : t.closed;

  return (
    <div className={`app-shell app-shell--${activeView}`} dir={language === "ar" ? "rtl" : "ltr"}>
      <aside className="sidebar">
        <BrandLogo compact />
        <div className="sidebar-event">
          <span className={`status-dot status-dot--${event.status}`} />
          <strong>{statusText}</strong>
        </div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map(({ id, icon: Icon, key }) => (
            <button key={id} className={activeView === id ? "active" : ""} onClick={() => onViewChange(id)}>
              <Icon size={21} />
              <span>{t[key]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-station">
          <span>{t.station}</span>
          <strong>{stationName}</strong>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-brand"><BrandLogo compact /></div>
          <div className="topbar-actions">
            <span className="station-chip">{t.station} {stationName}</span>
            <div className={`connection-pill ${online ? "is-online" : "is-offline"}`} title={online ? t.online : t.offline}>
              {online ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span>{online ? t.online : t.offline}</span>
            </div>
            <button className="icon-button language-toggle" onClick={() => onLanguageChange(language === "ar" ? "en" : "ar")} aria-label={t.language}>
              <Languages size={18} />
              <span>{language === "ar" ? "EN" : "ع"}</span>
            </button>
          </div>
        </header>
        <div className="content-area">{children}</div>
      </div>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navItems.map(({ id, icon: Icon, key }) => (
          <button key={id} className={activeView === id ? "active" : ""} onClick={() => onViewChange(id)}>
            <Icon size={22} />
            <span>{t[key]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
