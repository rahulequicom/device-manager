"use client";
import { appPath } from "@/lib/app-path";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/register-api";
import { Layers3 } from "lucide-react";

export function EmployeeSignup() {
  const [client] = useState(getSupabase);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [temporary, setTemporary] = useState("");
  const [created, setCreated] = useState(false);
  const [login, setLogin] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!client) { setReady(true); return; }
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setReady(true); if (next) setTemporary(""); }
    });
    client.auth.getSession().then(({ error }) => { if (active && error) { setFailure(errorMessage(error)); setReady(true); } }).catch(error => { if (active) { setFailure(errorMessage(error)); setReady(true); } });
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const message = hash.get("error_description");
    if (message) setFailure(message);
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);
  function redirectUrl() {
    // This project's existing redirect allowlist includes localhost:3000/**.
    const origin = window.location.hostname === "127.0.0.1" ? window.location.origin.replace("127.0.0.1", "localhost") : window.location.origin;
    return `${origin}${appPath("/signup")}`;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || lock.current) return;
    const element = event.currentTarget; const form = new FormData(element);
    lock.current = true; setBusy(true); setFailure(""); setNotice("");
    try {
      if (session) {
        if (!passwordSaved) {
          const password = String(form.get("password") || "");
          if (password.length < 12) throw new Error("Choose a password with at least 12 characters.");
          if (password !== form.get("confirm")) throw new Error("Passwords do not match.");
          const changed = await client.auth.updateUser({ password });
          if (changed.error) throw changed.error;
          setPasswordSaved(true); element.reset();
        }
        const admin = await client.from("dm_admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
        if (admin.error) throw admin.error;
        if (admin.data) { window.location.assign(appPath("/admin")); return; }
        const activated = await client.rpc("dm_activate_employee");
        if (activated.error) throw activated.error;
        window.location.assign(appPath("/?cloud=1"));
      } else if (login) {
        const result = await client.auth.signInWithPassword({ email: email.trim(), password: String(form.get("temporary")) });
        if (result.error) throw result.error;
        element.reset();
      } else {
        // Generated on this device, never stored in localStorage or logged.
        const bytes = crypto.getRandomValues(new Uint8Array(24));
        const password = `Tmp!${Array.from(bytes, b => b.toString(16).padStart(2,"0")).join("")}aA9`;
        const result = await client.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: redirectUrl() } });
        if (result.error) throw result.error;
        if (result.data.user?.identities?.length === 0) throw new Error("If you already registered, sign in with your existing password or reset it.");
        setTemporary(result.data.session ? "" : password); setCreated(true);
      }
    } catch (error) { setFailure(errorMessage(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function recover() {
    if (!client || !email.trim() || busy) { setFailure("Enter your work email first."); return; }
    setBusy(true); setFailure("");
    try {
      const result = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl() });
      if (result.error) throw result.error;
      setNotice("If an account exists, check your work inbox for the password setup link.");
    } catch (error) { setFailure(errorMessage(error)); } finally { setBusy(false); }
  }
  const title = session ? (passwordSaved ? "Finish account setup" : "Create your password") : created ? "Verify your work email" : login ? "Continue account setup" : "Join your device workspace";
  return <main className="signup-page"><section className="signup-story"><a className="brand" href={appPath("/")}><span className="brand-mark"><Layers3 size={24} /></span><span>Device<strong>Management</strong></span></a><p className="eyebrow">For your team</p><h1>Your devices.<br />Your workspace.</h1><p>Register a device, keep track of what’s yours, and make every handover simple.</p><ol><li>Register with your approved work email</li><li>Verify your inbox and set your own password</li><li>See the devices assigned to you</li></ol></section><section className="signup-form-panel"><div className="signup-form-content"><p className="eyebrow">Employee registration</p><h2>{title}</h2>
    {!ready ? <p role="status">Checking your session...</p> : !client ? <p role="alert">Supabase connection is not configured.</p> : <>
    {created && !session && <div className="signup-instructions"><p>Check your work inbox for the verification link. Save this temporary password now; it won’t be shown again after you leave this page. If the link opens a signed-in session, you can set your own password immediately.</p><label>Temporary password<input aria-label="Temporary password" value={temporary} readOnly type="text" autoComplete="off" /></label><button type="button" className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(temporary); setNotice("Temporary password copied."); } catch { setFailure("Select and copy the temporary password manually."); } }}>Copy temporary password</button><button className="text-button" onClick={() => { setCreated(false); setLogin(true); setTemporary(""); }}>Email verified? Continue setup</button></div>}
    {!created || session ? <form className="modal-form" onSubmit={submit}>
      {session ? <><p>Signed in as <strong>{session.user.email}</strong></p>{!passwordSaved && <><label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label><label>Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={12} required /></label><p className="muted">Use at least 12 characters. Your temporary password will be replaced.</p></>}<p className="muted">Approved admins open the admin workspace. Employee access requires an approved, verified work email.</p></> : <><label>Work email<input type="email" name="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" /></label>{login ? <label>Temporary or existing password<input name="temporary" type="password" autoComplete="current-password" required /></label> : <p className="muted">We’ll generate a temporary password for your account. Your administrator must approve your work email before devices become available.</p>}</>}
      <button className="button primary" disabled={busy}>{busy ? "Please wait..." : session ? passwordSaved ? "Retry account access" : "Save password and open devices" : login ? "Continue" : "Create employee account"}</button>
    </form> : null}
    {failure && <p role="alert" className="form-error">{failure}</p>}{notice && <p role="status">{notice}</p>}
    {session ? <button className="text-button" disabled={busy} onClick={async () => { const result = await client.auth.signOut(); if (result.error) setFailure(errorMessage(result.error)); else { setPasswordSaved(false); setCreated(false); setLogin(true); } }}>Use a different account</button> : !created && <><button className="text-button" disabled={busy} onClick={() => { setLogin(!login); setFailure(""); }}>{login ? "Create an account" : "Already registered? Continue setup"}</button>{login && <button className="text-button" disabled={busy} onClick={() => void recover()}>Lost your password? Send a setup link</button>}</>}
    <a className="signup-back" href={appPath("/?cloud=1")}>Back to sign in</a>
    </>}
  </div></section></main>;
}
