"use client";
import "./track-device.css";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Battery, ChevronLeft, ChevronRight, ExternalLink, History, Mail, MapPin, MapPinOff, Pencil, Phone, RefreshCw, Search, X } from "lucide-react";
import { type Device, type Member, teams, formatDate } from "@/lib/device-data";
import { type DemoContact, type TrackedDevice, createTrackingDemo, demoContactStorageKey, mapLinks, readDemoContacts, trackingStatus, trackingStatuses, validateContact } from "@/lib/tracking-demo";
import { AppSelect } from "./app-select";
import { DevicePlatformIcon } from "./device-platform-icon";

function reportTime(value?: string | null) { return value ? formatDate(value) : "Not available"; }
export function TrackDevice({ devices, members }: { devices: Device[]; members: Member[] }) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("All");
  const [status, setStatus] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(6);
  const [now, setNow] = useState(Date.now);
  const [demoTime, setDemoTime] = useState(Date.now);
  const [contacts, setContacts] = useState<Record<string, DemoContact>>({});
  const [editing, setEditing] = useState<Member | null>(null);
  const [historyDevice, setHistoryDevice] = useState<TrackedDevice | null>(null);
  const [notice, setNotice] = useState("");
  const list = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setContacts(readDemoContacts()); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (element.clientHeight) setPageSize(Math.max(1, Math.floor(element.clientHeight / 84)));
    });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const records = useMemo(() => createTrackingDemo(devices, members, demoTime), [devices, members, demoTime]);
  const filtered = records.filter(record => {
    const { device, holder } = record;
    const matches = [device.name, device.serial_number, device.barcode, holder?.name].join(" ").toLowerCase().includes(query.trim().toLowerCase());
    return matches && (team === "All" || (device.allocation_team ?? holder?.team) === team)
      && (status === "All" || trackingStatus(record, now) === status);
  });
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = filtered.find(record => record.device.id === selectedId) ?? visible[0];
  const holder = selected?.holder;
  const contact = holder ? contacts[holder.id] ?? selected.contact : undefined;
  const location = selected?.location;
  const links = location ? mapLinks(location) : null;
  const reportStatus = selected ? trackingStatus(selected, now) : "Not connected";
  const tone = reportStatus === "Recent location" ? "good" : reportStatus === "Stale location" ? "warn" : "neutral";

  function clearFilters() { setQuery(""); setTeam("All"); setStatus("All"); setPage(0); setSelectedId(null); }

  return <section className="tracking-workspace" aria-label="Device tracking">
    <div className="tracking-demo-notice"><span>Demo</span><p>Sample locations, holders and contacts. Edits stay in this browser.</p></div>
    <div className="tracking-toolbar">
      <label className="search-field"><Search size={17} /><span className="sr-only">Search tracked devices</span><input value={query} placeholder="Search device or holder" onChange={event => { setQuery(event.target.value); setPage(0); setSelectedId(null); }} /></label>
      <label className="select-field"><AppSelect aria-label="Tracking team" value={team} onValueChange={value => { setTeam(value); setPage(0); setSelectedId(null); }}><option value="All">All teams</option>{teams.map(value => <option key={value}>{value}</option>)}</AppSelect></label>
      <label className="select-field"><AppSelect aria-label="Tracking status" value={status} onValueChange={value => { setStatus(value); setPage(0); setSelectedId(null); }}><option value="All">All statuses</option>{trackingStatuses.map(value => <option key={value}>{value}</option>)}</AppSelect></label>
      <button className="button secondary" onClick={() => { const time = Date.now(); setDemoTime(time); setNow(time); setNotice("Demo reports refreshed."); }}><RefreshCw size={16} />Refresh demo</button>
    </div>
    <div className="tracking-layout">
      <section className="tracking-device-list" aria-label="Tracked devices">
        <div className="tracking-list-heading"><h2>Devices</h2><span>{filtered.length} of {devices.length}</span></div>
        <div className="tracking-list-rows" ref={list}>{visible.map(record => {
          const { device, holder: owner } = record;
          const state = trackingStatus(record, now);
          return <button key={device.id} className={`tracking-device ${selected?.device.id === device.id ? "selected" : ""}`} aria-pressed={selected?.device.id === device.id} onClick={() => setSelectedId(device.id)}>
            <DevicePlatformIcon platform={device.platform} /><span><strong>{device.name}</strong><span>{owner?.name ?? "Unassigned"}</span><small>{state}</small></span><ChevronRight size={14} />
          </button>;
        })}</div>
        {!!filtered.length && <div className="pagination"><span>{currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, filtered.length)} of {filtered.length}</span><div><button className="icon-button" aria-label="Previous devices" title="Previous devices" disabled={!currentPage} onClick={() => { setPage(currentPage - 1); setSelectedId(null); }}><ChevronLeft size={16} /></button><button className="icon-button" aria-label="Next devices" title="Next devices" disabled={(currentPage + 1) * pageSize >= filtered.length} onClick={() => { setPage(currentPage + 1); setSelectedId(null); }}><ChevronRight size={16} /></button></div></div>}
      </section>
      <div className="tracking-mobile-picker"><AppSelect aria-label="Select tracked device" value={selected?.device.id ?? ""} onValueChange={setSelectedId}><option value="" disabled>Select a device</option>{filtered.map(({ device }) => <option value={device.id} key={device.id}>{device.name} / {device.barcode}</option>)}</AppSelect></div>
      {selected ? <section className="tracking-detail" aria-label="Tracking details">
        <header className="tracking-detail-heading"><div><h2>{selected.device.name}</h2><span>{selected.device.serial_number || selected.device.barcode}</span></div><span className={`tracking-status ${tone}`}><i className={`status-dot ${tone}`} />{reportStatus}</span></header>
        <div className="tracking-map">
          {links?.embed ? <MapPreview key={links.embed} url={links.embed} deviceName={selected.device.name} /> : <div className="tracking-map-empty">
            {location ? <MapPin size={30} strokeWidth={1.4} /> : <MapPinOff size={30} strokeWidth={1.4} />}
            <strong>{selected.permission === "denied" ? "Location permission off" : "No location reported"}</strong>
            <span>Not available</span>
          </div>}
        </div>
        <div className="tracking-location-info"><div><strong>{location ? location.address : "Location not available"}</strong><span>{location ? `${reportTime(location.at)} / Accuracy: ${Math.round(location.accuracy)} m` : "Awaiting a device report"}</span></div>
          {links && <div className="tracking-map-links"><a className="button secondary" href={links.google} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Google Maps</a><a className="button secondary" href={links.apple} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Apple Maps</a></div>}
        </div>
        <section className="tracking-holder" aria-labelledby="tracking-holder-title">
          <div className="tracking-holder-heading"><h3 id="tracking-holder-title">Current holder</h3>{holder && <button className="text-button" onClick={() => { setEditing(holder); setNotice(""); }}><Pencil size={13} />Edit contact</button>}</div>
          <div className="tracking-contact-grid">
            <div className="tracking-holder-name"><strong>{holder?.name ?? "Unassigned"}</strong><span>{holder ? `${holder.team} team` : "No current holder"}</span>{holder && <span>Assigned since {reportTime(selected.assignedAt)}</span>}</div>
            <dl className="tracking-contact-details"><div><dt><Phone size={14} />Contact number</dt><dd>{contact?.phone ? <a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`} aria-label={`Call ${holder?.name} at ${contact.phone}`}>{contact.phone}</a> : "Not added"}</dd></div><div><dt><Mail size={14} />Email</dt><dd>{contact?.email ? <a href={`mailto:${encodeURIComponent(contact.email)}`} aria-label={`Email ${holder?.name} at ${contact.email}`}>{contact.email}</a> : "Not added"}</dd></div></dl>
          </div>
        </section>
        <footer className="tracking-footer"><dl><div><dt><Battery size={14} />Battery</dt><dd>{selected.battery != null ? `${selected.battery}%` : "Not reported"}</dd></div><div><dt>Last report</dt><dd>{reportTime(selected.lastSeen)}</dd></div><div><dt>Last app activity</dt><dd>{reportTime(selected.lastActivity)}</dd></div></dl><button className="text-button" onClick={() => setHistoryDevice(selected)}><History size={14} />Location history</button></footer>
      </section> : <div className="empty-state"><MapPinOff size={28} /><h3>{devices.length ? "No matching devices" : "No devices registered yet"}</h3>{!!devices.length && <button className="button secondary" onClick={clearFilters}>Clear filters</button>}</div>}
    </div>
    <p className="tracking-notice" role="status">{notice}</p>
    {editing && <ContactEditor member={editing} contact={contacts[editing.id] ?? selected?.contact} onClose={() => setEditing(null)} onSaved={saved => {
      const next = { ...readDemoContacts(), [editing.id]: saved };
      try { localStorage.setItem(demoContactStorageKey, JSON.stringify(next)); }
      catch { throw new Error("Browser storage is unavailable. Your changes have not been saved."); }
      setContacts(next); setEditing(null); setNotice("Contact saved in this browser only.");
    }} />}
    {historyDevice && <LocationHistory device={historyDevice} onClose={() => setHistoryDevice(null)} />}
  </section>;
}

function MapPreview({ url, deviceName }: { url: string; deviceName: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (state !== "loading") return;
    const timer = setTimeout(() => setState("error"), 15000);
    return () => clearTimeout(timer);
  }, [state, attempt]);
  return <>
    <iframe key={attempt} title={`Demo location of ${deviceName}`} src={url} referrerPolicy="no-referrer" onLoad={() => setState("ready")} onError={() => setState("error")} />
    {state !== "ready" && <div className="tracking-map-loading" role="status"><MapPin size={24} /><span>{state === "loading" ? "Loading map..." : "Map preview unavailable"}</span>{state === "error" && <button className="button secondary" onClick={() => { setState("loading"); setAttempt(attempt + 1); }}><RefreshCw size={14} />Retry map</button>}</div>}
  </>;
}

function ContactEditor({ member, contact, onClose, onSaved }: { member: Member; contact?: DemoContact; onClose: () => void; onSaved: (contact: DemoContact) => void }) {
  const [error, setError] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => { opener.current = document.activeElement as HTMLElement; }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget); setError("");
    try { onSaved(validateContact({ phone: String(form.get("phone") || ""), email: String(form.get("email") || "") })); }
    catch (error) { setError(error instanceof Error ? error.message : "Contact could not be saved."); }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content" aria-describedby={undefined} onPointerDownOutside={event => event.preventDefault()} onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }}>
    <div className="modal-header"><Dialog.Title>Edit contact</Dialog.Title><Dialog.Close className="icon-button" aria-label="Close"><X size={18} /></Dialog.Close></div><p className="record-device-name">{member.name} / Demo</p>
    <form className="modal-form" onSubmit={submit}><fieldset className="editor-fields"><label>Contact number<input name="phone" type="tel" autoComplete="off" defaultValue={contact?.phone ?? ""} maxLength={24} /></label><label>Email<input name="email" type="email" autoComplete="off" defaultValue={contact?.email ?? ""} maxLength={254} /></label></fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary">Save demo contact</button></div>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function LocationHistory({ device, onClose }: { device: TrackedDevice; onClose: () => void }) {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => { opener.current = document.activeElement as HTMLElement; }, []);
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }}>
    <div className="modal-header"><Dialog.Title>Location history</Dialog.Title><Dialog.Close className="icon-button" aria-label="Close"><X size={18} /></Dialog.Close></div><p className="record-device-name">{device.device.name} / Demo</p>
    {!device.history.length ? <p className="muted">No location reports yet.</p> : <ol className="tracking-history-list">{device.history.map(report => {
      const links = mapLinks(report);
      return <li key={report.at}><strong>{report.address}</strong><span>{reportTime(report.at)} / {Math.round(report.accuracy)} m accuracy</span><div><a href={links.google} target="_blank" rel="noopener noreferrer">Google Maps</a><a href={links.apple} target="_blank" rel="noopener noreferrer">Apple Maps</a></div></li>;
    })}</ol>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
