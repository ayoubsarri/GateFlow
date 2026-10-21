import { useState } from "react";
import { Check, Copy, Radio, X, Users, QrCode } from "lucide-react";
import { p2pMesh } from "../lib/p2pMesh";
import type { Language } from "../types";

interface MeshPairingModalProps {
  language: Language;
  onClose: () => void;
  peerCount: number;
}

export function MeshPairingModal({ language, onClose, peerCount }: MeshPairingModalProps) {
  const [tab, setTab] = useState<"host" | "join">("host");
  const [offerText, setOfferText] = useState("");
  const [answerInput, setAnswerInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isAr = language === "ar";

  const generateOffer = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const offer = await p2pMesh.createMeshOffer();
      setOfferText(offer);
    } catch {
      setStatusMsg(isAr ? "تعذر إنشاء رمز الربط" : "Failed to generate pairing token");
    } finally {
      setLoading(false);
    }
  };

  const copyOffer = async () => {
    if (!offerText) return;
    await navigator.clipboard.writeText(offerText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitAnswer = async () => {
    if (!answerInput.trim()) return;
    setLoading(true);
    try {
      if (tab === "join") {
        // We are joining: parse offer, generate answer
        const answer = await p2pMesh.acceptMeshOffer(answerInput.trim());
        setOfferText(answer);
        setStatusMsg(isAr ? "تم إعداد الرد! شاركه مع المحطة المضيفة." : "Answer generated! Share it with the host station.");
      } else {
        // We are host: finalize with answer
        const ok = await p2pMesh.finalizeMeshAnswer(answerInput.trim());
        if (ok) {
          setStatusMsg(isAr ? "تم الاتصال بنجاح!" : "Connected successfully!");
          setTimeout(onClose, 1500);
        } else {
          setStatusMsg(isAr ? "فشل تأكيد الاتصال" : "Failed to confirm connection");
        }
      }
    } catch (err) {
      setStatusMsg(isAr ? "رمز غير صالح أو تعذر الربط" : "Invalid token or pairing error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-window mesh-modal" onClick={(e) => e.stopPropagation()} dir={isAr ? "rtl" : "ltr"}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Radio size={22} className="text-gold" />
            <h2>{isAr ? "شبكة المداخل المحلية (P2P Mesh)" : "Local Gate P2P Mesh"}</h2>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="mesh-status-banner">
          <Users size={18} />
          <span>
            {isAr
              ? `المحطات المتصلة حالياً: ${peerCount}`
              : `Connected Stations: ${peerCount}`}
          </span>
          <span className={`mesh-indicator ${peerCount > 0 ? "active" : "standby"}`}>
            {peerCount > 0 ? (isAr ? "شبكة نشطة" : "Active") : (isAr ? "جاهز للربط" : "Ready")}
          </span>
        </div>

        <p className="mesh-explainer">
          {isAr
            ? "تتيح هذه الميزة مزامنة عمليات المسح بين بوابات الدخول (A, B, C, D) عبر شبكة Wi-Fi أو نقطة اتصال محلية حتى في حال انقطاع الإنترنت التام."
            : "Enables instant peer-to-peer check-in sync between gate stations (A, B, C, D) over local Wi-Fi or hotspot even during total venue internet blackouts."}
        </p>

        <div className="mesh-tabs">
          <button
            className={`mesh-tab ${tab === "host" ? "active" : ""}`}
            onClick={() => { setTab("host"); setOfferText(""); setStatusMsg(null); }}
          >
            {isAr ? "1. محطة مضيفة (Host)" : "1. Host Station"}
          </button>
          <button
            className={`mesh-tab ${tab === "join" ? "active" : ""}`}
            onClick={() => { setTab("join"); setOfferText(""); setStatusMsg(null); }}
          >
            {isAr ? "2. انضمام لشبكة (Join)" : "2. Join Station"}
          </button>
        </div>

        <div className="mesh-body">
          {tab === "host" && (
            <div className="mesh-step">
              {!offerText ? (
                <button className="primary-button" onClick={generateOffer} disabled={loading} style={{ width: "100%" }}>
                  <QrCode size={18} />
                  {isAr ? "توليد رمز ربط المحطة" : "Generate Station Pairing Token"}
                </button>
              ) : (
                <>
                  <label className="mesh-label">
                    {isAr ? "انسخ رمز الربط وأرسله للمحطة الأخرى:" : "Copy token & send to other station:"}
                  </label>
                  <div className="token-box">
                    <textarea readOnly value={offerText} rows={3} />
                    <button className="secondary-button" onClick={copyOffer}>
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      {copied ? (isAr ? "تم النسخ" : "Copied") : (isAr ? "نسخ" : "Copy")}
                    </button>
                  </div>

                  <label className="mesh-label" style={{ marginTop: "12px" }}>
                    {isAr ? "ألصق رد المحطة الأخرى هنا:" : "Paste response from other station:"}
                  </label>
                  <textarea
                    placeholder={isAr ? "ألصق رمز الرد هنا..." : "Paste answer token here..."}
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    rows={2}
                  />
                  <button className="primary-button" onClick={submitAnswer} disabled={loading || !answerInput.trim()} style={{ width: "100%", marginTop: "8px" }}>
                    {isAr ? "تأكيد الاتصال والربط" : "Finalize Connection"}
                  </button>
                </>
              )}
            </div>
          )}

          {tab === "join" && (
            <div className="mesh-step">
              <label className="mesh-label">
                {isAr ? "ألصق رمز المحطة المضيفة:" : "Paste host station pairing token:"}
              </label>
              <textarea
                placeholder={isAr ? "ألصق رمز المضيف هنا..." : "Paste host token here..."}
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                rows={3}
              />
              <button className="primary-button" onClick={submitAnswer} disabled={loading || !answerInput.trim()} style={{ width: "100%", marginTop: "8px" }}>
                {isAr ? "توليد رمز الرد" : "Generate Response Token"}
              </button>

              {offerText && (
                <div style={{ marginTop: "12px" }}>
                  <label className="mesh-label">{isAr ? "انسخ رمز الرد وأرسله للمضيف:" : "Copy response token to host:"}</label>
                  <div className="token-box">
                    <textarea readOnly value={offerText} rows={3} />
                    <button className="secondary-button" onClick={copyOffer}>
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      {copied ? (isAr ? "تم النسخ" : "Copied") : (isAr ? "نسخ" : "Copy")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {statusMsg && <div className="mesh-status-msg">{statusMsg}</div>}
        </div>
      </div>
    </div>
  );
}
