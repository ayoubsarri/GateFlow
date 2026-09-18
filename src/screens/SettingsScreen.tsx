import { Download, Globe2, LogOut, MonitorSmartphone, ToggleLeft } from "lucide-react";
import { copy } from "../lib/i18n";
import type { EntranceConfig, Language } from "../types";

interface SettingsScreenProps {
  language: Language;
  stationName: string;
  entrances: EntranceConfig[];
  installAvailable: boolean;
  onEntrancesChange: (entrances: EntranceConfig[]) => void;
  onLanguageChange: (language: Language) => void;
  onInstall: () => void;
  onSignOut: () => void;
}

export function SettingsScreen({ language, stationName, entrances, installAvailable, onEntrancesChange, onLanguageChange, onInstall, onSignOut }: SettingsScreenProps) {
  const t = copy[language];
  const labels = language === "ar" ? {
    entrances: "المداخل",
    enabled: "مفعل",
    disabled: "متوقف",
    hint: "فعّل فقط المداخل المستعملة يوم الحدث."
  } : {
    entrances: "Entrances",
    enabled: "On",
    disabled: "Off",
    hint: "Enable only the entrances used on event day."
  };
  const toggleEntrance = (name: string) => {
    const next = entrances.map((entrance) => entrance.name === name ? { ...entrance, enabled: !entrance.enabled } : entrance);
    onEntrancesChange(next);
  };
  return (
    <section className="settings-page settings-page--minimal">
      <h1 className="simple-page-title">{t.settings}</h1>
      <article className="settings-card station-card">
        <div className="settings-card__head"><MonitorSmartphone size={22} /><div><span>{t.station}</span><strong>{stationName}</strong></div></div>
        <div className="settings-action-row settings-action-row--stack">
          <div><ToggleLeft size={19} /><div><strong>{labels.entrances}</strong><span>{labels.hint}</span></div></div>
          <div className="entrance-toggle-grid">
            {entrances.map((entrance) => (
              <button key={entrance.name} className={entrance.enabled ? "active" : ""} onClick={() => toggleEntrance(entrance.name)}>
                <strong>{entrance.name}</strong>
                <span>{entrance.enabled ? labels.enabled : labels.disabled}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="settings-action-row">
          <div><Globe2 size={19} /><div><strong>{t.language}</strong></div></div>
          <div className="segmented-control"><button className={language === "ar" ? "active" : ""} onClick={() => onLanguageChange("ar")}>العربية</button><button className={language === "en" ? "active" : ""} onClick={() => onLanguageChange("en")}>EN</button></div>
        </div>
        <button className="settings-button" data-install-ready={installAvailable ? "true" : "false"} onClick={onInstall}><Download size={19} />{t.install}</button>
        <button className="settings-button danger" onClick={onSignOut}><LogOut size={19} />{t.signOut}</button>
      </article>
    </section>
  );
}
