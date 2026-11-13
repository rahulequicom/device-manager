"use client";
import { appPath } from "@/lib/app-path";

import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import useSWR, { SWRConfig } from "swr";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, ArrowUpRight, Layers3, Plus, Search, Smartphone, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { isLocalInventory } from "@/lib/local-register";
import { errorMessage } from "@/lib/register-api";
import { loadEmployeeRegister, selfAssignEmployeeDevice, transferEmployeeDevice } from "@/lib/employee-api";
import { type EmployeeDevice, type Member, deviceStatus } from "@/lib/device-data";
import { EmployeeActivity } from "./employee-activity";
import { LocalCloudSync } from "./local-cloud-sync";
import { SignIn } from "./admin-access";

type Access = { admin: boolean; memberId: string | null; email: string; local: boolean };
export function EmployeeHome() {
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => setLocal(isLocalInventory()), []);
  if (local === null) return <main className="access-page"><p role="status">Opening your workspace...</p></main>;
  if (local) return <SWRConfig value={{ provider: () => new Map() }}><HomeWorkspace access={{ admin: true, memberId: null, email: "Local preview", local: true }} /></SWRConfig>;
  return <EmployeeAccess />;
}
function EmployeeAccess() {
  const [client] = useState(getSupabase);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    if (!client) return;
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session ? { id: session.user.id, email: session.user.email ?? "Employee" } : null); setReady(true); }
    });
    client.auth.getSession().then(({ error }) => { if (active && error) { setFailure(errorMessage(error)); setReady(true); } }).catch(error => { if (active) { setFailure(errorMessage(error)); setReady(true); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);
  if (!client) return <main className="access-page"><p>Supabase connection is not configured.</p></main>;
  if (!ready) return <main className="access-page"><p role="status">Checking your session...</p></main>;
  if (!user) return <SignIn client={client} initialError={failure} />;
  return <SWRConfig key={user.id} value={{ provider: () => new Map(), shouldRetryOnError: false }}><ApprovedEmployee client={client} user={user} /></SWRConfig>;
}
function ApprovedEmployee({ client, user }: { client: SupabaseClient; user: { id: string; email: string } }) {
  const access = useSWR(["employee-access", user.id], async () => {
    const admin = await client.from("dm_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (admin.error) throw admin.error;
    if (admin.data) return { admin: true, memberId: null };
    const employee = await client.from("dm_employees").select("member_id").eq("user_id", user.id).maybeSingle();
    if (employee.error) throw employee.error;
    return employee.data ? { admin: false, memberId: employee.data.member_id as string } : null;
  });
  const [failure, setFailure] = useState("");
  async function signOut() { const result = await client.auth.signOut(); if (result.error) setFailure(errorMessage(result.error)); }
  if (access.isLoading) return <main className="access-page"><p role="status">Checking employee access...</p></main>;
  if (access.error || !access.data) return <main className="access-page"><section className="access-content"><h1>Employee access required</h1><p><a href={appPath("/signup")}>Complete employee signup</a></p><p>{access.error ? errorMessage(access.error) : "Ask your administrator to link your login to your employee record."}</p>{failure && <p role="alert">{failure}</p>}<button className="button secondary" onClick={() => void signOut()}>Sign out</button><button className="button secondary" onClick={() => void access.mutate()}>Try again</button></section></main>;
  return <HomeWorkspace access={{ ...access.data, email: user.email, local: false }} onSignOut={signOut} signOutError={failure} />;
}
function HomeWorkspace({ access, onSignOut, signOutError }: { access: Access; onSignOut?: () => Promise<void>; signOutError?: string }) {
  const register = useSWR("employee-register", loadEmployeeRegister, { refreshInterval: 30000 });
  const [view, setView] = useState<"devices" | "activity">("devices");
  const [activityRevision, setActivityRevision] = useState(0);
  const [previewMember, setPreviewMember] = useState("");
  const memberId = access.local && previewMember ? previewMember : access.memberId;
  const admin = access.admin && !previewMember;
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<EmployeeDevice | null>(null);
  const [notice, setNotice] = useState("");
  const [claiming, setClaiming] = useState<string | null>(null);
  async function claim(device: EmployeeDevice) {
    if (claiming) return;
    setClaiming(device.id); setNotice("");
    try { await selfAssignEmployeeDevice(device, memberId); await saved("Device assigned to you."); }
    catch (error) { setNotice(errorMessage(error)); await register.mutate(); }
    finally { setClaiming(null); }
  }

  const members = register.data?.members ?? [];
  const devices = (register.data?.devices ?? []).filter(device => !device.retired);
  const visible = devices.filter(device => [device.name, members.find(member => member.id === device.holder_id)?.name].join(" ").toLowerCase().includes(query.toLowerCase().trim()));
  const person = members.find(member => member.id === memberId);
  async function saved(message: string) {
    if (modal) setView("activity");
    setActivityRevision(current => current + 1); setModal(null); setNotice(message); await register.mutate();
  }
  return <main className="employee-page">
    <header className="employee-nav"><a className="brand" href={appPath(access.local ? "/" : "/?cloud=1")}><span className="brand-mark"><Layers3 size={22} /></span><span>Device<strong>Management</strong></span></a><div><span>{access.email}</span>{access.admin && <a className="button secondary" href={appPath(access.local ? "/admin" : "/admin?cloud=1")}>Admin workspace <ArrowUpRight size={15} /></a>}{onSignOut && <button className="button secondary" onClick={() => void onSignOut()}>Sign out</button>}</div></header>
    <div className="employee-content">
      {signOutError && <p className="form-error" role="alert">{signOutError}</p>}
      {access.local && <><div className="employee-preview"><strong>Local development preview</strong><span>Employee access is checked after sign-in outside this localhost preview.</span><label>Preview as<select aria-label="Preview as" value={previewMember} onChange={event => { setPreviewMember(event.target.value); setModal(null); setView("devices"); }}><option value="">Admin · all devices</option>{members.map(member => <option key={member.id} value={member.id}>{member.name} · employee</option>)}</select></label></div><LocalCloudSync /></>}
      <section className="employee-hero"><div><p className="eyebrow">{admin ? "Company workspace" : "Employee workspace"}</p><h1>{person ? `Hello, ${person.name.split(" ")[0]}.` : "Your devices, in one place."}</h1><p>{admin ? "Keep track of every device and make the next handover simple." : "Choose an available device, assign it to yourself, or hand your device to a teammate."}</p></div><div className="employee-hero-art" aria-hidden="true"><Smartphone size={76} strokeWidth={1} /><span><i />Connected to your team</span></div></section>
      <section className="employee-actions" aria-label="Quick actions"><button onClick={() => { setNotice(""); setView("devices"); document.getElementById("home-devices")?.scrollIntoView({ behavior: "smooth" }); }}><span className="home-action-icon"><Layers3 size={21} /></span><strong>{admin ? "View inventory" : "Devices"}</strong><small>{devices.length} {admin ? "registered devices" : "devices to choose from"}</small><ArrowRight size={18} /></button>{admin && <a className="button secondary" href={appPath(access.local ? "/admin" : "/admin?cloud=1")}>Add device in admin workspace <Plus size={18} /></a>}<button disabled={!devices.some(device => !!device.holder_id && !device.retired && (admin || device.holder_id === memberId))} onClick={() => { setNotice("Choose Transfer on the device you want to hand over."); setView("devices"); document.getElementById("home-devices")?.scrollIntoView({ behavior: "smooth" }); }}><span className="home-action-icon"><ArrowUpRight size={21} /></span><strong>Transfer a device</strong><small>Hand over to another employee</small><ArrowRight size={18} /></button></section>
      {notice && <p className="employee-notice" role="status">{notice}</p>}
      <div className="employee-view-tabs" role="tablist" aria-label="Workspace views"><button id="devices-tab" role="tab" aria-selected={view === "devices"} aria-controls="devices-panel" onClick={() => setView("devices")}>{admin ? "Inventory" : "Devices"}</button><button id="activity-tab" role="tab" aria-selected={view === "activity"} aria-controls="activity-panel" onClick={() => setView("activity")}>Activity</button></div>
      {view === "activity" ? <div id="activity-panel" role="tabpanel" aria-labelledby="activity-tab"><EmployeeActivity memberId={memberId} admin={admin} members={members} revision={activityRevision} /></div> : <div id="devices-panel" role="tabpanel" aria-labelledby="devices-tab"><section id="home-devices" className="home-devices"><div className="home-section-heading"><div><p className="eyebrow">{admin ? "Company inventory" : "Choose a device"}</p><h2>{admin ? "All devices" : "Devices"} <span>{devices.length}</span></h2></div><label className="search-field"><Search size={18} /><span className="sr-only">Search your devices</span><input aria-label="Search your devices" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search device or employee" /></label></div>
      {register.error ? <div className="error-banner" role="alert">{errorMessage(register.error)}<button className="button secondary" onClick={() => void register.mutate()}>Retry</button></div> : register.isLoading ? <p role="status">Loading devices...</p> : !visible.length ? <div className="home-empty"><Smartphone size={32} /><h3>{query ? "No matching devices" : "No devices assigned yet"}</h3><p>{query ? "Try another device or employee name." : "Your administrator will add devices here."}</p></div> : <div className="home-device-grid">{visible.map(device => <article className="home-device-card" key={device.id}><div className="home-device-top"><span className="home-device-icon"><Smartphone size={28} strokeWidth={1.5} /></span><span className="status-pill neutral">{deviceStatus(device)}</span></div><h3>{device.name}</h3><p>{device.holder_id === memberId ? "Assigned to you" : members.find(member => member.id === device.holder_id)?.name || "Not assigned"}</p>{!admin && !device.holder_id && !device.retired && <button className="button primary" disabled={claiming === device.id || device.availability_confirmed === false} onClick={() => void claim(device)}>{claiming === device.id ? "Assigning..." : "Assign to me"}</button>}{device.holder_id && (admin || device.holder_id === memberId) && <button className="button secondary" disabled={device.retired} onClick={() => { setNotice(""); setModal(device); }}>Transfer <ArrowUpRight size={16} /></button>}</article>)}</div>}
      </section></div>}<footer className="employee-footer">Device Management <span>{admin ? "Company inventory" : "Choose · Assign to me · Transfer"}</span></footer>
    </div>
    {modal && <HomeDialog mode={modal} members={members} admin={admin} onClose={() => setModal(null)} onSaved={saved} />}
  </main>;
}
function HomeDialog({ mode, members, admin, onClose, onSaved }: { mode: EmployeeDevice; members: Member[]; admin: boolean; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const recipients = members.filter(member => member.id !== mode.holder_id);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget); setPending(true); setFailure("");
    try {
        const recipient = String(form.get("recipient") || "");
        if (!recipient || recipient === mode.holder_id) throw new Error("Choose another employee.");
        await transferEmployeeDevice(mode, recipient, admin);
        await onSaved(isLocalInventory() ? "Transfer saved locally. Check Supabase sync status for cloud confirmation." : "Device transferred. It will now appear in the recipient’s devices.");
    } catch (error) { setFailure(errorMessage(error)); } finally { setPending(false); }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !pending) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content" aria-describedby={undefined} onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }}><div className="modal-header"><Dialog.Title>Transfer device</Dialog.Title><button className="icon-button" aria-label="Close" disabled={pending} onClick={onClose}><X size={18} /></button></div><form className="modal-form" onSubmit={submit}><fieldset disabled={pending} className="editor-fields"><><div className="handover-summary"><strong>{mode.name}</strong></div><label>Transfer to<select aria-label="Transfer to" name="recipient" required defaultValue=""><option value="" disabled>Choose an employee</option>{recipients.map(member => <option key={member.id} value={member.id}>{member.name} · {member.team}</option>)}</select></label><p className="muted">{!recipients.length && "No other approved employees are available. Ask your administrator to approve recipients. "}After transfer, the device will be assigned to the recipient.{!admin && " The recipient will become the current holder."}</p></></fieldset>{failure && <p role="alert" className="form-error">{failure}</p>}<div className="modal-actions"><button type="button" className="button secondary" disabled={pending} onClick={onClose}>Cancel</button><button className="button primary" disabled={pending || !recipients.length}>{pending ? "Saving..." : "Confirm transfer"}</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
