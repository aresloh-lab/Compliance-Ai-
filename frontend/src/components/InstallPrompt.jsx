import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    if (isIos()) {
      setShowIosHint(true);
      return;
    }
  }

  if (!deferredPrompt && !isIos()) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <button className="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={install}>
        <Download size={14} strokeWidth={2.25} /> Install app
      </button>
      {showIosHint && (
        <p className="muted" style={{ marginTop: 6 }}>
          On iPhone/iPad: tap the Share icon in Safari, then "Add to Home Screen".
        </p>
      )}
    </div>
  );
}
