import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  LogOut,
  Mail,
  Plus,
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

const emptyForm = {
  display_name: "",
  category: "common",
  default_language: "en",
  max_adults: 1,
  max_children: 0,
  internal_notes: "",
};

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function statusOf(invitation) {
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
};

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");

  async function signIn(event) {
    event.preventDefault();
    setState("loading");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/admin` },
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

function InviteForm({ open, onClose, onSaved, invitation }) {
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
    } : emptyForm);
    setError("");
  }, [invitation, open]);

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
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState("");

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

  useEffect(() => { if (session) loadInvitations(); }, [session]);

  const filtered = useMemo(() => invitations.filter((invitation) => {
    const query = search.trim().toLowerCase();
    return (!query || `${invitation.display_name} ${invitation.code} ${invitation.internal_notes || ""}`.toLowerCase().includes(query))
      && (category === "all" || invitation.category === category)
      && (status === "all" || statusOf(invitation) === status);
  }), [invitations, search, category, status]);

  const totals = useMemo(() => ({
    invitations: invitations.length,
    invited: invitations.reduce((sum, item) => sum + item.max_adults + item.max_children, 0),
    responses: invitations.filter((item) => item.responded_at).length,
    attending: invitations.reduce((sum, item) => sum + (item.wedding_rsvps?.attending ? 1 + item.wedding_rsvps.partner_count + item.wedding_rsvps.children_count : 0), 0),
  }), [invitations]);

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

  if (!authReady) return <main className="route-state"><div className="route-seal">A <span>&</span> D</div></main>;
  if (!session) return <LoginScreen />;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a href="/" className="admin-mark">A <span>&</span> D</a>
        <div><p className="admin-kicker">Wedding workspace</p><h2>23 Jan 2027</h2></div>
        <nav><a className="is-active" href="#guests"><Users size={18} />Guest list</a></nav>
        <button className="admin-signout" onClick={() => supabase.auth.signOut()}><LogOut size={17} />Sign out</button>
      </aside>
      <section className="admin-main" id="guests">
        <header className="admin-header"><div><p className="admin-kicker">Aleksa & Debora</p><h1>Guest list</h1><p>One invitation, one private link, one clear response.</p></div><button className="admin-button admin-button--dark" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={18} />Add invitation</button></header>
        <section className="admin-stats">
          <article><span>Invitations</span><strong>{totals.invitations}</strong></article>
          <article><span>Invited people</span><strong>{totals.invited}</strong></article>
          <article><span>Responses</span><strong>{totals.responses}<small> / {totals.invitations}</small></strong></article>
          <article><span>Attending</span><strong>{totals.attending}</strong></article>
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
                    <td>{invitation.max_adults}A{invitation.max_children ? ` + ${invitation.max_children}C` : ""}</td>
                    <td><span className={`status-pill ${inviteStatus}`}>{statusLabels[inviteStatus]}</span></td>
                    <td><div className="progress-actions"><button className={invitation.card_generated_at ? "done" : ""} onClick={() => mark(invitation, "card_generated_at")} title="Card ready"><CheckCircle2 size={17} /></button><button className={invitation.sent_at ? "done" : ""} onClick={() => mark(invitation, "sent_at")} title="Sent"><Send size={16} /></button><span title={`${invitation.open_count} opens`}>{invitation.open_count}</span></div></td>
                    <td><button className="copy-button" onClick={() => copyLink(invitation.code)}><Clipboard size={15} />Copy</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
      {notice && <div className="admin-toast">{notice}</div>}
      <InviteForm open={formOpen} invitation={editing} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); loadInvitations(); }} />
      <ResponseDrawer invitation={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
