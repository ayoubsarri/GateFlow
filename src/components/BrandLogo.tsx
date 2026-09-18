import { INAS_LOGO_DATA_URI } from "../assets/inasLogo";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-logo ${compact ? "brand-logo--compact" : ""}`}>
      <img src={INAS_LOGO_DATA_URI} alt="INAS — International Network of Algerian Scientists" />
    </div>
  );
}
