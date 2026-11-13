"use client";
import { useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, X } from "lucide-react";
import { type Device, type Member } from "@/lib/device-data";
import { changeDevice, errorMessage } from "@/lib/register-api";

export function AssignmentDialog({ device, members, onClose, onMemberCreated, onSaved }: {
  device: Device; members: Member[]; onClose: () => void;
  onMemberCreated: (member: Member) => Promise<void>;
  onSaved: (device: Device) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<Member | null>(null);
  const candidates = members.filter(member => member.id !== device.holder_id);
  const matches = candidates.filter(member => `${member.name} ${member.team} ${member.role}`.toLowerCase().includes(query.trim().toLowerCase()));
  const suggested = candidates.filter(member => member.team === device.allocation_team).slice(0, 3);
  const visiblePeople = (query.trim() ? matches : (suggested.length ? suggested : candidates)).slice(0, 3);
  const current = members.find(member => member.id === device.holder_id);
  const transfer = !!device.holder_id;
  const recipient = selectedRecipient;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setPending(true); setError("");
    try {
      const recipientToSave = selectedRecipient;
      if (!recipientToSave) throw new Error("Choose a person.");
      if (recipientToSave.id === device.holder_id) throw new Error("This person already holds the device.");
      await onSaved(await changeDevice(device, { holder_id: recipientToSave.id, availability_confirmed: true }));
    } catch (cause) { setError(errorMessage(cause)); }
    finally { lock.current = false; setPending(false); }
  }

  return <Dialog.Root open onOpenChange={open => { if (!open && !pending) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className="modal dialog-content assignment-dialog" aria-describedby={undefined} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()}>
      <div className="modal-header"><Dialog.Title>{transfer ? "Transfer device" : "Assign device"}</Dialog.Title><Dialog.Close className="icon-button" title="Close" aria-label="Close" disabled={pending}><X size={18} /></Dialog.Close></div>
      <div className="handover-summary"><strong>{device.name}</strong><span>{device.serial_number || device.barcode}</span></div>
      {transfer && <div className="handover-route" aria-label="Transfer direction"><div><span>From</span><strong>{current?.name ?? "Current holder not recorded"}</strong></div><ArrowRight size={18} aria-hidden="true" /><div><span>To</span><strong>{recipient?.name ?? "Choose a person"}</strong></div></div>}
      <form className="modal-form" onSubmit={submit}><fieldset className="assignment-fields" disabled={pending}>
        <div className="recipient-picker"><label>{transfer ? "Transfer to" : "Assign to"}<input value={query} onFocus={() => setPickerOpen(true)} onChange={event => { setQuery(event.target.value); setSelectedRecipient(null); setPickerOpen(true); }} autoComplete="off" maxLength={120} placeholder="Search people" /></label>
        {pickerOpen && !selectedRecipient && <div className="recipient-results" role="listbox" aria-label="People"><p>{query.trim() ? "Results" : "Suggested"}</p>{visiblePeople.map(member => <button type="button" role="option" aria-selected={false} key={member.id} onMouseDown={event => event.preventDefault()} onClick={() => { setSelectedRecipient(member); setQuery(member.name); setPickerOpen(false); }}><span className="recipient-avatar" aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span><span className="recipient-details"><strong>{member.name}</strong><small>{member.team}</small></span></button>)}{!visiblePeople.length && <p className="recipient-empty">No people found</p>}</div>}</div>
        {selectedRecipient && <div className="recipient-choice"><span><strong>{selectedRecipient.name}</strong><small>{selectedRecipient.team}</small></span><button type="button" onClick={() => { setSelectedRecipient(null); setQuery(""); setPickerOpen(true); }}>Change</button></div>}
      </fieldset>{error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" disabled={pending} onClick={onClose}>Cancel</button><button className="button primary" disabled={pending}>{pending ? "Saving..." : transfer ? "Confirm transfer" : "Assign device"}</button></div></form>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
