import { BarChart3, CalendarDays, ClipboardCheck, Languages, QrCode, Settings, ShieldCheck, Tv, UsersRound, Wifi, WifiOff } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { copy } from "../lib/i18n";
import type { AppView, EventRecord, Language, UserRole } from "../types";

interface AppShellProps {
  event: EventRecord;
  activeView: AppView;
  language: Language;
  online: boolean;
  stationName: string;
  role?: UserRole;
  children: React.ReactNode;
  onViewChange: (view: AppView) => void;
  onLanguageChange: (language: Language) => void;
}

const allNavItems = [
  { id: "scan" as const, icon: QrCode, key: "scan" as const },
  { id: "people" as const, icon: UsersRound, key: "people" as const },
  { id: "dashboard" as const, icon: BarChart3, key: "dashboard" as const },
  { id: "event" as const, icon: CalendarDays, key: "event" as const, adminOnly: true },
  { id: "confirmations" as const, icon: ClipboardCheck, key: "confirmations" as const },
  { id: "settings" as const, icon: Settings, key: "settings" as const }
];

export function AppShell({ event, activeView, language, online, stationName, role = "admin", children, onViewChange, onLanguageChange }: AppShellProps) {
  const t = copy[language];
  const statusText = event.status === "live" ? t.live : event.status === "draft" ? t.draft : t.closed;
  const navItems = allNavItems.filter((item) => !item.adminOnly || role === "admin");

  return (
    <div className={`app-shell app-shell--${activeView}`} dir={language === "ar" ? "rtl" : "ltr"}>
      <aside className="sidebar">
        <BrandLogo compact customLogo={event.logoUrl} />
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
          <span>{role === "admin" ? t.admin : t.station}</span>
          <strong>{role === "admin" ? "Admin" : stationName}</strong>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-brand"><BrandLogo compact customLogo={event.logoUrl} /></div>
          <div className="topbar-actions">
            <button
              className="icon-button welcome-board-launch-btn"
              onClick={() => onViewChange("welcome-board")}
              title={language === "ar" ? "شاشة الترحيب للحضور (Kiosk / TV)" : "Public Welcome Board (Kiosk / TV)"}
              aria-label={t.welcomeBoard}
            >
              <Tv size={18} />
            </button>
            {role === "admin" ? (
              <span className="admin-chip" title="Full System Administrator Access">
                <ShieldCheck size={14} />
                <span>ADMIN</span>
              </span>
            ) : (
              <span className="station-chip">
                <span className="station-chip__label">{t.station}</span>
                <strong>{stationName}</strong>
              </span>
            )}
            <div className={`connection-pill ${online ? "is-online" : "is-offline"}`} title={online ? t.online : t.offline}>
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              <span>{online ? t.online : t.offline}</span>
            </div>
            <button className="icon-button language-toggle" onClick={() => onLanguageChange(language === "ar" ? "en" : "ar")} aria-label={t.language} title={t.language}>
              <Languages size={16} />
              <span>{language === "ar" ? "EN" : "ع"}</span>
            </button>
          </div>
        </header>
        <div className="content-area">{children}</div>
      </div>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navItems.map(({ id, icon: Icon, key }) => (
          <button key={id} className={activeView === id ? "active" : ""} onClick={() => onViewChange(id)}>
            <Icon size={20} />
            <span>{t[key]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
