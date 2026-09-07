import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_STATUSES = new Set([
  "authorizing",
  "transcribing",
  "analyzing",
  "rendering",
  "ready",
  "failed",
]);

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase admin não configurado.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const expectedToken = process.env.CLIP_WORKER_TOKEN;
    if (!expectedToken) return NextResponse.json({ error: "Callback não configurado." }, { status: 503 });

    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token || token !== expectedToken) {
      return NextResponse.json({ error: "Callback não autorizado." }, { status: 401 });
    }

    const body = await request.json();
    const jobId = typeof body?.job_id === "string" ? body.job_id : "";
    const status = typeof body?.status === "string" ? body.status : "";
    if (!jobId || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: "Atualização de processamento inválida." }, { status: 400 });
    }

    const requestedProgress = Number(body?.progress);
    const progress = status === "ready"
      ? 100
      : Number.isFinite(requestedProgress)
        ? Math.max(0, Math.min(99, Math.round(requestedProgress)))
        : undefined;

    const update: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (progress !== undefined) update.progress = progress;
    if (typeof body?.worker_job_id === "string") update.worker_job_id = body.worker_job_id;
    if (body?.result !== undefined) update.result = body.result;
    if (typeof body?.error === "string") update.error = body.error;
    if (status !== "failed" && body?.error == null) update.error = null;
    if (status === "ready" || status === "failed") update.completed_at = new Date().toISOString();

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("processing_jobs")
      .update(update)
      .eq("id", jobId)
      .select("id,automation_id,user_id,status,progress,result,error")
      .single();

    if (error || !data) return NextResponse.json({ error: "Trabalho não encontrado." }, { status: 404 });

    if (status === "ready" || status === "failed") {
      const detail = status === "ready"
        ? "Cortes finalizados e prontos para uso."
        : (typeof body?.error === "string" ? body.error : "Falha ao gerar os cortes.");
      await supabase.from("automation_history").insert({
        automation_id: data.automation_id,
        user_id: data.user_id,
        stage: status === "ready" ? "Cortes finalizados" : "Falha no processamento",
        status: status === "ready" ? "done" : "error",
        detail,
      });
    }

    return NextResponse.json({ received: true, status: data.status, progress: data.progress });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no callback de processamento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
