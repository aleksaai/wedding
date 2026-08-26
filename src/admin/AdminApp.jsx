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
  Pencil,
  Printer,
  RotateCcw,
  Trash2,
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
// Update this fingerprint whenever any approved card artwork changes so
// already-open admin sessions cannot reuse stale browser/CDN image caches.
const cardArtworkVersion = "9f0f536c76fb";

// Download names should read like the guest, not like the database:
// "kyung_einladung_front.png" instead of "0B59A6DB-DE-FRONT.png". The code is
// only appended when two households share a display name, so the files stay
// tellable apart (there are two "Lilla" invitations).
function slugifyName(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function invitationFileBase(invitation, duplicateNames) {
  const slug = slugifyName(invitation.display_name);
  if (!slug) return `${invitation.code.toLowerCase()}_einladung`;
  if (duplicateNames?.has(slug)) return `${slug}_${invitation.code.toLowerCase()}_einladung`;
  return `${slug}_einladung`;
}

function duplicateNameSet(invitations) {
  const seen = new Map();
  for (const invitation of invitations) {
    const slug = slugifyName(invitation.display_name);
    if (slug) seen.set(slug, (seen.get(slug) || 0) + 1);
  }
  return new Set(Array.from(seen.entries()).filter(([, count]) => count > 1).map(([slug]) => slug));
}

function cardAssets(language) {
  const normalized = cardLanguages.has(language) ? language.toUpperCase() : "EN";
  return {
    front: `/assets/cards/${normalized}-FRONT.png?v=${cardArtworkVersion}`,
    back: `/assets/cards/${normalized}-BACK.png?v=${cardArtworkVersion}`,
  };
}

function openPrintableCard(invitation, fileBase) {
  const popup = window.open("", "_blank", "width=940,height=900");
  if (!popup) return false;
  popup.opener = null;
  const assets = cardAssets(invitation.default_language);
  const front = new URL(assets.front, window.location.origin).href;
  const back = new URL(assets.back, window.location.origin).href;
  const personalCode = invitation.code;
  popup.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>${fileBase}</title>
    <style>
      @page { size: 120mm 180mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #d9d5ce; }
      .page { position: relative; width: 120mm; height: 180mm; margin: 0 auto; overflow: hidden; page-break-after: always; background: #17263d; }
      .page:last-child { page-break-after: auto; }
      img { display: block; width: 100%; height: 100%; }
      .page--front img { object-fit: fill; }
      .page--back img { object-fit: fill; }
      .personal-code { position: absolute; left: 10mm; right: 10mm; top: 84.67%; transform: translateY(-50%); text-align: center; color: #f8e8c8; font: 600 6.2pt/1 "Avenir Next", Avenir, Helvetica, sans-serif; letter-spacing: .025em; }
      @media screen { .page { margin-block: 18px; box-shadow: 0 18px 60px rgba(14,31,44,.2); } }
      @media print { html, body { background: transparent; } .page { margin: 0; box-shadow: none; } }
    </style></head><body>
      <section class="page page--front"><img src="${front}" alt="Wedding invitation front"></section>
      <section class="page page--back"><img src="${back}" alt="Wedding invitation back"><div class="personal-code">${personalCode}</div></section>
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

async function downloadPersonalizedBack(invitation, fileBase) {
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

  await document.fonts?.load('600 26px "Avenir Next"');
  context.fillStyle = "#f8e8c8";
  context.font = '600 26px "Avenir Next", Avenir, Helvetica, sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(invitation.code, canvas.width / 2, 1800);

  const renderedBlob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Card image could not be generated")), "image/png"));
  const downloadBlob = await withPngDensity(renderedBlob, 300);
  const downloadUrl = URL.createObjectURL(downloadBlob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `${fileBase}_back.png`;
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

function CardDrawer({ invitation, fileBase, onClose, onGenerated, onCopyLink }) {
  const [downloadingBack, setDownloadingBack] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  useEffect(() => {
    setDownloadingBack(false);
    setDownloadError("");
  }, [invitation?.id]);
  if (!invitation) return null;
  const assets = cardAssets(invitation.default_language);

  function printCard() {
    if (openPrintableCard(invitation, fileBase)) onGenerated(invitation);
  }

  async function downloadBack() {
    setDownloadingBack(true);
    setDownloadError("");
    try {
      await downloadPersonalizedBack(invitation, fileBase);
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
          <div><p className="admin-kicker">{invitation.default_language.toUpperCase()} · Print-ready</p><h2>{invitation.display_name}</h2><p>Final 120 × 180 mm design · 300 dpi · personalized code included</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>
        <div className="card-preview-pair">
          <figure><div className="card-sheet card-sheet--front"><img src={assets.front} alt={`${invitation.default_language.toUpperCase()} invitation front`} /></div><figcaption>Front</figcaption></figure>
          <figure><div className="card-sheet card-sheet--back"><img src={assets.back} alt={`${invitation.default_language.toUpperCase()} invitation back`} /><span>{invitation.code}</span></div><figcaption>Back · invitation code</figcaption></figure>
        </div>
        <div className="card-personal-link"><span>Personal invitation</span><code>https://{weddingHost}/{invitation.code}</code></div>
        <div className="card-actions">
          <button className="admin-button admin-button--dark" onClick={printCard}><Printer size={17} />Print / save as PDF</button>
          <button className="admin-button" onClick={() => onCopyLink(invitation.code)}><Clipboard size={16} />Copy link</button>
          <a className="admin-button" href={assets.front} download={`${fileBase}_front.png`}><Download size={16} />Download front</a>
          <button className="admin-button" onClick={downloadBack} disabled={downloadingBack}><Download size={16} />{downloadingBack ? "Creating back…" : "Download personalized back"}</button>
        </div>
        {downloadError && <p className="form-error card-download-error">{downloadError}</p>}
        <p className="card-note">The approved artwork is shared by language. This preview and the personalized back download insert this guest's unchanged invitation code into the dedicated code field.</p>
      </section>
    </div>
  );
}

function ManualRsvpForm({ invitation, response, onSaved, onCancel }) {
  const [attending, setAttending] = useState(response ? response.attending : true);
  const [adults, setAdults] = useState(response?.partner_count ?? 0);
  const [under3, setUnder3] = useState(response?.kids_under_3 ?? 0);
  const [mid, setMid] = useState(response?.kids_3_to_17 ?? 0);
  const [grown, setGrown] = useState(response?.kids_18_plus ?? 0);
  const [diet, setDiet] = useState(response?.dietary_notes ?? "");
  const [message, setMessage] = useState(response?.message ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const number = (value) => Math.max(0, Math.min(20, Number.isFinite(+value) ? Math.trunc(+value) : 0));

  async function save() {
    setSaving(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("admin_upsert_wedding_rsvp", {
      p_code: invitation.code,
      p_attending: attending,
      p_partner_count: attending ? adults : 0,
      p_kids_under_3: attending ? under3 : 0,
      p_kids_3_to_17: attending ? mid : 0,
      p_kids_18_plus: attending ? grown : 0,
      p_dietary_notes: diet,
      p_message: message,
    });
    setSaving(false);
    if (rpcError) setError(rpcError.message);
    else onSaved("Response recorded");
  }

  return (
    <div className="manual-rsvp">
      <div className="manual-attendance">
        <button type="button" className={attending ? "is-active" : ""} onClick={() => setAttending(true)}><Check size={15} />Attending</button>
        <button type="button" className={!attending ? "is-active" : ""} onClick={() => setAttending(false)}><X size={15} />Cannot attend</button>
      </div>
      {attending && (
        <div className="manual-grid">
          <label>Adults besides them<input type="number" min="0" max="20" value={adults} onChange={(event) => setAdults(number(event.target.value))} /></label>
          <label>Kids under 3<input type="number" min="0" max="20" value={under3} onChange={(event) => setUnder3(number(event.target.value))} /></label>
          <label>Kids 3 to 17<input type="number" min="0" max="20" value={mid} onChange={(event) => setMid(number(event.target.value))} /></label>
          <label>Kids 18 and over<input type="number" min="0" max="20" value={grown} onChange={(event) => setGrown(number(event.target.value))} /></label>
        </div>
      )}
      {attending && <label className="manual-wide">Dietary notes<input value={diet} onChange={(event) => setDiet(event.target.value)} placeholder="vegetarian, allergies …" maxLength={1000} /></label>}
      <label className="manual-wide">Note<textarea rows="2" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Told us on the phone, said yes for two …" maxLength={2000} /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="manual-actions">
        <button type="button" className="admin-button admin-button--dark" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save response"}</button>
        {onCancel && <button type="button" className="admin-button" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

function ResponseDrawer({ invitation, onClose, onChanged, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);
  useEffect(() => { setEditing(false); setClearing(false); }, [invitation?.id]);
  if (!invitation) return null;
  const response = invitation.wedding_rsvps;
  const adultsTotal = response ? 1 + response.partner_count + (response.kids_18_plus || 0) : 0;

  async function clearResponse() {
    setClearing(true);
    const { error } = await supabase.rpc("admin_clear_wedding_rsvp", { p_code: invitation.code });
    setClearing(false);
    if (error) window.alert(error.message);
    else onChanged("Response removed");
  }

  return (
    <div className="admin-modal-layer drawer-layer">
      <button className="admin-modal-backdrop" onClick={onClose} aria-label="Close" />
      <aside className="response-drawer">
        <header>
          <div><p className="admin-kicker">Invitation</p><h2>{invitation.display_name}</h2></div>
          <div className="drawer-header-actions">
            {onEdit && <button className="icon-button" onClick={() => onEdit(invitation)} title="Edit name and details"><Pencil size={18} /></button>}
            <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
          </div>
        </header>
        <div className="invite-link-card"><code>{window.location.origin}/{invitation.code}</code><a href={`/${invitation.code}`} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a></div>
        <dl className="response-facts">
          <div><dt>Group</dt><dd>{categories[invitation.category].label}</dd></div>
          <div><dt>Language</dt><dd>{invitation.default_language.toUpperCase()}</dd></div>
          <div><dt>List</dt><dd>{invitation.is_backup ? "Backup list" : "Guest list"}</dd></div>
          <div><dt>Planned</dt><dd>{invitation.max_adults} adults · {invitation.max_children} children<em className="planned-note">one extra adult and children are always allowed</em></dd></div>
          <div><dt>Opens</dt><dd>{invitation.open_count}</dd></div>
        </dl>
        <section className={`response-card ${response ? "has-response" : ""}`}>
          <p className="admin-kicker">RSVP response</p>
          {!response ? (
            invitation.is_backup
              ? <p>Move this household to the guest list before recording a response.</p>
              : <>
                  <p>No response yet. If they told you by phone, mail or in person, record it here.</p>
                  <ManualRsvpForm invitation={invitation} response={null} onSaved={onChanged} />
                </>
          ) : <>
            <h3>{response.attending ? "Yes, attending" : "No, cannot attend"}</h3>
            <p className="response-source">{response.source === "admin" ? "Recorded by you" : "Answered by the guest"}</p>
            {response.attending && <>
              <p>{adultsTotal} adult{adultsTotal === 1 ? "" : "s"} · {response.children_count} child{response.children_count === 1 ? "" : "ren"} in total</p>
              <ul className="age-breakdown">
                <li><span>Under 3</span><strong>{response.kids_under_3 || 0}</strong><em>not counted</em></li>
                <li><span>3 to 17</span><strong>{response.kids_3_to_17 || 0}</strong></li>
                <li><span>18 and over</span><strong>{response.kids_18_plus || 0}</strong><em>counted as adults</em></li>
              </ul>
            </>}
            {response.dietary_notes && <div><strong>Dietary notes</strong><p>{response.dietary_notes}</p></div>}
            {response.message && <div><strong>Message</strong><p>{response.message}</p></div>}
            {editing
              ? <ManualRsvpForm invitation={invitation} response={response} onSaved={onChanged} onCancel={() => setEditing(false)} />
              : <div className="manual-actions">
                  <button type="button" className="admin-button" onClick={() => setEditing(true)}><Pencil size={15} />Change response</button>
                  <button type="button" className="admin-button" onClick={clearResponse} disabled={clearing}><Trash2 size={15} />{clearing ? "Removing…" : "Remove response"}</button>
                </div>}
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

  const duplicateNames = useMemo(() => duplicateNameSet(invitations), [invitations]);
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
      // Bewirtung rechnet nach Altersgruppe: ab 18 wie ein Erwachsener,
      // 3 bis 17 reduziert, unter 3 separat. Unter 3 wird nicht bezahlt und
      // zaehlt darum nicht in "attending" mit, sondern nur in der
      // Aufschluesselung darunter.
      attendingAdults: active.reduce((sum, item) => { const r = item.wedding_rsvps; return sum + (r?.attending ? 1 + r.partner_count + (r.kids_18_plus || 0) : 0); }, 0),
      attendingKids: active.reduce((sum, item) => { const r = item.wedding_rsvps; return sum + (r?.attending ? (r.kids_3_to_17 || 0) : 0); }, 0),
      attendingToddlers: active.reduce((sum, item) => { const r = item.wedding_rsvps; return sum + (r?.attending ? (r.kids_under_3 || 0) : 0); }, 0),
      attending: active.reduce((sum, item) => { const r = item.wedding_rsvps; return sum + (r?.attending ? 1 + r.partner_count + r.children_count - (r.kids_under_3 || 0) : 0); }, 0),
      extraKids: active.reduce((sum, item) => { const r = item.wedding_rsvps; return sum + (r?.attending ? Math.max(r.children_count - item.max_children, 0) : 0); }, 0),
      extraAdults: active.reduce((sum, item) => { const r = item.wedding_rsvps; return sum + (r?.attending ? Math.max(1 + r.partner_count + (r.kids_18_plus || 0) - item.max_adults, 0) : 0); }, 0),
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
            <article><span>Attending</span><strong>{totals.attending}</strong><small>{totals.attendingAdults} adults · {totals.attendingKids} kids 3-17 · plus {totals.attendingToddlers} under 3, not counted</small></article>
            <article><span>Beyond plan</span><strong>{totals.extraAdults + totals.extraKids}</strong><small>{totals.extraAdults} adults · {totals.extraKids} kids more than planned</small></article>
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
                    <td><div className="row-actions">
                      {invitation.is_backup ? <span className="not-invited">Not invited</span> : <button className="copy-button" onClick={() => copyLink(invitation.code)}><Clipboard size={15} />Copy</button>}
                      <button className="row-edit" onClick={() => { setEditing(invitation); setFormOpen(true); }} title="Edit invitation"><Pencil size={15} /></button>
                    </div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
      {notice && <div className="admin-toast">{notice}</div>}
      <InviteForm open={formOpen} invitation={editing} defaultBackup={listView === "backup"} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); loadInvitations(); }} />
      <ResponseDrawer invitation={selected} onEdit={(item) => { setSelected(null); setEditing(item); setFormOpen(true); }} onClose={() => setSelected(null)} onChanged={(text) => { setSelected(null); setNotice(text); window.setTimeout(() => setNotice(""), 2200); loadInvitations(); }} />
      <CardDrawer invitation={cardInvitation} fileBase={cardInvitation ? invitationFileBase(cardInvitation, duplicateNames) : ""} onClose={() => setCardInvitation(null)} onGenerated={recordCardGenerated} onCopyLink={copyLink} />
    </main>
  );
}
