import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Faça login." }, { status: 401 });

    const jobId = request.nextUrl.searchParams.get("jobId");
    if (!jobId) return NextResponse.json({ error: "Processamento inválido." }, { status: 400 });

    const supabase = getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

    const { data, error } = await supabase
      .from("processing_jobs")
      .select("id,status,progress,source_video_title,result,error,created_at,updated_at,completed_at")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (error || !data) return NextResponse.json({ error: "Processamento não encontrado." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar processamento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
