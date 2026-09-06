"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../lib/supabase";

type HistoryItem = { id: string; stage: string; status: string; detail: string | null; created_at: string };

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [cuts, setCuts] = useState(3);
  const [duration, setDuration] = useState(30);
  const [captions, setCaptions] = useState(true);
  const [automation, setAutomation] = useState(false);
  const [instagram, setInstagram] = useState(false);
  const [instagramAuto, setInstagramAuto] = useState(false);
  const [tiktok, setTiktok] = useState(false);
  const [tiktokAuto, setTiktokAuto] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState("Entre para salvar sua automação.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!user) return;
    supabase.from("automation_history").select("*").order("created_at", { ascending: false }).limit(12)
      .then(({ data }) => setHistory((data as HistoryItem[]) ?? []));
  }, [supabase, user]);

  async function authenticate(mode: "login" | "signup") {
    setBusy(true);
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setStatus(result.error ? result.error.message : mode === "signup" ? "Conta criada. Confira seu e-mail para confirmar o cadastro." : "Login realizado.");
    setBusy(false);
  }

  async function saveAutomation(event: FormEvent) {
    event.preventDefault();
    if (!user) return setStatus("Entre na sua conta antes de continuar.");
    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(channelUrl.trim())) return setStatus("Informe um link válido do YouTube.");
    if (!file) return setStatus("Selecione o arquivo original do vídeo.");
    setBusy(true);
    setStatus("Enviando o vídeo com segurança...");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const objectPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("source-videos").upload(objectPath, file);
    if (upload.error) { setStatus(`Erro no envio: ${upload.error.message}`); setBusy(false); return; }
    const { data: saved, error } = await supabase.from("automations").insert({
      user_id: user.id, channel_url: channelUrl.trim(), cuts_per_video: cuts, clip_duration: duration,
      captions_enabled: captions, automation_enabled: automation, instagram_enabled: instagram,
      instagram_auto_publish: instagram && instagramAuto, tiktok_enabled: tiktok,
      tiktok_auto_publish: tiktok && tiktokAuto,
    }).select("id").single();
    if (error) { setStatus(`Erro ao salvar: ${error.message}`); setBusy(false); return; }
    const steps = [
      { stage: "Canal conectado", status: "done", detail: channelUrl.trim() },
      { stage: "Vídeo enviado", status: "done", detail: file.name },
      { stage: "Aguardando processamento", status: "active", detail: `${cuts} cortes de ${duration}s` },
    ].map((item) => ({ ...item, automation_id: saved.id, user_id: user.id }));
    const historyResult = await supabase.from("automation_history").insert(steps).select("*");
    if (historyResult.data) setHistory([...(historyResult.data as HistoryItem[]).reverse(), ...history]);
    setStatus("Automação salva e vídeo enviado. Pronto para a próxima fase de processamento.");
    setBusy(false);
  }

  return <main><div className="wrap">
    <nav className="nav"><div className="brand">ClipIA</div><div className="badge">{user ? user.email : "Fase 1 conectada"}</div></nav>
    <section className="hero"><span className="heroTag">YouTube → cortes → redes sociais</span><h1>Transforme seu canal em uma máquina de cortes.</h1><p>Entre, envie o arquivo original e salve seu fluxo de automação com segurança.</p></section>
    {!user && <section className="auth card">
      <div><span className="muted small">SUA CONTA</span><h2>Entrar no ClipIA</h2></div>
      <input className="field" type="email" placeholder="Seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="field" type="password" placeholder="Senha (mínimo 6 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn" disabled={busy} onClick={() => authenticate("login")}>Entrar</button>
      <button className="btn secondary" disabled={busy} onClick={() => authenticate("signup")}>Criar conta</button>
      <div className="status">{status}</div>
    </section>}
    {user && <section className="grid">
      <form className="card" onSubmit={saveAutomation}>
        <h2>Configurar automação</h2>
        <label className="label">Link do canal do YouTube</label><input className="field" type="url" placeholder="https://youtube.com/@seucanal" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} required />
        <label className="label">Arquivo original do vídeo</label><input className="field" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        <div className="row">
          <div><label className="label">Cortes por vídeo</label><select className="field" value={cuts} onChange={(e) => setCuts(Number(e.target.value))}><option value={3}>3 cortes</option><option value={5}>5 cortes</option><option value={10}>10 cortes</option></select></div>
          <div><label className="label">Duração</label><select className="field" value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={15}>15 segundos</option><option value={30}>30 segundos</option><option value={45}>45 segundos</option><option value={60}>60 segundos</option></select></div>
        </div>
        <div className="toggleList"><Toggle label="Legendas automáticas" checked={captions} onChange={setCaptions}/><Toggle label="Automação para novos vídeos" checked={automation} onChange={setAutomation}/></div>
        <div className="socialGrid"><Social name="Instagram" enabled={instagram} setEnabled={setInstagram} auto={instagramAuto} setAuto={setInstagramAuto}/><Social name="TikTok" enabled={tiktok} setEnabled={setTiktok} auto={tiktokAuto} setAuto={setTiktokAuto}/></div>
        <button className="btn" disabled={busy}>{busy ? "Salvando..." : "Enviar vídeo e salvar"}</button>
        <div className="status" aria-live="polite">{status}</div>
        <button className="textButton" type="button" onClick={() => supabase.auth.signOut()}>Sair da conta</button>
      </form>
      <aside className="card"><span className="muted small">HISTÓRICO REAL</span><h2>Etapas do fluxo</h2><div className="steps">{history.length === 0 ? <p className="muted">Nenhuma automação salva ainda.</p> : history.map((item) => <div className={`step ${item.status}`} key={item.id}><span className="stepDot">{item.status === "done" ? "✓" : "•"}</span><div><strong>{item.stage}</strong><p>{item.detail}</p></div></div>)}</div></aside>
    </section>}
    <footer className="footer">© 2026 ClipIA · Seus vídeos ficam em armazenamento privado.</footer>
  </div></main>;
}

function Toggle({label, checked, onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}) { return <label className="toggleRow"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e)=>onChange(e.target.checked)}/></label>; }
function Social({name,enabled,setEnabled,auto,setAuto}:{name:string;enabled:boolean;setEnabled:(v:boolean)=>void;auto:boolean;setAuto:(v:boolean)=>void}) { return <div className="socialCard"><label className="toggleRow"><strong>{name}</strong><input type="checkbox" checked={enabled} onChange={(e)=>{setEnabled(e.target.checked);if(!e.target.checked)setAuto(false)}}/></label><label className="autoOption"><input type="checkbox" checked={auto} disabled={!enabled} onChange={(e)=>setAuto(e.target.checked)}/> Publicação automática</label></div>; }
