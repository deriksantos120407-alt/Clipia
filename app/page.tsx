"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../lib/supabase";
import { getPlanByPriceId, PLANS, type PlanKey } from "../lib/billing";

type HistoryItem = { id: string; stage: string; status: string; detail: string | null; created_at: string };
type Subscription = { stripe_price_id: string | null; status: string; current_period_end: string | null };
type YouTubeResult = {
  error?: string;
  channel?: { id: string; title?: string };
  latestVideo?: { id?: string; title?: string; publishedAt?: string; url?: string } | null;
};

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
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

  const activeSubscription = subscription ? ["active", "trialing"].includes(subscription.status) : false;
  const currentPlan = getPlanByPriceId(subscription?.stripe_price_id);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!user) {
      setSubscription(null);
      setHistory([]);
      return;
    }

    supabase.from("automation_history").select("*").order("created_at", { ascending: false }).limit(12)
      .then(({ data }) => setHistory((data as HistoryItem[]) ?? []));

    supabase.from("subscriptions").select("stripe_price_id,status,current_period_end").maybeSingle()
      .then(({ data }) => setSubscription((data as Subscription | null) ?? null));
  }, [supabase, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      setStatus("Pagamento concluído. A assinatura será liberada assim que a Stripe confirmar.");
    }
  }, []);

  async function authenticate(mode: "login" | "signup") {
    setBusy(true);
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setStatus(result.error ? result.error.message : mode === "signup" ? "Conta criada. Confira seu e-mail para confirmar o cadastro." : "Login realizado.");
    setBusy(false);
  }

  async function choosePlan(plan: PlanKey) {
    if (!user) {
      setStatus("Entre ou crie sua conta antes de escolher um plano.");
      document.querySelector(".auth")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (!billingEnabled) {
      setStatus("Os pagamentos estão aguardando a liberação da Stripe.");
      return;
    }

    setBusy(true);
    setStatus("Abrindo pagamento seguro da Stripe...");
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`/api/billing/checkout?plan=${plan}`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    const payload = await response.json() as { url?: string; error?: string };
    if (!response.ok || !payload.url) {
      setStatus(payload.error ?? "Não foi possível abrir o pagamento.");
      setBusy(false);
      return;
    }
    window.location.href = payload.url;
  }

  async function saveAutomation(event: FormEvent) {
    event.preventDefault();
    if (!user) return setStatus("Entre na sua conta antes de continuar.");
    if (billingEnabled && !activeSubscription) return setStatus("Escolha um plano e ative sua assinatura antes de criar automações.");
    if (!/^https?:\/\/(www\.)?(youtube\.com|m\.youtube\.com)\//i.test(channelUrl.trim())) return setStatus("Informe o link de um canal do YouTube.");

    setBusy(true);
    setStatus("Localizando o canal e o vídeo mais recente...");

    const { data: { session } } = await supabase.auth.getSession();
    const youtubeResponse = await fetch("/api/youtube/latest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ channelUrl: channelUrl.trim() }),
    });
    const youtube = await youtubeResponse.json() as YouTubeResult;
    if (!youtubeResponse.ok) {
      setStatus(`Erro no YouTube: ${youtube.error ?? "não foi possível consultar o canal."}`);
      setBusy(false);
      return;
    }

    setStatus("Canal encontrado. Salvando a automação...");
    const { data: saved, error } = await supabase.from("automations").insert({
      user_id: user.id, channel_url: channelUrl.trim(), channel_id: youtube.channel?.id,
      last_video_id: youtube.latestVideo?.id ?? null, last_video_title: youtube.latestVideo?.title ?? null,
      last_checked_at: new Date().toISOString(), cuts_per_video: cuts, clip_duration: duration,
      captions_enabled: captions, automation_enabled: automation, instagram_enabled: instagram,
      instagram_auto_publish: instagram && instagramAuto, tiktok_enabled: tiktok,
      tiktok_auto_publish: tiktok && tiktokAuto,
    }).select("id").single();
    if (error) { setStatus(`Erro ao salvar: ${error.message}`); setBusy(false); return; }

    if (youtube.latestVideo?.id && youtube.latestVideo.url) {
      setStatus("Criando o trabalho de processamento...");
      const { error: jobError } = await supabase.from("processing_jobs").upsert({
        automation_id: saved.id,
        user_id: user.id,
        source_video_id: youtube.latestVideo.id,
        source_video_url: youtube.latestVideo.url,
        source_video_title: youtube.latestVideo.title ?? null,
        requested_cuts: cuts,
        clip_duration: duration,
        captions_enabled: captions,
        status: "queued",
      }, { onConflict: "user_id,source_video_id" });
      if (jobError) { setStatus(`Erro ao criar processamento: ${jobError.message}`); setBusy(false); return; }
    }

    const steps = [
      { stage: "Canal conectado", status: "done", detail: youtube.channel?.title ?? channelUrl.trim() },
      { stage: "Último vídeo detectado", status: youtube.latestVideo ? "done" : "active", detail: youtube.latestVideo?.title ?? "Nenhum vídeo público encontrado" },
      { stage: "Monitoramento", status: automation ? "active" : "done", detail: automation ? "Novos vídeos serão detectados" : "Configuração salva" },
      { stage: youtube.latestVideo ? "Processamento enfileirado" : "Cortes configurados", status: "active", detail: `${cuts} cortes de ${duration}s` },
    ].map((item) => ({ ...item, automation_id: saved.id, user_id: user.id }));

    const historyResult = await supabase.from("automation_history").insert(steps).select("*");
    if (historyResult.data) setHistory([...(historyResult.data as HistoryItem[]).reverse(), ...history]);
    setStatus(youtube.latestVideo
      ? `Vídeo enfileirado para gerar os cortes: ${youtube.latestVideo.title}`
      : "Automação salva. O canal ainda não possui vídeo público.");
    setBusy(false);
  }

  return <main><div className="wrap">
    <nav className="nav"><div className="brand">ClipIA</div><div className="badge">{user ? user.email : "YouTube → cortes automáticos"}</div></nav>
    <section className="hero"><span className="heroTag">YouTube → cortes → redes sociais</span><h1>Transforme seu canal em uma máquina de cortes.</h1><p>Entre, informe o canal do YouTube e configure seus cortes automáticos.</p></section>

    <section className="pricing" id="planos">
      <div className="sectionHeading"><span className="muted small">PLANOS MENSAIS</span><h2>Escolha o plano do ClipIA</h2><p className="muted">Os planos já estão criados na Stripe. A cobrança será ativada assim que a análise da conta for concluída.</p></div>
      <div className="pricingGrid">
        {PLANS.map((plan) => {
          const isCurrent = activeSubscription && currentPlan?.key === plan.key;
          return <article className={`priceCard ${plan.key === "pro" ? "featured" : ""}`} key={plan.key}>
            {plan.key === "pro" && <span className="popular">POPULAR</span>}
            <h3>{plan.name}</h3>
            <div className="price"><strong>{plan.priceLabel}</strong><span>/mês</span></div>
            <p>{plan.description}</p>
            <ul><li>Assinatura mensal</li><li>Acesso ao ClipIA</li><li>Pagamento seguro pela Stripe</li></ul>
            <button className="btn planButton" type="button" disabled={busy || isCurrent || !billingEnabled} onClick={() => choosePlan(plan.key)}>
              {isCurrent ? "Plano atual" : billingEnabled ? `Assinar ${plan.name}` : "Aguardando Stripe"}
            </button>
          </article>;
        })}
      </div>
    </section>

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
        <div className={`subscriptionBox ${activeSubscription ? "active" : "waiting"}`}>
          <span className="small">ASSINATURA</span>
          <strong>{activeSubscription ? `${currentPlan?.name ?? "Plano"} ativo` : billingEnabled ? "Sem assinatura ativa" : "Pagamentos em análise"}</strong>
          <span>{activeSubscription && subscription?.current_period_end ? `Renovação prevista: ${new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}` : billingEnabled ? "Escolha um plano acima para liberar as automações." : "A Stripe ainda está revisando a conta de pagamentos."}</span>
        </div>
        <h2>Configurar automação</h2>
        <label className="label">Link do canal do YouTube</label><input className="field" type="url" placeholder="https://youtube.com/@seucanal" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} required />
        <div className="row">
          <div><label className="label">Cortes por vídeo</label><select className="field" value={cuts} onChange={(e) => setCuts(Number(e.target.value))}><option value={3}>3 cortes</option><option value={5}>5 cortes</option><option value={10}>10 cortes</option></select></div>
          <div><label className="label">Duração</label><select className="field" value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={15}>15 segundos</option><option value={30}>30 segundos</option><option value={45}>45 segundos</option><option value={60}>60 segundos</option></select></div>
        </div>
        <div className="toggleList"><Toggle label="Legendas automáticas" checked={captions} onChange={setCaptions}/><Toggle label="Automação para novos vídeos" checked={automation} onChange={setAutomation}/></div>
        <div className="socialGrid"><Social name="Instagram" enabled={instagram} setEnabled={setInstagram} auto={instagramAuto} setAuto={setInstagramAuto}/><Social name="TikTok" enabled={tiktok} setEnabled={setTiktok} auto={tiktokAuto} setAuto={setTiktokAuto}/></div>
        <button className="btn" disabled={busy || (billingEnabled && !activeSubscription)}>{busy ? "Verificando..." : billingEnabled && !activeSubscription ? "Assinatura necessária" : "Conectar canal e salvar"}</button>
        <div className="status" aria-live="polite">{status}</div>
        <button className="textButton" type="button" onClick={() => supabase.auth.signOut()}>Sair da conta</button>
      </form>
      <aside className="card"><span className="muted small">HISTÓRICO REAL</span><h2>Etapas do fluxo</h2><div className="steps">{history.length === 0 ? <p className="muted">Nenhuma automação salva ainda.</p> : history.map((item) => <div className={`step ${item.status}`} key={item.id}><span className="stepDot">{item.status === "done" ? "✓" : "•"}</span><div><strong>{item.stage}</strong><p>{item.detail}</p></div></div>)}</div></aside>
    </section>}
    <footer className="footer">© 2026 ClipIA · Automação de cortes para seus canais.</footer>
  </div></main>;
}

function Toggle({label, checked, onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}) { return <label className="toggleRow"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e)=>onChange(e.target.checked)}/></label>; }
function Social({name,enabled,setEnabled,auto,setAuto}:{name:string;enabled:boolean;setEnabled:(v:boolean)=>void;auto:boolean;setAuto:(v:boolean)=>void}) { return <div className="socialCard"><label className="toggleRow"><strong>{name}</strong><input type="checkbox" checked={enabled} onChange={(e)=>{setEnabled(e.target.checked);if(!e.target.checked)setAuto(false)}}/></label><label className="autoOption"><input type="checkbox" checked={auto} disabled={!enabled} onChange={(e)=>setAuto(e.target.checked)}/> Publicação automática</label></div>; }
