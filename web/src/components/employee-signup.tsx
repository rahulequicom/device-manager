"use client";
import { newPasswordError } from "@/lib/password-policy";
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
  const [created, setCreated] = useState(false);
  const [login, setLogin] = useState(false);
  const [requestReset, setRequestReset] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!client) { setReady(true); return; }
    let active = true;
    if (new URLSearchParams(window.location.search).get("mode") === "reset") { setRequestReset(true); setLogin(true); }
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (active) { setSession(next); setReady(true); if (event === "PASSWORD_RECOVERY") setRecovery(true); }
    });
    client.auth.getSession().then(({ error }) => { if (active && error) { setFailure(errorMessage(error)); setReady(true); } }).catch(error => { if (active) { setFailure(errorMessage(error)); setReady(true); } });
    const message = new URLSearchParams(window.location.hash.slice(1)).get("error_description");
    if (message) setFailure(message);
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);
  function redirectUrl() {
    const origin = window.location.hostname === "127.0.0.1" ? window.location.origin.replace("127.0.0.1", "localhost") : window.location.origin;
    return `${origin}${appPath("/signup")}`;
  }
  async function openWorkspace() {
    if (!client || !session) return;
    const admin = await client.from("dm_admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (admin.error) throw admin.error;
    if (admin.data) { window.location.assign(appPath("/admin")); return; }
    const activated = await client.rpc("dm_activate_employee");
    if (activated.error) throw activated.error;
    window.location.assign(appPath("/?cloud=1"));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || lock.current) return;
    if (!session && requestReset) { await recover(); return; }
    const element = event.currentTarget; const form = new FormData(element);
    lock.current = true; setBusy(true); setFailure(""); setNotice("");
    try {
      if (session) {
        if (recovery) {
          const password = String(form.get("password") || "");
          const invalid = newPasswordError(password, String(form.get("confirm") || ""));
          if (invalid) throw new Error(invalid);
          const changed = await client.auth.updateUser({ password });
          if (changed.error) throw changed.error;
          element.reset(); setRecovery(false); setNotice("Password updated.");
        }
        await openWorkspace();
      } else if (login) {
        const result = await client.auth.signInWithPassword({ email: email.trim(), password: String(form.get("password")) });
        if (result.error) throw result.error;
        element.reset();
      } else {
        const password = String(form.get("password") || "");
        const invalid = newPasswordError(password, String(form.get("confirm") || ""));
        if (invalid) throw new Error(invalid);
        const result = await client.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: redirectUrl() } });
        if (result.error) throw result.error;
        if (result.data.user?.identities?.length === 0) throw new Error("If you already registered, sign in with your existing password or reset it.");
        element.reset(); setCreated(true);
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
      setNotice("If an account exists, check your inbox for the password reset link. Your password is unchanged until you save a new one.");
    } catch (error) { setFailure(errorMessage(error)); } finally { setBusy(false); }
  }
  const title = session ? recovery ? "Reset your password" : "Open your workspace" : requestReset ? "Reset your password" : created ? "Verify your work email" : login ? "Sign in" : "Join your device workspace";
  return <main className="signup-page"><section className="signup-story"><a className="brand" href={appPath("/")}><span className="brand-mark"><Layers3 size={24} /></span><span>Device<strong>Management</strong></span></a><p className="eyebrow">For your team</p><h1>Your devices.<br />Your workspace.</h1><p>Register a device, keep track of what’s yours, and make every handover simple.</p><ol><li>Register with your approved work email</li><li>Choose your password and verify your email</li><li>See the devices assigned to you</li></ol></section><section className="signup-form-panel"><div className="signup-form-content"><p className="eyebrow">Account access</p><h2>{title}</h2>
    {!ready ? <p role="status">Checking your session...</p> : !client ? <p role="alert">Supabase connection is not configured.</p> : <>
    {created && !session ? <div className="signup-instructions"><p>Check your work inbox for the verification link, then sign in with the password you chose.</p><button className="button secondary" onClick={() => { setCreated(false); setLogin(true); }}>Email verified? Sign in</button></div> : <form className="modal-form" onSubmit={submit}>
      {session ? <p>Signed in as <strong>{session.user.email}</strong></p> : <label>Work email<input type="email" name="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" /></label>}
      {((!session && !requestReset) || recovery) && <><label>{recovery ? "New password" : "Password"}<input name="password" type="password" autoComplete={login && !recovery ? "current-password" : "new-password"} minLength={login && !recovery ? undefined : 6} maxLength={login && !recovery ? undefined : 6} inputMode={login && !recovery ? undefined : "numeric"} pattern={login && !recovery ? undefined : "[0-9]{6}"} required /></label>{(!login || recovery) && <label>Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={6} maxLength={6} inputMode="numeric" pattern="[0-9]{6}" required /></label>}{(!login || recovery) && <p className="muted">Choose exactly six digits (0–9). Use the same password when you sign in.</p>}</>}
      {!session && !login && !requestReset && <p className="muted">Your work email must be approved before you can access employee devices.</p>}
      <button className="button primary" disabled={busy}>{busy ? "Please wait..." : session ? recovery ? "Save password and continue" : "Continue to workspace" : requestReset ? "Send reset email" : login ? "Sign in" : "Create account"}</button>
    </form>}
    {failure && <p role="alert" className="form-error">{failure}</p>}{notice && <p role="status">{notice}</p>}
    {session ? <button className="text-button" disabled={busy} onClick={async () => { const result = await client.auth.signOut(); if (result.error) setFailure(errorMessage(result.error)); else { setCreated(false); setRecovery(false); setLogin(true); } }}>Use a different account</button> : !created && <><button className="text-button" disabled={busy} onClick={() => { setLogin(requestReset ? true : !login); setRequestReset(false); setFailure(""); setNotice(""); }}>{requestReset ? "Back to sign in" : login ? "Create an account" : "Already registered? Sign in"}</button>{login && !requestReset && <button className="text-button" disabled={busy} onClick={() => { setRequestReset(true); setFailure(""); setNotice(""); }}>Forgot your password?</button>}</>}
    <a className="signup-back" href={appPath("/?cloud=1")}>Back to sign in</a>
    </>}
  </div></section></main>;
}
