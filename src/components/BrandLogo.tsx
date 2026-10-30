import { INAS_LOGO_DATA_URI } from "../assets/inasLogo";

export function BrandLogo({ compact = false, customLogo }: { compact?: boolean; customLogo?: string }) {
  const logo = customLogo || (typeof localStorage !== "undefined" ? localStorage.getItem("gateflow-custom-logo") : null) || INAS_LOGO_DATA_URI;

  return (
    <div className={`brand-logo ${compact ? "brand-logo--compact" : ""}`}>
      <img src={logo} alt="GateFlow Event Logo" />
    </div>
  );
}
