"use client";
import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useSWRConfig } from "swr";
import { useTeams, saveTeam } from "@/lib/teams";
import { isLocalInventory } from "@/lib/local-register";
import { errorMessage } from "@/lib/register-api";

export function TeamManager({ onSelect }: { onSelect?: (name: string) => void }) {
  const { teams, mutate, error } = useTeams();
  const { mutate: mutateCache } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [previous, setPrevious] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); event.stopPropagation(); if (pending) return;
    setPending(true); setFailure("");
    try {
      const saved = await saveTeam(name, previous);
      await mutate();
      await Promise.all([mutateCache("register"), mutateCache("employee-register")]);
      onSelect?.(saved); setPrevious(null); setName("");
    } catch (cause) { setFailure(errorMessage(cause)); }
    finally { setPending(false); }
  }
  if (isLocalInventory()) return null;
  return <Dialog.Root open={open} onOpenChange={value => { if (!pending) { setOpen(value); setFailure(""); } }}>
    <Dialog.Trigger asChild><button type="button" className="button secondary">Manage teams</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content" onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }}>
      <div className="modal-header"><Dialog.Title>Manage teams</Dialog.Title></div>
      <Dialog.Description>Add a team or rename an existing team. Renaming updates its people, devices and pending logins.</Dialog.Description>
      <div className="team-manager-list">{teams.map(team => <div className="recipient-choice" key={team}><strong>{team}</strong><button type="button" className="button secondary" disabled={pending} aria-label={`Rename ${team}`} onClick={() => { setPrevious(team); setName(team); setFailure(""); }}>Rename</button></div>)}</div>
      <form className="modal-form" onSubmit={submit}><label>{previous ? `Rename ${previous}` : "New team name"}<input aria-label="Team name" required maxLength={60} value={name} disabled={pending} onChange={event => setName(event.target.value)}/></label>
        {(failure || error) && <p className="form-error" role="alert">{failure || errorMessage(error)}</p>}
        <div className="modal-actions">{previous && <button type="button" className="button secondary" disabled={pending} onClick={() => { setPrevious(null); setName(""); }}>Cancel rename</button>}<button type="button" className="button secondary" disabled={pending} onClick={() => setOpen(false)}>Done</button><button className="button primary" disabled={pending || !name.trim()}>{pending ? "Saving..." : previous ? "Save team name" : "Add team"}</button></div>
      </form>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
