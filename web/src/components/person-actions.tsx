"use client";
import {useState} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type {Member} from "@/lib/device-data";
import {setEmployeeAdmin, type EmployeeAccess, setPersonState} from "@/lib/admin-employees";
import {errorMessage} from "@/lib/register-api";
export function PersonActions({person,held,access,onChanged}:{person:Member;held:number;access?:EmployeeAccess;onChanged:()=>Promise<void>}) {
  const [pending,setPending]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [confirmAdmin,setConfirmAdmin]=useState(false);
  const [failure,setFailure]=useState("");
  async function change(action:"activate"|"deactivate"|"delete"|"restore") {
    if(pending)return;
    setPending(true);setFailure("");
    try{await setPersonState(person.id,action);await onChanged();setConfirmDelete(false);}
    catch(error){setFailure(errorMessage(error));}
    finally{setPending(false);}
  }
  async function changeAdmin() {
    if(pending||!access)return;
    setPending(true);setFailure("");
    try{await setEmployeeAdmin(person.id,!access.is_admin);await onChanged();setConfirmAdmin(false);}
    catch(error){setFailure(errorMessage(error));}
    finally{setPending(false);}
  }
  return <><div className="person-actions">{access && <><span className="muted">{access.is_admin?"Admin":"Employee"}{access.is_self?" (you)":""}</span><button className="button secondary" disabled={pending||access.is_self||(!access.is_admin&&(person.is_active===false||!!person.deleted_at))} onClick={()=>{setFailure("");setConfirmAdmin(true);}}>{access.is_admin?"Revoke admin":"Grant admin"}</button></>}{person.deleted_at ? <button className="button secondary" disabled={pending} onClick={()=>void change("restore")}>Restore</button> : <>
    <button className="button secondary" disabled={pending||access?.is_admin} onClick={()=>void change(person.is_active===false?"activate":"deactivate")}>{person.is_active===false?"Activate":"Deactivate"}</button>
    <button className="button secondary" disabled={pending||held>0||access?.is_admin} title={held>0?"Return or transfer their devices before deleting":"Remove this person from People"} onClick={()=>{setFailure("");setConfirmDelete(true);}}>Delete</button>
    {held>0&&<small className="muted">Return or transfer their devices first.</small>}</>}</div>{failure&&!confirmDelete&&!confirmAdmin&&<p className="form-error" role="alert">{failure}</p>}
    <Dialog.Root open={confirmAdmin} onOpenChange={open=>{if(!pending)setConfirmAdmin(open);}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content" onPointerDownOutside={event=>event.preventDefault()} onEscapeKeyDown={event=>{if(pending)event.preventDefault();}}>
      <div className="modal-header"><Dialog.Title>{access?.is_admin?"Revoke":"Grant"} admin access for {person.name}?</Dialog.Title></div>
      <Dialog.Description>{access?.is_admin?"They will keep their employee login but lose administration access.":"They will have full admin control: manage all devices, view specifications and activity, manage people, and grant or revoke admin access for other employees."}</Dialog.Description>
      {failure&&<p className="form-error" role="alert">{failure}</p>}
      <div className="modal-actions"><button className="button secondary" disabled={pending} onClick={()=>setConfirmAdmin(false)}>Cancel</button><button className="button primary" disabled={pending} onClick={()=>void changeAdmin()}>{pending?"Saving...":access?.is_admin?"Revoke admin":"Grant admin"}</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={confirmDelete} onOpenChange={open=>{if(!pending)setConfirmDelete(open);}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content" onPointerDownOutside={event=>event.preventDefault()} onEscapeKeyDown={event=>{if(pending)event.preventDefault();}}>
      <div className="modal-header"><Dialog.Title>Delete {person.name}?</Dialog.Title></div>
      <Dialog.Description>Remove this person from People and block inventory access. Activity history is kept. You can restore them using Show deleted people.</Dialog.Description>
      {failure&&<p className="form-error" role="alert">{failure}</p>}
      <div className="modal-actions"><button className="button secondary" disabled={pending} onClick={()=>setConfirmDelete(false)}>Cancel</button><button className="button primary" disabled={pending} onClick={()=>void change("delete")}>{pending?"Deleting...":"Delete person"}</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
