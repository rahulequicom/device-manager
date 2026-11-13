"use client";
import { appPath } from "@/lib/app-path";
import { AppSelect } from "./app-select";
import { DevicePlatformIcon } from "./device-platform-icon";
import { TrackDevice } from "./track-device";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode, type FormEvent, type MouseEvent } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AssignmentDialog } from "./assignment-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Ellipsis, ClipboardList, FileText, MapPin, Smartphone, Users, Plus, Search, RefreshCw, LogOut, X, Pencil, UserRoundCheck, RotateCcw, Archive, Copy, ChevronLeft, ChevronRight, Layers3, SlidersHorizontal } from "lucide-react";
import { type Device, type DeviceInput, type Member, type Team, type Platform, deviceStatus, statusOrder, statusTone, teams, platforms, formatDate } from "@/lib/device-data";
import { addMember, changeDevice, errorMessage, loadAudit, loadRegister, saveDevice } from "@/lib/register-api";
import { ActivityFeed } from "./activity-feed";
import { LocalCloudSync } from "./local-cloud-sync";
import { isLocalInventory } from "@/lib/local-register";
import { getSupabase } from "@/lib/supabase";

type View = "Inventory" | "Track device" | "People" | "Activity";
type Modal = { kind: "device"; device: Device } | { kind: "member" } | { kind: "assign"; device: Device } | null;
const navigation = [{ label: "Inventory", icon: Smartphone }, { label: "Track device", icon: MapPin }, { label: "People", icon: Users }, { label: "Activity", icon: ClipboardList }] as const;
const emptyDevices: Device[] = [];
const emptyMembers: Member[] = [];

