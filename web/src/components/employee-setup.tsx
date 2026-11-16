"use client";
import { useState, type FormEvent } from "react";
import { teams, type EmployeeDevice, type Member } from "@/lib/device-data";
import { saveEmployeeProfile } from "@/lib/employee-api";
import { errorMessage } from "@/lib/register-api";

const roles = ["Developer", "QA Tester", "Designer", "Team Lead", "Other"];
export function EmployeeSetup({ memberId, person, devices, onSaved, onSignOut }: {
  memberId: string; person: Member | undefined; devices: EmployeeDevice[];
  onSaved: () => Promise<void>; onSignOut?: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const choices = devices.filter(device => !device.retired && (!device.holder_id || device.holder_id === memberId));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    const selected = choices.find(device => device.id === form.get("device"));
    setPending(true); setFailure("");
    try {
      await saveEmployeeProfile(String(form.get("team") || ""), String(form.get("role") || ""), selected);
      await onSaved();
    } catch (error) { setFailure(errorMessage(error)); }
    finally { setPending(false); }
  }
  return <main className="access-page"><section className="access-content"><p className="eyebrow">One quick setup</p><h1>Your team and mobile</h1><p>Choose your team, your role, and the mobile you have.</p><form className="modal-form" onSubmit={submit}><fieldset className="editor-fields" disabled={pending}>
    <label>Team<select aria-label="Team" name="team" required defaultValue={person?.team === "Unassigned" ? "" : person?.team || ""}><option value="" disabled>Choose your team</option>{teams.map(team => <option key={team}>{team}</option>)}</select></label>
    <label>Role<select aria-label="Role" name="role" required defaultValue={roles.includes(person?.role || "") ? person?.role : ""}><option value="" disabled>Choose your role</option>{roles.map(role => <option key={role}>{role}</option>)}</select></label>
    <label>Mobile you have<select aria-label="Mobile you have" name="device" defaultValue={choices.find(device => device.holder_id === memberId)?.id || ""}><option value="">I don’t have a mobile yet</option>{choices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>
    </fieldset>{failure && <p role="alert" className="form-error">{failure}</p>}<button className="button primary" disabled={pending}>{pending ? "Saving..." : "Save and continue"}</button></form>{onSignOut && <button className="text-button" disabled={pending} onClick={() => void onSignOut()}>Sign out</button>}</section></main>;
}
