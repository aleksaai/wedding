import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Globe2,
  Heart,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { eventDetails, languageOptions, translations } from "./i18n.js";
import { supabase } from "./lib/supabase.js";

function getInitialLanguage(fallback = "de") {
  const requested = new URLSearchParams(window.location.search).get("lang");
  return translations[requested] ? requested : fallback;
}

function Ornament({ compact = false }) {
  return (
    <div className={`ornament ${compact ? "ornament--compact" : ""}`} aria-hidden="true">
      <span />
      <Sparkles size={compact ? 13 : 16} strokeWidth={1.2} />
      <span />
    </div>
  );
}

function SectionHeading({ eyebrow, children, intro }) {
  return (
    <header className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{children}</h2>
      {intro && <p className="section-intro">{intro}</p>}
    </header>
  );
}

function MultilineTitle({ lines }) {
  return <>{lines.map((line, index) => <span key={line}>{line}{index < lines.length - 1 && <br />}</span>)}</>;
}

function FaqItem({ item, open, onToggle }) {
  return (
    <div className={`faq-item ${open ? "is-open" : ""}`}>
      <button type="button" onClick={onToggle} aria-expanded={open}>
        <span>{item.q}</span>
        <ChevronDown size={18} strokeWidth={1.5} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="faq-answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <p>{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChoiceCard({ selected, onClick, icon, title, text }) {
  return (
    <button type="button" className={`choice-card ${selected ? "is-selected" : ""}`} onClick={onClick}>
      <span className="choice-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <span className="choice-check">{selected && <Check size={15} strokeWidth={2.5} />}</span>
    </button>
  );
}

function Counter({ label, hint, value, max, onChange, decreaseLabel, increaseLabel }) {
  return (
    <div className="counter-row">
      <div>
        <strong>{label}</strong>
        <small>{hint}</small>
      </div>
      <div className="counter-controls">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={value === 0} aria-label={decreaseLabel}>
          <Minus size={16} />
        </button>
        <span>{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={increaseLabel}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function LanguageSelect({ language, onChange, copy }) {
  return (
    <label className="language-select" aria-label={copy.nav.language}>
      <Globe2 size={14} strokeWidth={1.7} />
      <select value={language} onChange={(event) => onChange(event.target.value)} aria-label={copy.nav.language}>
        {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.short}</option>)}
      </select>
      <ChevronDown size={13} strokeWidth={1.7} aria-hidden="true" />
    </label>
  );
}

function RsvpSheet({ open, onClose, copy, invitation }) {
  const text = copy.rsvp;
  const [step, setStep] = useState(0);
  const [matchedInvitation, setMatchedInvitation] = useState(null);
  const [attendance, setAttendance] = useState("");
  const [partner, setPartner] = useState(0);
  const [kidsUnder3, setKidsUnder3] = useState(0);
  const [kids3To17, setKids3To17] = useState(0);
  const [kids18Plus, setKids18Plus] = useState(0);
  const [diet, setDiet] = useState("");
  const [message, setMessage] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const activeInvitation = invitation || matchedInvitation;
  const needsCode = !invitation && !matchedInvitation;
  // Kinder sind bewusst nicht an max_children gebunden: wer Kinder mitbringen
  // moechte, soll das eintragen koennen, auch wenn dafuer nichts eingeplant war.
  const childrenLimit = activeInvitation?.children_limit ?? 10;

  useEffect(() => {
    if (!open || !activeInvitation?.response) return;
    setAttendance(activeInvitation.response.attending ? "yes" : "no");
    setPartner(activeInvitation.response.partner_count || 0);
    setKidsUnder3(activeInvitation.response.kids_under_3 || 0);
    setKids3To17(activeInvitation.response.kids_3_to_17 || 0);
    setKids18Plus(activeInvitation.response.kids_18_plus || 0);
    setDiet(activeInvitation.response.dietary_notes || "");
    setMessage(activeInvitation.response.message || "");
  }, [open, activeInvitation]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const maxStep = attendance === "no" ? 2 : 3;
  const nextDisabled = step === 0 && !attendance;

  function next() {
    if (step === 0 && attendance === "no") setStep(2);
    else setStep((current) => Math.min(current + 1, maxStep));
  }

  function back() {
    if (step === 2 && attendance === "no") setStep(0);
    else setStep((current) => Math.max(0, current - 1));
  }

  function resetAndClose() {
    onClose();
    window.setTimeout(() => {
      setStep(0);
      setMatchedInvitation(null);
      setManualCode("");
      setSubmitError("");
      setAttendance("");
      setPartner(0);
      setKidsUnder3(0);
      setKids3To17(0);
      setKids18Plus(0);
      setDiet("");
      setMessage("");
    }, 350);
  }

  async function resolveManualCode() {
    const invitationCode = manualCode.trim().toUpperCase();
    setSubmitError("");
    if (!/^[A-Z0-9]{6,12}$/.test(invitationCode)) {
      setSubmitError(text.codeRequired);
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc("open_wedding_invitation", { p_code: invitationCode });
    setSubmitting(false);
    if (error || !data) {
      setSubmitError(text.codeNotFound);
      return;
    }
    setMatchedInvitation(data);
  }

  async function submit() {
    setSubmitError("");
    const invitationCode = activeInvitation?.code;
    if (!invitationCode) return setSubmitError(text.codeRequired);

    setSubmitting(true);
    const { error } = await supabase.rpc("submit_wedding_rsvp", {
      p_code: invitationCode,
      p_attending: attendance === "yes",
      p_partner_count: partner,
      p_kids_under_3: kidsUnder3,
      p_kids_3_to_17: kids3To17,
      p_kids_18_plus: kids18Plus,
      p_dietary_notes: diet,
      p_message: message,
    });
    setSubmitting(false);
    if (error) setSubmitError(text.saveError);
    else setStep(3);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button className="sheet-backdrop" onClick={resetAndClose} aria-label={text.backdropClose} />
          <motion.section
            className="rsvp-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={text.dialogLabel}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 270 }}
          >
            <div className="sheet-handle" />
            <div className="sheet-topline">
              {needsCode ? <span>{text.codeLabel}</span> : step === 3 ? <span>{text.saved}</span> : <span>{text.step(attendance === "no" && step === 2 ? 2 : step + 1, attendance === "no" ? 2 : 3)}</span>}
              <button type="button" onClick={resetAndClose} aria-label={text.close}><X size={20} /></button>
            </div>
            <div className="progress-track"><motion.span animate={{ width: needsCode ? "12%" : step === 3 ? "100%" : `${((attendance === "no" && step === 2 ? 2 : step + 1) / (attendance === "no" ? 2 : 3)) * 100}%` }} /></div>

            <div className="sheet-content">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={needsCode ? "code" : step} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.2 }}>
                  {needsCode && (
                    <>
                      <p className="eyebrow">{text.codeEyebrow}</p>
                      <h3>{text.codeTitle}</h3>
                      <p className="sheet-copy">{text.codeCopy}</p>
                      <label className="field-label invitation-code-field">
                        {text.codeLabel}
                        <input
                          value={manualCode}
                          onChange={(event) => {
                            setManualCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                            setSubmitError("");
                          }}
                          placeholder={text.codePlaceholder}
                          maxLength={12}
                          autoCapitalize="characters"
                          autoComplete="off"
                          spellCheck="false"
                          aria-describedby="invitation-code-hint"
                          autoFocus
                        />
                        <small id="invitation-code-hint">{text.codeHint}</small>
                      </label>
                    </>
                  )}
                  {!needsCode && step === 0 && (
                    <>
                      <p className="eyebrow">{text.answerEyebrow}</p>
                      <h3>{text.attendingTitle}</h3>
                      <p className="sheet-copy">{text.attendingCopy}</p>
                      <div className="choice-list">
                        <ChoiceCard selected={attendance === "yes"} onClick={() => setAttendance("yes")} icon={<Heart size={22} />} title={text.yesTitle} text={text.yesText} />
                        <ChoiceCard selected={attendance === "no"} onClick={() => setAttendance("no")} icon={<X size={22} />} title={text.noTitle} text={text.noText} />
                      </div>
                    </>
                  )}

                  {!needsCode && step === 1 && (
                    <>
                      <p className="eyebrow">{text.companionsEyebrow}</p>
                      <h3>{text.companionsTitle}</h3>
                      <p className="sheet-copy">{text.companionsCopy}</p>
                      <div className="counter-list">
                        <Counter label={text.partner} hint={text.partnerHint} value={partner} max={Math.max(activeInvitation.max_adults - 1, 0)} onChange={setPartner} decreaseLabel={text.decrease(text.partner)} increaseLabel={text.increase(text.partner)} />
                        <Counter label={text.kidsUnder3} hint={text.kidsUnder3Hint} value={kidsUnder3} max={childrenLimit} onChange={setKidsUnder3} decreaseLabel={text.decrease(text.kidsUnder3)} increaseLabel={text.increase(text.kidsUnder3)} />
                        <Counter label={text.kids3To17} hint={text.kids3To17Hint} value={kids3To17} max={childrenLimit} onChange={setKids3To17} decreaseLabel={text.decrease(text.kids3To17)} increaseLabel={text.increase(text.kids3To17)} />
                        <Counter label={text.kids18Plus} hint={text.kids18PlusHint} value={kids18Plus} max={childrenLimit} onChange={setKids18Plus} decreaseLabel={text.decrease(text.kids18Plus)} increaseLabel={text.increase(text.kids18Plus)} />
                      </div>
                    </>
                  )}

                  {!needsCode && step === 2 && (
                    <>
                      <p className="eyebrow">{text.almost}</p>
                      <h3>{attendance === "no" ? text.finalNoTitle : text.finalYesTitle}</h3>
                      <p className="sheet-copy">{attendance === "no" ? text.finalNoCopy : text.finalYesCopy}</p>
                      {attendance !== "no" && (
                        <label className="field-label">
                          {text.diet}
                          <input value={diet} onChange={(event) => setDiet(event.target.value)} placeholder={text.dietPlaceholder} />
                        </label>
                      )}
                      <label className="field-label">
                        {text.message} <span>{text.optional}</span>
                        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={text.messagePlaceholder} rows={3} />
                      </label>
                    </>
                  )}

                  {!needsCode && step === 3 && (
                    <div className="success-state">
                      <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="success-seal"><Check size={28} /></motion.span>
                      <p className="eyebrow">{text.thanks}</p>
                      <h3>{attendance === "yes" ? text.successYes : text.successNo}</h3>
                      <p>{attendance === "yes" ? text.successAttending({ partner, kidsUnder3, kids3To17, kids18Plus }) : text.successDeclined}</p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="sheet-actions">
              {submitError && <p className="rsvp-error">{submitError}</p>}
              {needsCode ? <button type="button" className="button button--primary" disabled={submitting || !/^[A-Z0-9]{6,12}$/.test(manualCode)} onClick={resolveManualCode}>{submitting ? text.checkingCode : text.next} <ArrowRight size={17} /></button> : <>
                {step > 0 && step < 3 && <button type="button" className="button button--ghost" onClick={back}><ArrowLeft size={17} /> {text.back}</button>}
                {step < 2 && <button type="button" className="button button--primary" disabled={nextDisabled} onClick={next}>{text.next} <ArrowRight size={17} /></button>}
                {step === 2 && <button type="button" className="button button--primary" disabled={submitting} onClick={submit}>{submitting ? text.sending : text.send} <ArrowRight size={17} /></button>}
                {step === 3 && <button type="button" className="button button--primary" onClick={resetAndClose}>{text.return}</button>}
              </>}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function App({ invitation = null }) {
  const [language, setLanguage] = useState(() => getInitialLanguage(invitation?.default_language || "de"));
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const copy = translations[language];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "sr" ? "sr-Latn" : language;
    document.title = copy.metaTitle;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", language);
    window.history.replaceState({}, "", url);
  }, [language, copy.metaTitle]);

  return (
    <main lang={language === "sr" ? "sr-Latn" : language}>
      <nav className={`topbar ${scrolled ? "is-scrolled" : ""}`}>
        <a href="#top" className="monogram" aria-label={copy.nav.home}>A <span>&</span> D</a>
        <div className="topbar-actions">
          <LanguageSelect language={language} onChange={setLanguage} copy={copy} />
          <button type="button" className="nav-rsvp" onClick={() => setRsvpOpen(true)}>{copy.nav.rsvp}</button>
        </div>
      </nav>

      <section className="hero" id="top">
        <picture className="hero-picture">
          <source media="(min-width: 700px)" srcSet="/assets/wedding-hero-night-desktop-v1.webp" />
          <img src="/assets/wedding-hero-night-mobile-v1.webp" alt={copy.hero.imageAlt} fetchPriority="high" decoding="async" />
        </picture>
        <div className="hero-vignette" />
        <div className="hero-bottom">
          <p>{invitation?.display_name || copy.hero.personal}</p>
          <button type="button" className="button button--light" onClick={() => setRsvpOpen(true)}>{copy.hero.respond} <ArrowRight size={17} /></button>
          <a href="#welcome" className="scroll-cue">{copy.hero.discover} <ArrowDown size={16} /></a>
        </div>
      </section>

      <section className="welcome paper-section" id="welcome">
        <Ornament />
        <p className="eyebrow">{copy.welcome.eyebrow}</p>
        <h2>{copy.wedding.couple}</h2>
        <p className="welcome-copy">{copy.welcome.copy}</p>
        <div className="signature">A <span>&</span> D</div>
      </section>

      <section className="details-section paper-section">
        <SectionHeading eyebrow={copy.details.eyebrow} intro={copy.details.intro}>
          <MultilineTitle lines={copy.details.title} />
        </SectionHeading>
        <div className="detail-grid">
          <article>
            <span className="detail-icon"><CalendarDays size={21} strokeWidth={1.4} /></span>
            <p>{copy.details.when}</p>
            <h3>{copy.wedding.date}</h3>
            <small>{copy.details.exactDate}</small>
          </article>
          <article>
            <span className="detail-icon"><MapPin size={21} strokeWidth={1.4} /></span>
            <p>{copy.details.ceremony}</p>
            <h3>{copy.details.startsAt("14:00")}</h3>
            <small>{eventDetails.churchAddress}</small>
            <a className="map-link" href={eventDetails.churchMapUrl} target="_blank" rel="noreferrer">{copy.details.openMap} <ArrowRight size={13} /></a>
          </article>
          <article>
            <span className="detail-icon"><MapPin size={21} strokeWidth={1.4} /></span>
            <p>{copy.details.reception}</p>
            <h3>{copy.details.startsAt("17:00")}</h3>
            <small>{eventDetails.venueAddress}</small>
            <a className="map-link" href={eventDetails.venueMapUrl} target="_blank" rel="noreferrer">{copy.details.openMap} <ArrowRight size={13} /></a>
          </article>
        </div>
        <button type="button" className="button button--outline" onClick={() => setRsvpOpen(true)}>{copy.details.respond} <ArrowRight size={17} /></button>
        <p className="deadline">{copy.wedding.responseDeadline}</p>
      </section>

      <section className="scene-section paper-section" aria-label={copy.scene.imageAlt}>
        <figure className="scene-card">
          <img src="/assets/wedding-couple-photo.webp" alt={copy.scene.imageAlt} loading="lazy" />
        </figure>
      </section>

      <section className="schedule-section paper-section">
        <SectionHeading eyebrow={copy.day.eyebrow} intro={copy.day.intro}>
          <MultilineTitle lines={copy.day.title} />
        </SectionHeading>
        <div className="timeline">
          {copy.day.schedule.map((item, index) => (
            <article key={item.title}>
              <div className="timeline-rail"><span>{index + 1}</span></div>
              <div className="timeline-content">
                <time>{item.time}{copy.day.hour ? ` ${copy.day.hour}` : ""}</time>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="practical-section paper-section">
        <SectionHeading eyebrow={copy.practical.eyebrow}>{copy.practical.title}</SectionHeading>
        <div className="faq-list">
          {copy.practical.faq.map((item, index) => <FaqItem key={item.q} item={item} open={openFaq === index} onToggle={() => setOpenFaq(openFaq === index ? -1 : index)} />)}
        </div>
      </section>

      <section className="finale">
        <div className="finale-inner">
          <Ornament compact />
          <p className="verse">“{copy.wedding.verse}”</p>
          <p className="reference">{copy.wedding.reference}</p>
          <h2><MultilineTitle lines={copy.finale.title} /></h2>
          <p>{copy.finale.copy}</p>
          <button type="button" className="button button--light" onClick={() => setRsvpOpen(true)}>{copy.finale.respond} <Heart size={17} /></button>
        </div>
      </section>

      <footer>
        <p className="monogram">A <span>&</span> D</p>
        <p>{copy.finale.footer}</p>
        <div className="footer-contact" aria-label={copy.finale.contact}>
          <a href={eventDetails.websiteUrl}>{eventDetails.website}</a>
          <a href={`mailto:${eventDetails.email}`}>{eventDetails.email}</a>
          <a href={`tel:${eventDetails.phone}`}>{eventDetails.phoneDisplay}</a>
        </div>
      </footer>

      <RsvpSheet open={rsvpOpen} onClose={() => setRsvpOpen(false)} copy={copy} invitation={invitation} />
    </main>
  );
}
