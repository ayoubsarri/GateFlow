import { ArrowLeft, ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { BrandLogo } from "./BrandLogo";
import { copy } from "../lib/i18n";
import type { EntranceName, Language, StaffSession } from "../types";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;

function getLockoutRemaining(): number {
  const until = Number(localStorage.getItem("inas-lockout-until") || 0);
  const remaining = Math.ceil((until - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

interface LoginScreenProps {
  language: Language;
  entrances: EntranceName[];
  onLanguageChange: (language: Language) => void;
  onSubmit: (pin: string, stationName: string) => Promise<StaffSession>;
}

export function LoginScreen({ language, entrances, onLanguageChange, onSubmit }: LoginScreenProps) {
  const t = copy[language];
  const savedStation = localStorage.getItem("inas-station") as EntranceName | null;
  const [pin, setPin] = useState("");
  const [stationName, setStationName] = useState<EntranceName>(savedStation && entrances.includes(savedStation) ? savedStation : entrances[0] || "A");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(getLockoutRemaining);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = window.setInterval(() => {
      const rem = getLockoutRemaining();
      setLockoutSeconds(rem);
      if (rem <= 0) {
        localStorage.removeItem("inas-lockout-until");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutSeconds]);

  const submit = async (eventValue: FormEvent) => {
    eventValue.preventDefault();
    if (lockoutSeconds > 0) return;
    setError(false);
    setLoading(true);
    try {
      await onSubmit(pin, stationName);
      localStorage.removeItem("inas-login-attempts");
      localStorage.removeItem("inas-lockout-until");
    } catch {
      const attempts = Number(localStorage.getItem("inas-login-attempts") || 0) + 1;
      localStorage.setItem("inas-login-attempts", String(attempts));
      if (attempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        localStorage.setItem("inas-lockout-until", String(until));
        localStorage.removeItem("inas-login-attempts");
        setLockoutSeconds(60);
      }
      setError(true);
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;

  return (
    <main className="login-page login-page--minimal" dir={language === "ar" ? "rtl" : "ltr"}>
      <button className="login-language" onClick={() => onLanguageChange(language === "ar" ? "en" : "ar")}>
        {language === "ar" ? "EN" : "العربية"}
      </button>

      <form className="login-card login-card--minimal" onSubmit={submit}>
        <BrandLogo />
        <div className="login-card__title">
          <div className="login-card__icon"><LockKeyhole size={24} /></div>
          <h1>{t.signIn}</h1>
        </div>

        <fieldset className="station-picker">
          <legend>{t.station}</legend>
          {entrances.map((entrance) => (
            <button type="button" key={entrance} className={stationName === entrance ? "active" : ""} onClick={() => setStationName(entrance)}>{entrance}</button>
          ))}
        </fieldset>

        <label className="field">
          <span>{t.pin}</span>
          <input
            value={pin}
            onChange={(eventValue) => setPin(eventValue.target.value)}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            required
            disabled={loading || lockoutSeconds > 0}
          />
        </label>

        {lockoutSeconds > 0 ? (
          <div className="form-error" role="alert">
            {language === "ar"
              ? `تم تجاوز عدد المحاولات المسموح بها. يرجى الانتظار ${lockoutSeconds} ثانية.`
              : `Too many failed attempts. Please wait ${lockoutSeconds}s.`}
          </div>
        ) : error ? (
          <div className="form-error" role="alert">{t.loginError}</div>
        ) : null}
        <button className="primary-button primary-button--large" disabled={loading || !pin || lockoutSeconds > 0}>
          {loading ? <LoaderCircle className="spin" size={21} /> : <Arrow size={20} />}
          <span>{loading ? t.loading : t.enter}</span>
        </button>
      </form>
    </main>
  );
}
