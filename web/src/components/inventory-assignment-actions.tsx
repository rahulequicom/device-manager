"use client";
import {useState} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type {Device} from "@/lib/device-data";
import {changeDevice,errorMessage} from "@/lib/register-api";

export function InventoryAssignmentActions({device,onTransfer,onSaved}:{device:Device;onTransfer:()=>void;onSaved:(device:Device)=>Promise<void>}) {
 const [open,setOpen]=useState(false),[pending,setPending]=useState(false),[failure,setFailure]=useState("");
 if(!device.holder_id||device.retired)return null;
 async function remove(){
  if(pending)return;setPending(true);setFailure("");
  try{await onSaved(await changeDevice(device,{holder_id:null,availability_confirmed:true}));setOpen(false);}
  catch(error){setFailure(errorMessage(error));}finally{setPending(false);}
 }
 return <div onClick={event=>event.stopPropagation()} className="person-actions">
  <button className="button secondary" onClick={onTransfer}>Transfer</button>
  <button className="button secondary" onClick={()=>{setFailure("");setOpen(true);}}>Delete assignment</button>
  <Dialog.Root open={open} onOpenChange={value=>{if(!pending)setOpen(value);}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content" onPointerDownOutside={event=>event.preventDefault()} onEscapeKeyDown={event=>{if(pending)event.preventDefault();}}>
   <div className="modal-header"><Dialog.Title>Delete assignment?</Dialog.Title></div>
   <Dialog.Description>Remove the current holder from {device.name} and make it available again. The device record and activity history are kept.</Dialog.Description>
   {failure&&<p role="alert" className="form-error">{failure}</p>}
   <div className="modal-actions"><button className="button secondary" disabled={pending} onClick={()=>setOpen(false)}>Cancel</button><button className="button primary" disabled={pending} onClick={()=>void remove()}>{pending?"Removing...":"Delete assignment"}</button></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
 </div>;
}
