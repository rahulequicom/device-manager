"use client";
import {useState} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type {Device} from "@/lib/device-data";
import {changeDevice,errorMessage} from "@/lib/register-api";

export function InventoryAssignmentActions({device,onTransfer,onEdit,onSaved}:{device:Device;onTransfer:()=>void;onEdit:()=>void;onSaved:(device:Device)=>Promise<void>}) {
 const [deleting,setDeleting]=useState(false);
 const [open,setOpen]=useState(false),[pending,setPending]=useState(false),[failure,setFailure]=useState("");

 async function remove(){
  if(pending)return;setPending(true);setFailure("");
  try{await onSaved(await changeDevice(device,deleting?{retired:true}:{holder_id:null,availability_confirmed:true}));setOpen(false);}
  catch(error){setFailure(errorMessage(error));}finally{setPending(false);}
 }
 return <div onClick={event=>event.stopPropagation()} className="person-actions">
  <button className="button secondary" onClick={onEdit}>Edit</button>
  {device.holder_id && !device.retired && <><button className="button secondary" onClick={onTransfer}>Transfer</button><button className="button secondary" onClick={()=>{setDeleting(false);setFailure("");setOpen(true);}}>Delete assignment</button></>}
  {!device.retired && <button className="button secondary" disabled={!!device.holder_id} title={device.holder_id?"Clear or transfer the assignment first":"Remove device from inventory; preserve history"} onClick={()=>{setDeleting(true);setFailure("");setOpen(true);}}>Delete device</button>}
  <Dialog.Root open={open} onOpenChange={value=>{if(!pending)setOpen(value);}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content" onPointerDownOutside={event=>event.preventDefault()} onEscapeKeyDown={event=>{if(pending)event.preventDefault();}}>
   <div className="modal-header"><Dialog.Title>{deleting?"Delete device?":"Delete assignment?"}</Dialog.Title></div>
   <Dialog.Description>{deleting?`Remove ${device.name} from the normal inventory. Its history is kept. Restore it using the Retiring status filter and the device menu.`:`Remove the current holder from ${device.name} and make it available again. The device record and activity history are kept.`}</Dialog.Description>
   {failure&&<p role="alert" className="form-error">{failure}</p>}
   <div className="modal-actions"><button className="button secondary" disabled={pending} onClick={()=>setOpen(false)}>Cancel</button><button className="button primary" disabled={pending} onClick={()=>void remove()}>{pending?"Removing...":deleting?"Delete device":"Delete assignment"}</button></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
 </div>;
}
