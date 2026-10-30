import { Download, Globe2, LogOut, MonitorSmartphone, Plus, ToggleLeft, Trash2, X } from "lucide-react";
import { useState } from "react";
import { copy } from "../lib/i18n";
import { addEntrance, removeEntrance } from "../lib/entrances";
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

export function SettingsScreen({
  language,
  stationName,
  entrances,
  installAvailable,
  onEntrancesChange,
  onLanguageChange,
  onInstall,
  onSignOut
}: SettingsScreenProps) {
  const t = copy[language];
  const [newGateName, setNewGateName] = useState("");
  const isAr = language === "ar";

  const labels = isAr
    ? {
        entrances: "إدارة المداخل والأبواب",
        enabled: "مفعل",
        disabled: "متوقف",
        hint: "فعّل أو أضف المداخل المستعملة لاستقبال الوافدين.",
        addGate: "إضافة مدخل",
        addGatePlaceholder: "اسم المدخل (مثال: E أو VIP أو Hall 2)",
        removeConfirm: "حذف المدخل"
      }
    : {
        entrances: "Gate & Entrance Management",
        enabled: "On",
        disabled: "Off",
        hint: "Enable or create custom gates used for reception.",
        addGate: "Add Gate",
        addGatePlaceholder: "Gate name (e.g. E, VIP, or Hall 2)",
        removeConfirm: "Remove Gate"
      };

  const toggleEntrance = (name: string) => {
    const next = entrances.map((entrance) =>
      entrance.name === name ? { ...entrance, enabled: !entrance.enabled } : entrance
    );
    onEntrancesChange(next);
  };

  const handleAddGate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGateName.trim()) return;
    const updated = addEntrance(entrances, newGateName);
    onEntrancesChange(updated);
    setNewGateName("");
  };

  const handleRemoveGate = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = removeEntrance(entrances, name);
    onEntrancesChange(updated);
  };

  return (
    <section className="settings-page settings-page--minimal">
      <h1 className="simple-page-title">{t.settings}</h1>
      <article className="settings-card station-card">
        <div className="settings-card__head">
          <MonitorSmartphone size={22} />
          <div>
            <span>{t.station}</span>
            <strong>{stationName}</strong>
          </div>
        </div>

        {/* Dynamic Entrances & Gate Manager */}
        <div className="settings-action-row settings-action-row--stack">
          <div>
            <ToggleLeft size={19} />
            <div>
              <strong>{labels.entrances}</strong>
              <span>{labels.hint}</span>
            </div>
          </div>

          <div className="entrance-toggle-grid">
            {entrances.map((entrance) => {
              const isRemovable = entrances.length > 1;
              return (
                <div
                  key={entrance.name}
                  className={`entrance-pill-item ${entrance.enabled ? "active" : ""}`}
                  onClick={() => toggleEntrance(entrance.name)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") toggleEntrance(entrance.name);
                  }}
                >
                  <div className="entrance-pill-info">
                    <strong>{entrance.name}</strong>
                    <span>{entrance.enabled ? labels.enabled : labels.disabled}</span>
                  </div>
                  {isRemovable && (
                    <button
                      type="button"
                      className="entrance-pill-delete"
                      onClick={(e) => handleRemoveGate(entrance.name, e)}
                      title={labels.removeConfirm}
                      aria-label={`${labels.removeConfirm} ${entrance.name}`}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add New Gate Input Form */}
          <form className="add-gate-inline-form" onSubmit={handleAddGate}>
            <input
              type="text"
              value={newGateName}
              onChange={(e) => setNewGateName(e.target.value)}
              placeholder={labels.addGatePlaceholder}
              maxLength={12}
              aria-label={labels.addGatePlaceholder}
            />
            <button type="submit" disabled={!newGateName.trim()} className="add-gate-submit-btn">
              <Plus size={16} />
              <span>{labels.addGate}</span>
            </button>
          </form>
        </div>

        <div className="settings-action-row">
          <div>
            <Globe2 size={19} />
            <div>
              <strong>{t.language}</strong>
            </div>
          </div>
          <div className="segmented-control">
            <button className={language === "ar" ? "active" : ""} onClick={() => onLanguageChange("ar")}>
              العربية
            </button>
            <button className={language === "en" ? "active" : ""} onClick={() => onLanguageChange("en")}>
              EN
            </button>
          </div>
        </div>

        <button className="settings-button" data-install-ready={installAvailable ? "true" : "false"} onClick={onInstall}>
          <Download size={19} />
          {t.install}
        </button>
        <button className="settings-button danger" onClick={onSignOut}>
          <LogOut size={19} />
          {t.signOut}
        </button>
      </article>
    </section>
  );
}
