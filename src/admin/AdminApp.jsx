import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  CreditCard,
  Download,
  ExternalLink,
  LogOut,
  Mail,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";

const categories = {
  debi_family: { label: "Debi · Family", language: "hu" },
  debi_friends: { label: "Debi · Friends", language: "hu" },
  aleksa_family: { label: "Aleksa · Family", language: "sr" },
  aleksa_friends: { label: "Aleksa · Friends", language: "de" },
  common: { label: "Common friends", language: "en" },
};

const approvedAdminEmails = ["info@aleksa.ai", "szildebora@gmail.com"];
const weddingHost = "wedding.aleksa.ai";

const emptyForm = {
  display_name: "",
  category: "common",
  default_language: "en",
  max_adults: 1,
  max_children: 0,
  internal_notes: "",
  is_backup: false,
};

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function statusOf(invitation) {
  if (invitation.is_backup) return "backup";
  if (invitation.responded_at) return invitation.wedding_rsvps?.attending ? "attending" : "declined";
  if (invitation.first_opened_at) return "opened";
  if (invitation.sent_at) return "sent";
  if (invitation.card_generated_at) return "card";
  return "draft";
}

const statusLabels = {
  draft: "Draft",
  card: "Card ready",
  sent: "Sent",
  opened: "Opened",
  attending: "Attending",
  declined: "Declined",
  backup: "Backup",
};

const cardLanguages = new Set(["de", "en", "hu", "sr"]);
// Update this fingerprint whenever the approved front artwork changes so
// already-open admin sessions cannot reuse a stale browser/CDN image cache.
const cardFrontArtworkVersion = "cd53b6c5d976";
const cardCodeLabels = {
  de: "Einladungscode",
  en: "Invitation code",
  hu: "Meghívókód",
  sr: "Kod pozivnice",
};

function cardAssets(language) {
  const normalized = cardLanguages.has(language) ? language.toUpperCase() : "EN";
  return {
    front: `/assets/cards/${normalized}-FRONT.png?v=${cardFrontArtworkVersion}`,
    back: `/assets/cards/${normalized}-BACK.png`,
  };
}