export function DeviceAdminDashboard({ email, onSignOut, signOutError }: { email: string; onSignOut: () => Promise<void>; signOutError: string }) {
  const { mutate: mutateCache } = useSWRConfig();
  const register = useSWR("register", loadRegister, { refreshInterval: 30000 });
  useEffect(() => {
    if (isLocalInventory()) return;
    const client = getSupabase();
    if (!client) return;
    const channel = client.channel("device-register-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_devices" }, () => { void register.mutate(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_mobile_scans" }, () => { void register.mutate(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, []);
  const [view, setView] = useState<View>("Inventory");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("All");
  const [team, setTeam] = useState("All");
  const [platform, setPlatform] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const deviceMenuTrigger = useRef<HTMLButtonElement | null>(null);
  const detailOpener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 960px)");
    const update = () => setCompact(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  function selectDevice(id: string) {
    detailOpener.current = document.activeElement as HTMLElement;
    setSelectedId(id); setMobileDetailsOpen(true);
  }
  const [modal, setModal] = useState<Modal>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [tableContainer, setTableContainer] = useState<HTMLDivElement | null>(null);
  const [recordView, setRecordView] = useState<{ kind: "history" | "specifications"; device: Device } | null>(null);
  useEffect(() => {
    if (compact) { setPageSize(25); return; }
    if (!tableContainer) return;
    const measure = () => {
      const headerHeight = tableContainer.querySelector("thead")?.getBoundingClientRect().height ?? 42;
      const rowHeight = Number.parseFloat(getComputedStyle(tableContainer).getPropertyValue("--inventory-row-height")) || 64;
      setPageSize(Math.max(1, Math.floor((tableContainer.clientHeight - headerHeight - 1) / rowHeight)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(tableContainer); measure();
    return () => observer.disconnect();
  }, [tableContainer, compact]);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const devices = register.data?.devices ?? emptyDevices;
  const members = register.data?.members ?? emptyMembers;
  const memberMap = useMemo(() => new Map(members.map(member => [member.id, member])), [members]);
  const heldCounts = useMemo(() => {
    const counts = new Map<string, number>();
    devices.forEach(device => { if (device.holder_id) counts.set(device.holder_id, (counts.get(device.holder_id) ?? 0) + 1); });
    return counts;
  }, [devices]);
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return devices.filter(device => {
      const member = memberMap.get(device.holder_id ?? "");
      return (status === "All" || deviceStatus(device) === status)
        && (team === "All" || (device.allocation_team ?? member?.team) === team)
        && (platform === "All" || device.platform === platform)
        && [device.name, device.serial_number, device.barcode, device.model_name, device.platform, device.imei, device.imei2, device.eid, device.upc, member?.name, device.allocation_team ?? member?.team].join(" ").toLowerCase().includes(needle);
    });
  }, [devices, memberMap, deferredQuery, status, team, platform]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const visibleDevices = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = visibleDevices.find(device => device.id === selectedId) ?? visibleDevices[0];
  const metrics = useMemo(() => {
    const counts = { Assigned: 0, Available: 0, Retiring: 0, "Not confirmed": 0 };
    devices.forEach(device => counts[deviceStatus(device)]++);
    return counts;
  }, [devices]);
  function clearFilters() { setQuery(""); setStatus("All"); setTeam("All"); setPlatform("All"); setPage(0); }
  const hasFilters = !!query || status !== "All" || team !== "All" || platform !== "All";
  const audit = useSWR(view === "Activity" ? ["audit", "all"] : selected ? ["audit", selected.id] : null,
    () => loadAudit(view === "Activity" ? undefined : selected?.id), { refreshInterval: 30000 });
  const history = audit.data;

  function announce(message: string) {
    if (timer.current) clearTimeout(timer.current);
    setNotice(message);
    timer.current = setTimeout(() => setNotice(""), 3500);
  }
  async function recorded(device?: Device) {
    setModal(null);
    if (device) {
      setSelectedId(device.id);
      setRecordView(current => current?.device.id === device.id ? { ...current, device } : current);
      await register.mutate(current => current ? { ...current, devices: current.devices.map(item => item.id === device.id ? device : item) } : current, { revalidate: false });
    }
    announce("Saved to register");
    void register.mutate();
    void mutateCache(key => Array.isArray(key) && key[0] === "audit");
  }
  async function change(device: Device, values: { holder_id?: null; retired?: boolean; availability_confirmed?: boolean }) {
    if (busy) return;
    setBusy(true); setFailure("");
    try { await recorded(await changeDevice(device, values)); }
    catch (error) { setFailure(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function copy(device: Device) {
    try { await navigator.clipboard.writeText(`${device.name}\nSerial: ${device.serial_number}\nBarcode: ${device.barcode}`); announce("Device summary copied"); }
    catch { setFailure("Clipboard access was denied. You can select and copy the device details."); }
  }

  return <main className="admin-shell">
    <aside className="sidebar" aria-label="Admin navigation">
      <a className="brand" href={appPath("/")}><span className="brand-mark"><Layers3 size={22} strokeWidth={1.6} /></span><span>Device<strong>Management</strong></span></a>
      <div className="nav-section-label">Workspace</div>
      <nav className="nav-list">{navigation.map(({ label, icon: Icon }) => <button key={label} aria-label={label} aria-current={view === label ? "page" : undefined} className={`nav-item ${view === label ? "active" : ""}`} onClick={() => setView(label)}><Icon size={18} strokeWidth={1.7} /><span>{label}</span>{(label === "Inventory" || label === "People") && register.data && <span className="nav-count">{label === "Inventory" ? devices.length : members.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="account-panel"><span className="account-avatar">{email.slice(0, 2).toUpperCase()}</span><div><strong>My account</strong><p title={email}>{email}</p></div><button className="icon-button" title="Sign out" aria-label="Sign out" onClick={onSignOut}><LogOut size={17} /></button></div></div>
    </aside>
    <section className="workspace">
      <div className="workspace-content">
      <header className="topbar"><div><h1>{view === "Inventory" ? "Device inventory" : view}</h1></div><div className="topbar-actions">
        <a className="button secondary" href={appPath(isLocalInventory() ? "/" : "/?cloud=1")}>Home</a>
        {view !== "Track device" && <button className="icon-button" aria-label="Refresh register" title="Refresh register" disabled={register.isValidating} onClick={() => { void register.mutate(); void audit.mutate(); }}><RefreshCw size={17} /></button>}
        {view === "People" && <button className="button primary" disabled={!register.data} onClick={() => setModal({ kind: "member" })}><Plus size={17} />Add person</button>}
      </div></header>
      {isLocalInventory() && <LocalCloudSync />}
      {(register.error || failure || signOutError) && <div className="error-banner" role="alert">{failure || signOutError || errorMessage(register.error)}<button className="button secondary" onClick={() => { setFailure(""); void register.mutate(); }}>Retry</button></div>}
      {register.isLoading ? <div className="loading-state" role="status">Loading your register...</div> : register.data && <>
        {view === "Track device" && <TrackDevice devices={devices} members={members} />}
        {view === "Inventory" && <>
          <section className="metric-grid" aria-label="Inventory totals"><button className={`metric-card total ${!hasFilters ? "is-selected" : ""}`} aria-pressed={!hasFilters} onClick={clearFilters}><span><Layers3 size={15} />All devices</span><strong>{devices.length}</strong><small>{metrics["Not confirmed"] ? `${metrics["Not confirmed"]} not confirmed` : "In your register"}</small></button>{(statusOrder).map(value => <button key={value} className={`metric-card ${statusTone(value)}`} aria-pressed={status === value} onClick={() => { setStatus(status === value ? "All" : value); setPage(0); }}><span><i className={`status-dot ${statusTone(value)}`} />{value}</span><strong>{metrics[value]}</strong><small>{value === "Assigned" ? "With your team" : value === "Available" ? "Ready for handover" : "Out of circulation"}</small></button>)}</section>
          <div className={`inventory-layout ${selected ? "" : "without-detail"}`}>
            <section className="inventory-panel" aria-label="Device register">
              <div className="inventory-section-heading"><h2>Device register <span>{devices.length}</span></h2><span className="section-caption">{devices.length ? "All registered devices" : "Your inventory starts here"}</span></div>
              <div className="filters">
                <label className="search-field"><Search size={18} /><span className="sr-only">Search devices</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Search serial, person or model" /></label>
                <label className="select-field"><SlidersHorizontal size={15} /><span className="sr-only">Status</span><AppSelect aria-label="Status" value={status} onValueChange={value => { setStatus(value); setPage(0); }}><option value="All">All statuses</option>{[...statusOrder, "Not confirmed"].map(value => <option key={value}>{value}</option>)}</AppSelect></label>
                <label className="select-field"><span className="sr-only">Team</span><AppSelect aria-label="Team" value={team} onValueChange={value => { setTeam(value); setPage(0); }}><option value="All">All teams</option>{teams.map(value => <option key={value}>{value}</option>)}</AppSelect></label>
                <label className="select-field"><span className="sr-only">Platform</span><AppSelect aria-label="Platform" value={platform} onValueChange={value => { setPlatform(value); setPage(0); }}><option value="All">All platforms</option>{platforms.map(value => <option key={value}>{value}</option>)}</AppSelect></label>
              </div>
              {hasFilters && <div className="filter-summary" role="status"><span>{filtered.length} of {devices.length} devices{status !== "All" ? ` · ${status}` : ""}{team !== "All" ? ` · ${team}` : ""}{platform !== "All" ? ` · ${platform}` : ""}</span><button className="button secondary" onClick={clearFilters}><X size={13} />Clear filters</button></div>}
              {!!filtered.length && <div className="table-scroll" ref={setTableContainer}><table className="register-table"><thead><tr><th>Device</th><th>Current holder</th><th>Team</th><th>Status</th></tr></thead><tbody>
                {visibleDevices.map(device => {
                  const holder = memberMap.get(device.holder_id ?? "");
                  const allocatedTeam = device.allocation_team ?? holder?.team;
                  return <tr key={device.id} className={`selectable-row ${selected?.id === device.id ? "selected-row" : ""}`} onClick={() => selectDevice(device.id)}><td><button className="device-link" aria-pressed={selected?.id === device.id} onClick={() => selectDevice(device.id)}><DevicePlatformIcon platform={device.platform} /><span><strong title={device.name}>{device.name}</strong><small title={device.serial_number || device.barcode}>{device.serial_number || device.barcode}</small></span></button></td><td>{holder ? <div className="table-holder"><span className={`person-avatar team-${holder.team.toLowerCase()}`}>{holder.name.split(" ").map(part => part[0]).slice(0,2).join("")}</span><strong title={holder.name}>{holder.name}</strong></div> : <span className="muted">Unassigned</span>}</td><td>{allocatedTeam ? <span className={`team-label team-${allocatedTeam.toLowerCase()}`}>{allocatedTeam}</span> : <span className="muted">No team</span>}</td><td><Status device={device} /></td></tr>;
                })}
              </tbody></table></div>}
              {!!devices.length && <div className="mobile-device-list" aria-label="Device register mobile">{visibleDevices.map(device => {
                const holder = memberMap.get(device.holder_id ?? "");
                const allocatedTeam = device.allocation_team ?? holder?.team;
                return <article className={`mobile-device-row ${selected?.id === device.id ? "selected-row" : ""}`} key={device.id} onClick={() => selectDevice(device.id)}><button className="mobile-device-main" aria-pressed={selected?.id === device.id} onClick={() => selectDevice(device.id)}><DevicePlatformIcon platform={device.platform} /><span><strong>{device.name}</strong><small>{device.serial_number || device.barcode}</small></span></button><div className="mobile-device-state"><strong>{holder?.name ?? "Unassigned"}</strong><span>{allocatedTeam ?? "No team"} · {deviceStatus(device)}</span></div></article>;
              })}</div>}
              {!filtered.length && <div className="empty-state">{devices.length ? <Search size={32} /> : <div className="empty-device-art" aria-hidden="true"><div className="device-outline rear"><Smartphone size={56} strokeWidth={0.9} /></div><div className="device-outline front"><Smartphone size={64} strokeWidth={1} /><span className="device-add-mark"><Plus size={15} /></span></div></div>}<h3>{devices.length ? "No matching devices" : "No devices registered yet"}</h3><p>{devices.length ? "Try another serial, person, or model." : "No device records to display."}</p>{!!devices.length && <button className="button primary" onClick={clearFilters}>Clear filters</button>}</div>}
              {!!devices.length && <div className="pagination"><span>{filtered.length ? `${currentPage * pageSize + 1}-${Math.min((currentPage + 1) * pageSize, filtered.length)} of ${filtered.length} devices` : "0 devices"}</span><div><button className="icon-button" title="Previous page" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {Math.max(1, Math.ceil(filtered.length / pageSize))}</span><button className="icon-button" title="Next page" aria-label="Next page" disabled={(currentPage + 1) * pageSize >= filtered.length} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div></div>}
            </section>
            {selected && <DeviceDetailsSurface compact={compact} open={mobileDetailsOpen} onClose={() => setMobileDetailsOpen(false)} opener={detailOpener.current}>
              <div className="panel-heading">
                <h2>{selected.name}</h2>
                <div className="panel-controls">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild><button ref={deviceMenuTrigger} className="icon-button" title="More device actions" aria-label="More device actions"><Ellipsis size={19} /></button></DropdownMenu.Trigger>
                    <DropdownMenu.Portal><DropdownMenu.Content className="device-menu" align="end" sideOffset={6} collisionPadding={12} onCloseAutoFocus={event => { if (modal?.kind === "device") event.preventDefault(); }}>
                      <DropdownMenu.Item disabled={busy} onSelect={() => setModal({ kind: "device", device: selected })}><Pencil size={15} />Edit details</DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={() => void copy(selected)}><Copy size={15} />Copy summary</DropdownMenu.Item>
                      {!selected.holder_id && !selected.retired && selected.availability_confirmed === false && <DropdownMenu.Item disabled={busy} onSelect={() => void change(selected, { availability_confirmed: true })}><UserRoundCheck size={15} />Confirm available</DropdownMenu.Item>}
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item className={selected.retired ? undefined : "destructive"} disabled={busy || !!selected.holder_id} title={selected.holder_id ? "Return the device before retiring it" : undefined} onSelect={() => void change(selected, { retired: !selected.retired })}><Archive size={15} />{selected.retired ? "Restore" : "Retire"}</DropdownMenu.Item>
                    </DropdownMenu.Content></DropdownMenu.Portal>
                  </DropdownMenu.Root>
                  {compact && <button className="icon-button" title="Back to devices" aria-label="Back to devices" onClick={() => setMobileDetailsOpen(false)}><X size={17} /></button>}
                </div>
              </div>
              {compact && <div className="mobile-detail-context"><span>{memberMap.get(selected.holder_id ?? "")?.name ?? "Unassigned"} · {selected.allocation_team ?? "No team"}</span><Status device={selected} /></div>}
              {compact && failure && <p className="form-error" role="alert">{failure}</p>}
              {!selected.retired && <div className="detail-actions">{selected.holder_id ? <><button className="button primary" disabled={busy} onClick={() => setModal({ kind: "assign", device: selected })}><UserRoundCheck size={16} />Transfer</button><button className="button secondary" disabled={busy} onClick={() => void change(selected, { holder_id: null, availability_confirmed: true })}><RotateCcw size={16} />Return</button></> : <><button className="button primary" disabled={busy} onClick={() => setModal({ kind: "assign", device: selected })}><UserRoundCheck size={16} />Assign device</button><button className="button secondary" disabled title="Assign a current holder before transferring this device"><UserRoundCheck size={16} />Transfer</button></>}</div>}
              <RecentDeviceHistory data={history} error={audit.error} loading={audit.isLoading} members={members} compact={compact} onViewAll={() => setRecordView({ kind: "history", device: selected })} />
              <button className="specifications-link" onClick={() => setRecordView({ kind: "specifications", device: selected })}><FileText size={17} aria-hidden="true" />Device specifications</button>
              {recordView && <DeviceRecordDialog view={recordView} members={members} onClose={() => setRecordView(null)} onSaved={recorded} />}
            </DeviceDetailsSurface>}
          </div>
        </>}
        {view === "People" && <section className="people-panel"><div className="panel-heading"><h2>Team members</h2><span className="muted">{members.length} people</span></div>{!members.length ? <div className="empty-state"><span className="empty-people-icon"><Users size={36} strokeWidth={1.3} /></span><h3>No people added yet</h3><p>Add the people who will use your devices.</p><button className="button primary" onClick={() => setModal({ kind: "member" })}><Plus size={16} />Add first person</button></div> : <div className="table-scroll"><table className="register-table"><thead><tr><th>Name</th><th>Team</th><th>Role</th><th>Devices held</th></tr></thead><tbody>{members.map(member => <tr key={member.id}><td><div className="table-holder"><span className={`person-avatar team-${member.team.toLowerCase()}`}>{member.name.split(" ").map(part => part[0]).slice(0,2).join("")}</span><strong>{member.name}</strong></div></td><td><span className={`team-label team-${member.team.toLowerCase()}`}>{member.team}</span></td><td>{member.role || "Not recorded"}</td><td>{heldCounts.get(member.id) ?? 0}</td></tr>)}</tbody></table></div>}</section>}
        {view === "Activity" && <section className="audit-panel admin-activity"><ActivityFeed data={history} error={audit.error} loading={audit.isLoading} refreshing={audit.isValidating} onRefresh={() => { void audit.mutate(); }} admin members={members} /></section>}
      </>}
      </div>
    </section>
    {modal?.kind === "assign" && <AssignmentDialog device={modal.device} members={members} onClose={() => setModal(null)} onSaved={recorded} onMemberCreated={async member => { await register.mutate(current => current ? { ...current, members: [...current.members.filter(item => item.id !== member.id), member] } : current, { revalidate: false }); }} />}
    {modal && modal.kind !== "assign" && <Editor returnFocus={modal.kind === "device" ? deviceMenuTrigger.current : undefined} modal={modal} members={members} onClose={() => setModal(null)} onSaved={recorded} />}
    <div className={`toast ${notice ? "visible" : ""}`} role="status">{notice}</div>
  </main>;
}

function DeviceDetailsSurface({ compact, open, onClose, opener, children }: { compact: boolean; open: boolean; onClose: () => void; opener: HTMLElement | null; children: ReactNode }) {
  if (!compact) return <aside className="detail-panel" aria-label="Selected device">{children}</aside>;
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="mobile-details-screen" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); opener?.focus(); }}>
        <Dialog.Title className="sr-only">Device details</Dialog.Title>
        <aside className="detail-panel" aria-label="Selected device">{children}</aside>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
function OwnershipActions({ device, busy, onOpen }: { device: Device; busy: boolean; onOpen: () => void }) {
  const unavailable = busy || device.retired;
  const stop = (event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); onOpen(); };
  if (device.holder_id) return <button className="button secondary ownership-action" disabled={unavailable} title={device.retired ? "Restore the device before transferring it" : undefined} aria-label={`Transfer ${device.name} ${device.barcode}`} onClick={stop}><UserRoundCheck size={15} />Transfer</button>;
  return <div className="ownership-actions" role="group" aria-label={`Ownership actions for ${device.name}`}><button className="button secondary ownership-action" disabled={unavailable} title={device.retired ? "Restore the device before assigning it" : undefined} aria-label={`Assign ${device.name} ${device.barcode}`} onClick={stop}><UserRoundCheck size={15} />Assign</button><button className="button secondary ownership-action transfer-unavailable" disabled title="Assign a current holder before transferring this device" aria-label={`Transfer ${device.name} ${device.barcode} unavailable`}><UserRoundCheck size={15} />Transfer</button></div>;
}
function RecentDeviceHistory({ data, error, loading, members, compact, onViewAll }: { data: Awaited<ReturnType<typeof loadAudit>> | undefined; error: unknown; loading: boolean; members: Member[]; compact: boolean; onViewAll: () => void }) {
  const element = useRef<HTMLElement | null>(null);
  const [count, setCount] = useState(3);
  useEffect(() => {
    if (compact) { setCount(3); return; }
    const section = element.current;
    if (!section) return;
    const measure = () => setCount(Math.min(3, Math.max(0, Math.floor((section.clientHeight - 52) / 88))));
    const observer = new ResizeObserver(measure);
    observer.observe(section); measure();
    return () => observer.disconnect();
  }, [compact]);
  return <section ref={element} className="device-history history-preview" aria-label="Recent device history">
    <div className="history-heading"><h3>History</h3><button className="text-button" onClick={onViewAll}>View all{data?.length ? ` (${data.length})` : ""}</button></div>
    {error || loading || !data?.length ? <AuditList data={data} error={error} loading={loading} members={members} /> : count > 0 && <AuditList data={data.slice(0, count)} error={undefined} loading={false} members={members} />}
  </section>;
}

function DeviceRecordDialog({ view, members, onClose, onSaved }: { view: { kind: "history" | "specifications"; device: Device }; members: Member[]; onClose: () => void; onSaved: (device?: Device) => Promise<void> }) {
  const { device, kind } = view;
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const editButton = useRef<HTMLButtonElement | null>(null);
  const wasEditing = useRef(false);
  const audit = useSWR(kind === "history" ? ["audit", device.id] : null, () => loadAudit(device.id));
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => { opener.current = document.activeElement as HTMLElement; }, []);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  return <Dialog.Root open onOpenChange={open => { if (!open && !pending) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className="dialog-content" aria-describedby={undefined} onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); if (!pending) { if (editing) setEditing(false); else onClose(); } }} onPointerDownOutside={event => { if (editing) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }}>
      <div className="modal-header"><Dialog.Title>{kind === "history" ? "Device history" : "Device specifications"}</Dialog.Title><div className="panel-controls">{kind === "specifications" && !editing && <button ref={editButton} className="button secondary" onClick={() => setEditing(true)}><Pencil size={15} aria-hidden="true" />Edit</button>}<Dialog.Close className="icon-button" aria-label="Close" title="Close" disabled={pending}><X size={18} /></Dialog.Close></div></div>
      <p className="record-device-name">{device.name}</p>
      {kind === "history" ? <AuditList data={audit.data} error={audit.error} loading={audit.isLoading} members={members} /> : editing ? <EditorForm modal={{ kind: "device", device }} pending={pending} setPending={setPending} focusOnMount onClose={() => setEditing(false)} onSaved={async saved => { await onSaved(saved); setEditing(false); }} /> : <dl className="spec-list">{[["RAM", device.ram], ["Serial", device.serial_number], ["Platform", device.platform], ["Model", device.model_name], ["Model number", device.model_number], ["OS version", device.ios_version], ["Capacity", device.capacity], ["Wi-Fi", device.wifi_address], ["Bluetooth", device.bluetooth_address], ["IMEI", device.imei], ["IMEI 2", device.imei2], ["EID", device.eid], ["UPC", device.upc], ["Barcode", device.barcode]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not recorded"}</dd></div>)}</dl>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

function Status({ device }: { device: Device }) { const status = deviceStatus(device); return <span className={`status-pill ${statusTone(status)}`}>{status}</span>; }
function AuditList({ data, error, loading, showDevice = false, members }: { data: Awaited<ReturnType<typeof loadAudit>> | undefined; error: unknown; loading: boolean; showDevice?: boolean; members: Member[] }) {
  if (error) return <p className="form-error" role="alert">{errorMessage(error)}</p>;
  if (loading) return <p className="muted" role="status">Loading activity...</p>;
  if (!data?.length) return <p className="muted activity-empty">No recorded activity yet.</p>;
  return <div className="history">{data.map(event => {
    const initialHolder = event.before_data === null ? members.find(member => member.id === event.after_data.holder_id) : undefined;
    return <article className="event" key={event.id}>{showDevice && <h3>{event.device_name}</h3>}<p>{initialHolder ? `Registered with ${initialHolder.name} / ${initialHolder.team}` : event.action}</p><span>{formatDate(event.created_at)} · {event.actor}</span></article>;
  })}</div>;
}

const fields: { key: keyof DeviceInput; label: string; required?: boolean; max: number }[] = [
  { key: "name", label: "Device name", required: true, max: 160 }, { key: "model_name", label: "Model", required: true, max: 120 },
  { key: "serial_number", label: "Serial number", max: 120 }, { key: "capacity", label: "Capacity", max: 80 },
  { key: "ram", label: "RAM", max: 80 },
  { key: "model_number", label: "Model number", max: 120 }, { key: "ios_version", label: "OS version", max: 80 },
  { key: "wifi_address", label: "Wi-Fi address", max: 17 }, { key: "bluetooth_address", label: "Bluetooth address", max: 17 },
  { key: "barcode", label: "Barcode / asset code", max: 200 }
];

function Editor({ modal, members, onClose, onSaved, returnFocus }: { returnFocus?: HTMLElement | null; modal: Exclude<NonNullable<Modal>, { kind: "assign" }>; members: Member[]; onClose: () => void; onSaved: (device?: Device) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const title = modal.kind === "member" ? "Add person" : "Edit device";
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => { opener.current = document.activeElement as HTMLElement; }, []);
  return <Dialog.Root open onOpenChange={open => { if (!open && !pending) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="modal dialog-content" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); (returnFocus ?? opener.current)?.focus(); }} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()}>
    <div className="modal-header"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="icon-button" aria-label="Close" title="Close" disabled={pending}><X size={18} /></Dialog.Close></div>
    <EditorForm modal={modal} pending={pending} setPending={setPending} onClose={onClose} onSaved={onSaved} />
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function EditorForm({ modal, pending, setPending, onClose, onSaved, focusOnMount = false }: { modal: Exclude<NonNullable<Modal>, { kind: "assign" }>; pending: boolean; setPending: (pending: boolean) => void; onClose: () => void; onSaved: (device?: Device) => Promise<void>; focusOnMount?: boolean }) {
  const [error, setError] = useState("");
  const [team, setTeam] = useState<Team>(teams[0]);
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => { if (focusOnMount) formRef.current?.querySelector<HTMLElement>('[role="combobox"], input')?.focus(); }, [focusOnMount]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      if (modal.kind === "member") {
        await addMember({ name: String(form.get("name")).trim(), team, role: String(form.get("role")).trim() });
        await onSaved();
      } else {
        const input = Object.fromEntries(fields.map(field => [field.key, String(form.get(field.key) || "").trim()])) as unknown as DeviceInput;
        const platform = String(form.get("platform"));
        if (!platforms.includes(platform as Platform)) throw new Error("Choose iOS or Android.");
        input.platform = platform as Platform;
        input.allocation_team = (String(form.get("allocation_team") || "") || null) as Team | null;
        input.serial_number ||= null;
        input.capacity ||= null;
        input.barcode ||= input.serial_number || `EQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        for (const field of fields) if (field.required && !input[field.key]) throw new Error(`${field.label} is required.`);
        await onSaved(await saveDevice(input, modal.device));
      }
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  return <form ref={formRef} className="modal-form" onSubmit={submit}><fieldset disabled={pending} className="editor-fields">
      {modal.kind === "device" && <label>Platform<AppSelect disabled={pending} name="platform" aria-label="Platform" required defaultValue={modal.device?.platform ?? ""}><option value="" disabled>Select platform</option>{platforms.map(value => <option key={value}>{value}</option>)}</AppSelect></label>}
      {modal.kind === "device" && <label>Device team<AppSelect disabled={pending} name="allocation_team" aria-label="Device team" defaultValue={modal.device?.allocation_team ?? ""}><option value="">Not recorded</option>{teams.map(value => <option key={value}>{value}</option>)}</AppSelect></label>}
      {modal.kind === "device" && fields.map(field => <label key={field.key}>{field.label}{!field.required && <span className="optional">Optional</span>}<input aria-label={field.label} name={field.key} defaultValue={String(modal.device?.[field.key] ?? "")} required={field.required} maxLength={field.max} pattern={field.key.endsWith("_address") ? "([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}" : undefined} title={field.key.endsWith("_address") ? "Six hexadecimal pairs separated by colons" : undefined} /></label>)}
      {modal.kind === "member" && <><label>Full name<input name="name" required maxLength={120} /></label><label>Role<input name="role" maxLength={160} /></label></>}
      {modal.kind !== "device" && <label>Team<AppSelect aria-label="Team" disabled={pending} value={team} onValueChange={value => setTeam(value as Team)}>{teams.map(value => <option key={value}>{value}</option>)}</AppSelect></label>}
    </fieldset>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" type="button" disabled={pending} onClick={onClose}>Cancel</button><button className="button primary" disabled={pending}>{pending ? "Saving..." : "Save"}</button></div></form>;
}
