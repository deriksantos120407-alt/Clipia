import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Faça login para iniciar o processamento." }, { status: 401 });

    const body = await request.json();
    const jobId = typeof body?.jobId === "string" ? body.jobId : "";
    if (!jobId) return NextResponse.json({ error: "Trabalho de processamento inválido." }, { status: 400 });

    const supabase = getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Sessão inválida. Entre novamente." }, { status: 401 });

    if (process.env.NEXT_PUBLIC_BILLING_ENABLED === "true") {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
        return NextResponse.json({ error: "Assinatura ativa necessária para gerar cortes." }, { status: 402 });
      }
    }

    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .select("id,user_id,source_video_id,source_video_url,source_video_title,requested_cuts,clip_duration,captions_enabled,status")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) return NextResponse.json({ error: "Processamento não encontrado." }, { status: 404 });
    if (job.status === "ready") return NextResponse.json({ ok: true, status: "ready" });

    const workerUrl = process.env.CLIP_WORKER_URL;
    const workerToken = process.env.CLIP_WORKER_TOKEN;
    if (!workerUrl || !workerToken) {
      return NextResponse.json({
        queued: true,
        error: "Motor de renderização ainda não conectado. O trabalho ficou na fila.",
      }, { status: 503 });
    }

    const callbackUrl = new URL("/api/processing/callback", request.nextUrl.origin).toString();
    const workerResponse = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerToken}`,
      },
      body: JSON.stringify({
        job_id: job.id,
        source: {
          video_id: job.source_video_id,
          url: job.source_video_url,
          title: job.source_video_title,
        },
        output: {
          cuts: job.requested_cuts,
          duration_seconds: job.clip_duration,
          captions: job.captions_enabled,
          aspect_ratio: "9:16",
        },
        callback_url: callbackUrl,
      }),
      cache: "no-store",
    });

    const workerData = await workerResponse.json().catch(() => ({})) as { job_id?: string; id?: string; error?: string };
    if (!workerResponse.ok) {
      const detail = workerData.error ?? "O motor de vídeo não aceitou o trabalho.";
      await supabase.from("processing_jobs").update({ error: detail }).eq("id", job.id).eq("user_id", user.id);
      return NextResponse.json({ error: detail }, { status: 502 });
    }

    const workerJobId = workerData.job_id ?? workerData.id ?? null;
    const { error: updateError } = await supabase
      .from("processing_jobs")
      .update({
        status: "authorizing",
        progress: 5,
        worker_job_id: workerJobId,
        claimed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", job.id)
      .eq("user_id", user.id);

    if (updateError) throw updateError;
    return NextResponse.json({ ok: true, status: "authorizing", workerJobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao iniciar processamento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
