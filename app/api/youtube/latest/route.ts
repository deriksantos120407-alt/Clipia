import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

async function youtube(path: string, params: Record<string, string>) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY não configurada.");
  const url = new URL(`${YOUTUBE_API}/${path}`);
  Object.entries({ ...params, key }).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, { next: { revalidate: 300 } });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? "Falha ao consultar o YouTube.");
  return data;
}

function readChannelReference(value: string) {
  const url = new URL(value);
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "youtube.com" && host !== "m.youtube.com") throw new Error("Use o link de um canal do YouTube.");
  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.length) throw new Error("Link do canal incompleto.");
  if (parts[0] === "channel" && parts[1]) return { kind: "id", value: parts[1] };
  if (parts[0].startsWith("@")) return { kind: "handle", value: parts[0].slice(1) };
  if (parts[0] === "user" && parts[1]) return { kind: "username", value: parts[1] };
  return { kind: "search", value: parts.at(-1)! };
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    if (!token) return NextResponse.json({ error: "Faça login para conectar um canal." }, { status: 401 });
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Sessão inválida. Entre novamente." }, { status: 401 });

    const body = await request.json();
    const channelUrl = typeof body?.channelUrl === "string" ? body.channelUrl.trim() : "";
    if (!channelUrl) return NextResponse.json({ error: "Informe o link do canal." }, { status: 400 });

    const reference = readChannelReference(channelUrl);
    let channelData;
    if (reference.kind === "id") {
      channelData = await youtube("channels", { part: "snippet,contentDetails", id: reference.value });
    } else if (reference.kind === "handle") {
      channelData = await youtube("channels", { part: "snippet,contentDetails", forHandle: reference.value });
    } else if (reference.kind === "username") {
      channelData = await youtube("channels", { part: "snippet,contentDetails", forUsername: reference.value });
    } else {
      const search = await youtube("search", { part: "snippet", type: "channel", maxResults: "1", q: reference.value });
      const channelId = search.items?.[0]?.snippet?.channelId;
      if (!channelId) throw new Error("Canal não encontrado.");
      channelData = await youtube("channels", { part: "snippet,contentDetails", id: channelId });
    }

    const channel = channelData.items?.[0];
    if (!channel) throw new Error("Canal não encontrado.");
    const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw new Error("Não foi possível acessar os vídeos do canal.");

    const videos = await youtube("playlistItems", { part: "snippet,contentDetails", playlistId: uploads, maxResults: "1" });
    const latest = videos.items?.[0];
    return NextResponse.json({
      channel: { id: channel.id, title: channel.snippet?.title },
      latestVideo: latest ? {
        id: latest.contentDetails?.videoId,
        title: latest.snippet?.title,
        publishedAt: latest.contentDetails?.videoPublishedAt ?? latest.snippet?.publishedAt,
        url: `https://www.youtube.com/watch?v=${latest.contentDetails?.videoId}`,
        thumbnail: latest.snippet?.thumbnails?.medium?.url,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar o YouTube.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