function openPrintableCard(invitation) {
  const popup = window.open("", "_blank", "width=940,height=900");
  if (!popup) return false;
  popup.opener = null;
  const assets = cardAssets(invitation.default_language);
  const front = new URL(assets.front, window.location.origin).href;
  const back = new URL(assets.back, window.location.origin).href;
  const personalCode = `${cardCodeLabels[invitation.default_language] || cardCodeLabels.en}: ${invitation.code}`;
  popup.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>Wedding invitation</title>
    <style>
      @page { size: 120mm 180mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #d9d5ce; }
      .page { position: relative; width: 120mm; height: 180mm; margin: 0 auto; overflow: hidden; page-break-after: always; background: #f8f5ee; }
      .page:last-child { page-break-after: auto; }
      img { display: block; width: 100%; height: 100%; object-fit: fill; }
      .personal-link { position: absolute; left: 10mm; right: 10mm; bottom: 11mm; text-align: center; color: #182b3d; font: 600 8.5pt/1.2 "Avenir Next", Avenir, Helvetica, sans-serif; letter-spacing: .025em; }
      @media screen { .page { margin-block: 18px; box-shadow: 0 18px 60px rgba(14,31,44,.2); } }
      @media print { html, body { background: transparent; } .page { margin: 0; box-shadow: none; } }
    </style></head><body>
      <section class="page"><img src="${front}" alt="Wedding invitation front"></section>
      <section class="page"><img src="${back}" alt="Wedding invitation back"><div class="personal-link">${personalCode}</div></section>
      <script>Promise.all(Array.from(document.images).map((image) => image.decode())).then(() => { window.focus(); window.print(); });<\/script>
    </body></html>`);
  popup.document.close();
  return true;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  let crc = 0xffffffff;
  for (let index = 4; index < 8 + data.length; index += 1) {
    crc ^= chunk[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  view.setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0);
  return chunk;
}

async function withPngDensity(blob, dpi = 300) {
  const source = new Uint8Array(await blob.arrayBuffer());
  const pixelsPerMetre = Math.round(dpi / 0.0254);
  const density = new Uint8Array(9);
  const densityView = new DataView(density.buffer);
  densityView.setUint32(0, pixelsPerMetre);
  densityView.setUint32(4, pixelsPerMetre);
  density[8] = 1;
  const densityChunk = pngChunk("pHYs", density);
  const parts = [source.slice(0, 8)];
  let offset = 8;
  let densityAdded = false;

  while (offset < source.length) {
    const length = new DataView(source.buffer, source.byteOffset + offset, 4).getUint32(0);
    const end = offset + length + 12;
    const type = new TextDecoder().decode(source.slice(offset + 4, offset + 8));
    if (type !== "pHYs") parts.push(source.slice(offset, end));
    if (type === "IHDR" && !densityAdded) {
      parts.push(densityChunk);
      densityAdded = true;
    }
    offset = end;
  }

  return new Blob(parts, { type: "image/png" });
}

async function downloadPersonalizedBack(invitation) {
  const { back } = cardAssets(invitation.default_language);
  const response = await fetch(back);
  if (!response.ok) throw new Error("Card artwork could not be loaded");
  const sourceBlob = await response.blob();
  const objectUrl = URL.createObjectURL(sourceBlob);
  const image = new Image();
  image.src = objectUrl;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  URL.revokeObjectURL(objectUrl);

  await document.fonts?.load('600 35px "Avenir Next"');
  context.fillStyle = "#182b3d";
  context.font = '600 35px "Avenir Next", Avenir, Helvetica, sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  const personalCode = `${cardCodeLabels[invitation.default_language] || cardCodeLabels.en}: ${invitation.code}`;
  context.fillText(personalCode, canvas.width / 2, canvas.height - 130);

  const renderedBlob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Card image could not be generated")), "image/png"));
  const downloadBlob = await withPngDensity(renderedBlob, 300);
  const downloadUrl = URL.createObjectURL(downloadBlob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `${invitation.code}-${invitation.default_language.toUpperCase()}-BACK-personalized.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");

  async function signIn(event) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!approvedAdminEmails.includes(normalizedEmail)) {
      setState("error");
      setMessage("This email address is not approved for the wedding workspace.");
      return;
    }
    setState("loading");
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/admin`,
        shouldCreateUser: false,
      },
    });
    setState(error ? "error" : "sent");
    setMessage(error ? error.message : "Magic link sent. Check your inbox.");
  }

  return (
    <main className="admin-login">
      <section className="login-card">
        <p className="admin-mark">A <span>&</span> D</p>
        <p className="admin-kicker">Private workspace</p>
        <h1>Wedding guest list</h1>
        <p>Sign in with an approved email address. We will send you a secure magic link.</p>
        <form onSubmit={signIn}>
          <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <button className="admin-button admin-button--dark" disabled={state === "loading"}><Mail size={17} />{state === "loading" ? "Sending…" : "Send magic link"}</button>
        </form>
        {message && <p className={`login-message ${state}`}>{message}</p>}
        <a href="/">← Back to wedding website</a>
      </section>
    </main>
  );
}

function AccessDenied({ email }) {
  return (
    <main className="admin-login">
      <section className="login-card access-denied-card">
        <p className="admin-mark">A <span>&</span> D</p>
        <p className="admin-kicker">Private workspace</p>
        <h1>No access</h1>
        <p><strong>{email}</strong> is signed in, but is not approved to view the wedding guest list.</p>
        <button className="admin-button admin-button--dark" onClick={() => supabase.auth.signOut()}><LogOut size={17} />Sign out and use another email</button>
      </section>
    </main>
  );
}

function InviteForm({ open, onClose, onSaved, invitation, defaultBackup = false }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(invitation ? {
      display_name: invitation.display_name,
      category: invitation.category,
      default_language: invitation.default_language,
      max_adults: invitation.max_adults,
      max_children: invitation.max_children,
      internal_notes: invitation.internal_notes || "",
      is_backup: invitation.is_backup,
    } : { ...emptyForm, is_backup: defaultBackup });
    setError("");
  }, [invitation, open, defaultBackup]);

  if (!open) return null;

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function changeCategory(category) {
    setForm((current) => ({ ...current, category, default_language: categories[category].language }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      display_name: form.display_name.trim(),
      internal_notes: form.internal_notes.trim() || null,
      max_adults: Number(form.max_adults),
      max_children: Number(form.max_children),
      card_generated_at: form.is_backup ? null : invitation?.card_generated_at || new Date().toISOString(),
    };
    const query = invitation
      ? supabase.from("wedding_invitations").update(payload).eq("id", invitation.id)
      : supabase.from("wedding_invitations").insert({ ...payload, code: makeCode() });
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) return setError(saveError.message);
    onSaved();
  }

  return (
    <div className="admin-modal-layer">
      <button className="admin-modal-backdrop" onClick={onClose} aria-label="Close" />
      <section className="invite-form-panel" role="dialog" aria-modal="true">
        <header><div><p className="admin-kicker">Invitation details</p><h2>{invitation ? "Edit invitation" : "Add an invitation"}</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></header>
        <form onSubmit={save}>
          <label className="field-wide">Name on invitation<input required maxLength={160} value={form.display_name} onChange={(event) => update("display_name", event.target.value)} placeholder="e.g. Lukas & Anna" /></label>
          <label>Group<select value={form.category} onChange={(event) => changeCategory(event.target.value)}>{Object.entries(categories).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
          <label>Default language<select value={form.default_language} onChange={(event) => update("default_language", event.target.value)}><option value="de">German</option><option value="hu">Hungarian</option><option value="sr">Serbian</option><option value="en">English</option></select></label>
          <label>List<select value={form.is_backup ? "backup" : "active"} onChange={(event) => update("is_backup", event.target.value === "backup")}><option value="active">Guest list</option><option value="backup">Backup list</option></select></label>
          <label>Adults<input type="number" min="1" max="12" value={form.max_adults} onChange={(event) => update("max_adults", event.target.value)} /></label>
          <label>Children<input type="number" min="0" max="12" value={form.max_children} onChange={(event) => update("max_children", event.target.value)} /></label>
          <label className="field-wide">Internal notes<textarea rows="3" maxLength={2000} value={form.internal_notes} onChange={(event) => update("internal_notes", event.target.value)} placeholder="Half price, family details, card note…" /></label>
          {error && <p className="form-error field-wide">{error}</p>}
          <div className="form-actions field-wide"><button type="button" className="admin-button" onClick={onClose}>Cancel</button><button className="admin-button admin-button--dark" disabled={saving}><Check size={17} />{saving ? "Saving…" : "Save invitation"}</button></div>
        </form>
      </section>
    </div>
  );
}

function CardDrawer({ invitation, onClose, onGenerated, onCopyLink }) {
  const [downloadingBack, setDownloadingBack] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  useEffect(() => {
    setDownloadingBack(false);
    setDownloadError("");
  }, [invitation?.id]);
  if (!invitation) return null;
  const assets = cardAssets(invitation.default_language);

  function printCard() {
    if (openPrintableCard(invitation)) onGenerated(invitation);
  }

  async function downloadBack() {
    setDownloadingBack(true);
    setDownloadError("");
    try {
      await downloadPersonalizedBack(invitation);
      onGenerated(invitation);
    } catch (error) {
      setDownloadError(error.message || "The personalized back could not be downloaded.");
    } finally {
      setDownloadingBack(false);
    }
  }

  return (
    <div className="admin-modal-layer card-drawer-layer">
      <button className="admin-modal-backdrop" onClick={onClose} aria-label="Close" />
      <section className="card-drawer" role="dialog" aria-modal="true" aria-label={`Invitation card for ${invitation.display_name}`}>
        <header>
          <div><p className="admin-kicker">{invitation.default_language.toUpperCase()} · Print-ready</p><h2>{invitation.display_name}</h2><p>Final 120 × 180 mm design · 300 dpi</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>
        <div className="card-preview-pair">
          <figure><div className="card-sheet"><img src={assets.front} alt={`${invitation.default_language.toUpperCase()} invitation front`} /></div><figcaption>Front</figcaption></figure>
          <figure><div className="card-sheet card-sheet--back"><img src={assets.back} alt={`${invitation.default_language.toUpperCase()} invitation back`} /><span>{cardCodeLabels[invitation.default_language] || cardCodeLabels.en}: {invitation.code}</span></div><figcaption>Back · invitation code</figcaption></figure>
        </div>
        <div className="card-personal-link"><span>Personal invitation</span><code>https://{weddingHost}/{invitation.code}</code></div>
        <div className="card-actions">
          <button className="admin-button admin-button--dark" onClick={printCard}><Printer size={17} />Print / save as PDF</button>
          <button className="admin-button" onClick={() => onCopyLink(invitation.code)}><Clipboard size={16} />Copy link</button>
          <a className="admin-button" href={assets.front} download={`${invitation.code}-${invitation.default_language.toUpperCase()}-FRONT.png`}><Download size={16} />Download front</a>
          <button className="admin-button" onClick={downloadBack} disabled={downloadingBack}><Download size={16} />{downloadingBack ? "Creating back…" : "Download personalized back"}</button>
        </div>
        {downloadError && <p className="form-error card-download-error">{downloadError}</p>}
        <p className="card-note">The artwork is the approved final design. Only the invitation code is added in the unused lower margin of the printed back. Personal links remain available digitally.</p>
      </section>
    </div>
  );
}

function ResponseDrawer({ invitation, onClose }) {
  if (!invitation) return null;
  const response = invitation.wedding_rsvps;
  return (
    <div className="admin-modal-layer drawer-layer">
      <button className="admin-modal-backdrop" onClick={onClose} aria-label="Close" />
      <aside className="response-drawer">
        <header><div><p className="admin-kicker">Invitation</p><h2>{invitation.display_name}</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></header>
        <div className="invite-link-card"><code>{window.location.origin}/{invitation.code}</code><a href={`/${invitation.code}`} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a></div>
        <dl className="response-facts">
          <div><dt>Group</dt><dd>{categories[invitation.category].label}</dd></div>
          <div><dt>Language</dt><dd>{invitation.default_language.toUpperCase()}</dd></div>
          <div><dt>List</dt><dd>{invitation.is_backup ? "Backup list" : "Guest list"}</dd></div>
          <div><dt>Allowed</dt><dd>{invitation.max_adults} adults · {invitation.max_children} children</dd></div>
          <div><dt>Opens</dt><dd>{invitation.open_count}</dd></div>
        </dl>
        <section className={`response-card ${response ? "has-response" : ""}`}>
          <p className="admin-kicker">RSVP response</p>
          {!response ? <p>No response submitted yet.</p> : <>
            <h3>{response.attending ? "Yes, attending" : "No, cannot attend"}</h3>
            {response.attending && <p>{1 + response.partner_count} adult{1 + response.partner_count === 1 ? "" : "s"} · {response.children_count} children</p>}
            {response.dietary_notes && <div><strong>Dietary notes</strong><p>{response.dietary_notes}</p></div>}
            {response.message && <div><strong>Message</strong><p>{response.message}</p></div>}
          </>}
        </section>
        {invitation.internal_notes && <section className="notes-card"><p className="admin-kicker">Internal notes</p><p>{invitation.internal_notes}</p></section>}
      </aside>
    </div>
  );
}

export function AdminApp() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [access, setAccess] = useState("checking");
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [cardInvitation, setCardInvitation] = useState(null);
  const [notice, setNotice] = useState("");
  const [listView, setListView] = useState("active");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setAuthReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  async function loadInvitations() {
    setLoading(true);
    const { data, error } = await supabase.from("wedding_invitations").select("*, wedding_rsvps(*)").order("created_at", { ascending: false });
    if (error) setNotice(error.message);
    else setInvitations((data || []).map((item) => ({
      ...item,
      wedding_rsvps: Array.isArray(item.wedding_rsvps) ? item.wedding_rsvps[0] || null : item.wedding_rsvps || null,
    })));
    setLoading(false);
  }

  useEffect(() => {
    if (!session) {
      setAccess("checking");
      return;
    }
    let active = true;
    supabase.rpc("is_wedding_admin").then(({ data, error }) => {
      if (!active) return;
      if (error || data !== true) setAccess("denied");
      else {
        setAccess("allowed");
        loadInvitations();
      }
    });
    return () => { active = false; };
  }, [session]);

  const filtered = useMemo(() => invitations.filter((invitation) => {
    const query = search.trim().toLowerCase();
    return (!query || `${invitation.display_name} ${invitation.code} ${invitation.internal_notes || ""}`.toLowerCase().includes(query))
      && invitation.is_backup === (listView === "backup")
      && (category === "all" || invitation.category === category)
      && (status === "all" || statusOf(invitation) === status);
  }), [invitations, search, category, status, listView]);

  const totals = useMemo(() => {
    const active = invitations.filter((item) => !item.is_backup);
    const backup = invitations.filter((item) => item.is_backup);
    return {
      invitations: active.length,
      invited: active.reduce((sum, item) => sum + item.max_adults + item.max_children, 0),
      responses: active.filter((item) => item.responded_at).length,
      attending: active.reduce((sum, item) => sum + (item.wedding_rsvps?.attending ? 1 + item.wedding_rsvps.partner_count + item.wedding_rsvps.children_count : 0), 0),
      backupInvitations: backup.length,
      backupPeople: backup.reduce((sum, item) => sum + item.max_adults + item.max_children, 0),
    };
  }, [invitations]);

  async function mark(invitation, field) {
    const value = invitation[field] ? null : new Date().toISOString();
    const { error } = await supabase.from("wedding_invitations").update({ [field]: value }).eq("id", invitation.id);
    if (error) setNotice(error.message); else loadInvitations();
  }

  async function copyLink(code) {
    await navigator.clipboard.writeText(`${window.location.origin}/${code}`);
    setNotice("Invitation link copied");
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function promote(invitation) {
    const { error } = await supabase.from("wedding_invitations").update({ is_backup: false, card_generated_at: new Date().toISOString() }).eq("id", invitation.id);
    if (error) setNotice(error.message);
    else {
      setNotice(`${invitation.display_name} moved to the guest list`);
      loadInvitations();
      window.setTimeout(() => setNotice(""), 2200);
    }
  }

  async function recordCardGenerated(invitation) {
    if (invitation.is_backup || invitation.card_generated_at) return;
    const { error } = await supabase.from("wedding_invitations").update({ card_generated_at: new Date().toISOString() }).eq("id", invitation.id).eq("is_backup", false);
    if (error) setNotice(error.message); else loadInvitations();
  }

  if (!authReady) return <main className="route-state"><div className="route-seal">A <span>&</span> D</div></main>;
  if (!session) return <LoginScreen />;
  if (access === "checking") return <main className="route-state"><div className="route-seal">A <span>&</span> D</div><p>Checking access…</p></main>;
  if (access === "denied") return <AccessDenied email={session.user.email} />;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a href="/" className="admin-mark">A <span>&</span> D</a>
        <div><p className="admin-kicker">Wedding workspace</p><h2>23 Jan 2027</h2></div>
        <nav>
          <button className={listView === "active" ? "is-active" : ""} onClick={() => { setListView("active"); setStatus("all"); }}><Users size={18} />Guest list <small>{totals.invitations}</small></button>
          <button className={listView === "backup" ? "is-active" : ""} onClick={() => { setListView("backup"); setStatus("all"); }}><RotateCcw size={18} />Backup list <small>{totals.backupInvitations}</small></button>
        </nav>
        <button className="admin-signout" onClick={() => supabase.auth.signOut()} title={session.user.email}><LogOut size={17} />Sign out</button>
      </aside>
      <section className="admin-main" id="guests">
        <header className="admin-header"><div><p className="admin-kicker">Aleksa & Debora</p><h1>{listView === "active" ? "Guest list" : "Backup list"}</h1><p>{listView === "active" ? "One invitation, one private link, one clear response." : "Reserve guests who can move up when a place becomes available."}</p></div><button className="admin-button admin-button--dark" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={18} />{listView === "active" ? "Add invitation" : "Add backup guest"}</button></header>
        <section className="admin-stats">
          {listView === "active" ? <>
            <article><span>Invitations</span><strong>{totals.invitations}</strong></article>
            <article><span>Invited people</span><strong>{totals.invited}</strong></article>
            <article><span>Responses</span><strong>{totals.responses}<small> / {totals.invitations}</small></strong></article>
            <article><span>Attending</span><strong>{totals.attending}</strong></article>
          </> : <>
            <article><span>Backup households</span><strong>{totals.backupInvitations}</strong></article>
            <article><span>Backup people</span><strong>{totals.backupPeople}</strong></article>
            <article><span>Active invitations</span><strong>{totals.invitations}</strong></article>
            <article><span>Active people</span><strong>{totals.invited}</strong></article>
          </>}
        </section>
        <section className="guest-board">
          <div className="board-toolbar">
            <label className="admin-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search names, codes or notes" /></label>
            <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All groups</option>{Object.entries(categories).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select>
            <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          <div className="guest-table-wrap">
            <table className="guest-table">
              <thead><tr><th>Invitation</th><th>Group</th><th>People</th><th>Status</th><th>Progress</th><th>Link</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="6" className="empty-row">Loading invitations…</td></tr> : filtered.length === 0 ? <tr><td colSpan="6" className="empty-row">No invitations match these filters.</td></tr> : filtered.map((invitation) => {
                  const inviteStatus = statusOf(invitation);
                  return <tr key={invitation.id} onDoubleClick={() => { setEditing(invitation); setFormOpen(true); }}>
                    <td><button className="guest-name" onClick={() => setSelected(invitation)}>{invitation.display_name}<small>{invitation.code} · {invitation.default_language.toUpperCase()}</small></button></td>
                    <td><span className={`group-pill ${invitation.category}`}>{categories[invitation.category].label}</span></td>
                    <td><span className="people-count">{invitation.max_adults} {invitation.max_adults === 1 ? "adult" : "adults"}{invitation.max_children ? ` · ${invitation.max_children} ${invitation.max_children === 1 ? "child" : "children"}` : ""}</span></td>
                    <td><span className={`status-pill ${inviteStatus}`}>{statusLabels[inviteStatus]}</span></td>
                    <td>{invitation.is_backup ? <button className="promote-button" onClick={() => promote(invitation)}><Users size={15} />Move to guest list</button> : <div className="progress-actions"><button className={invitation.card_generated_at ? "done" : ""} onClick={() => setCardInvitation(invitation)} title="Open invitation card"><CreditCard size={17} /></button><button className={invitation.sent_at ? "done" : ""} onClick={() => mark(invitation, "sent_at")} title="Sent"><Send size={16} /></button><span title={`${invitation.open_count} opens`}>{invitation.open_count}</span></div>}</td>
                    <td>{invitation.is_backup ? <span className="not-invited">Not invited</span> : <button className="copy-button" onClick={() => copyLink(invitation.code)}><Clipboard size={15} />Copy</button>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
      {notice && <div className="admin-toast">{notice}</div>}
      <InviteForm open={formOpen} invitation={editing} defaultBackup={listView === "backup"} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); loadInvitations(); }} />
      <ResponseDrawer invitation={selected} onClose={() => setSelected(null)} />
      <CardDrawer invitation={cardInvitation} onClose={() => setCardInvitation(null)} onGenerated={recordCardGenerated} onCopyLink={copyLink} />
    </main>
  );
}
