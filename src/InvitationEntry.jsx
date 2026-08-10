import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { App } from "./App.jsx";
import { supabase } from "./lib/supabase.js";

const AdminApp = lazy(() => import("./admin/AdminApp.jsx").then((module) => ({ default: module.AdminApp })));

function invitationCodeFromPath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments[0] === "i") return segments[1]?.toUpperCase() || null;
  if (segments.length === 1 && segments[0] !== "admin") return segments[0].toUpperCase();
  return null;
}

export function InvitationEntry() {
  const path = window.location.pathname;
  const code = useMemo(invitationCodeFromPath, []);
  const [invitation, setInvitation] = useState(null);
  const [status, setStatus] = useState(code ? "loading" : "ready");

  useEffect(() => {
    if (!code) return;
    let active = true;
    supabase.rpc("open_wedding_invitation", { p_code: code }).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) setStatus("not-found");
      else {
        setInvitation(data);
        setStatus("ready");
      }
    });
    return () => { active = false; };
  }, [code]);

  if (path === "/admin" || path.startsWith("/admin/")) {
    return <Suspense fallback={<main className="route-state"><div className="route-seal">A <span>&</span> D</div></main>}><AdminApp /></Suspense>;
  }

  if (status === "loading") {
    return <main className="route-state"><div className="route-seal">A <span>&</span> D</div><p>Invitation loading…</p></main>;
  }

  if (status === "not-found") {
    return (
      <main className="route-state">
        <div className="route-seal">A <span>&</span> D</div>
        <h1>Diese Einladung wurde nicht gefunden.</h1>
        <p>Bitte prüfe den Link auf deiner Einladungskarte.</p>
        <a href="mailto:szildebora@gmail.com">Kontakt aufnehmen</a>
      </main>
    );
  }

  return <App invitation={invitation} />;
}
