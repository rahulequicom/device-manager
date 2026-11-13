"use client";
import { useState } from "react";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import { errorMessage } from "@/lib/register-api";
import { activityTimestamp, activityTitle, activityMatches } from "@/lib/activity";
import type { AuditEvent, Member } from "@/lib/device-data";

export function ActivityFeed({ data, error, loading, refreshing, onRefresh, admin, members }: {
  data: AuditEvent[] | undefined; error: unknown; loading: boolean; refreshing: boolean;
  onRefresh: () => void; admin: boolean; members: Member[];
}) {
  const [query, setQuery] = useState("");
  const [employee, setEmployee] = useState("");
  const events = (data ?? []).filter(event => activityMatches(event, members, query, employee));
  return <section className="employee-activity" aria-label="Device activity">
    <div className="home-section-heading"><div><p className="eyebrow">{admin ? "Company history" : "Your device history"}</p><h2>{admin ? "All employee activity" : "Activity"}</h2><p className="activity-caption">{admin ? "Registrations, assignments, transfers, returns and updates across all employees." : "Registrations, transfers and changes involving you."} All times in IST (UTC+05:30).</p><p className="activity-caption">{data?.length ?? 0} recorded events{query || employee ? ` · ${events.length} matching` : ""}</p></div><div className="activity-controls">{admin && <label className="activity-employee-filter"><span className="sr-only">Filter by employee</span><select aria-label="Filter by employee" value={employee} onChange={event => setEmployee(event.target.value)}><option value="">All employees</option>{members.map(member => <option key={member.id} value={member.id}>{member.name} · {member.team}</option>)}</select></label>}<label className="search-field"><Search size={18} /><span className="sr-only">Search activity</span><input aria-label="Search activity" placeholder="Search device, person or asset code" value={query} onChange={event => setQuery(event.target.value)} /></label><button className="icon-button" aria-label="Refresh activity" disabled={refreshing} onClick={onRefresh}><RefreshCw size={17} /></button></div></div>
    {error ? <div className="error-banner" role="alert">{errorMessage(error)}<button className="button secondary" onClick={onRefresh}>Retry</button></div> : loading ? <p role="status">Loading activity...</p> : !events.length ? <div className="home-empty"><h3>{query || employee ? "No matching activity" : "No activity yet"}</h3><p>{query || employee ? "Try another device or employee filter." : "Device registrations and handovers will appear here."}</p></div> : <ol className="activity-timeline">{events.map(event => <li key={event.id} className="activity-entry"><span className="activity-icon" aria-hidden="true"><ArrowUpRight size={20} /></span><div className="activity-detail"><h3>{activityTitle(event, members)}</h3><p className="activity-device">{event.device_name}</p><dl><div><dt>Asset code</dt><dd>{event.after_data.barcode || event.before_data?.barcode || "Not recorded"}</dd></div><div><dt>Serial number</dt><dd>{event.after_data.serial_number || event.before_data?.serial_number || "Not recorded"}</dd></div><div><dt>Performed by</dt><dd>{event.actor}</dd></div></dl></div><time dateTime={event.created_at} title="India Standard Time">{activityTimestamp(event.created_at)}<small>IST · UTC+05:30</small></time></li>)}</ol>}
  </section>;
}
