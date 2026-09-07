import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com"]);

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readChannelReference(value: string) {
  const url = new URL(value);
  const host = url.hostname.replace(/^www\./, "");
  if (!YOUTUBE_HOSTS.has(host)) throw new Error("Use o link de um canal do YouTube.");
  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.length) throw new Error("Link do canal incompleto.");
  if (parts[0] === "channel" && parts[1]) return { channelId: parts[1], normalizedUrl: value };
  return { channelId: null, normalizedUrl: value };
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ClipIA/1.0; +https://clipia-two.vercel.app)",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
    redirect: "follow",
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error("Não foi possível acessar o canal no YouTube.");
  return response.text();
}

async function resolveChannel(channelUrl: string) {
  const reference = readChannelReference(channelUrl);
  if (reference.channelId) return { id: reference.channelId, title: undefined as string | undefined };

  const html = await fetchText(reference.normalizedUrl);
  const channelId =
    html.match(/\"channelId\":\"(UC[a-zA-Z0-9_-]{20,})\"/)?.[1] ??
    html.match(/\"externalId\":\"(UC[a-zA-Z0-9_-]{20,})\"/)?.[1] ??
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})"/)?.[1] ??
    html.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})/)?.[1];

  if (!channelId) throw new Error("Canal não encontrado. Tente usar o link completo do canal.");

  const title =
    html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ??
    html.match(/<title>([^<]+)<\/title>/)?.[1]?.replace(/\s*-\s*YouTube\s*$/i, "");

  return { id: channelId, title: title ? decodeXml(title) : undefined };
}

async function latestVideoFromFeed(channelId: string) {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  if (!entry) return null;

  const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
  if (!id) return null;

  const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  const publishedAt = entry.match(/<published>([^<]+)<\/published>/)?.[1];
  const thumbnail = entry.match(/<media:thumbnail url="([^"]+)"/)?.[1];

  return {
    id,
    title: title ? decodeXml(title) : undefined,
    publishedAt,
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: thumbnail ? decodeXml(thumbnail) : undefined,
  };
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

    const channel = await resolveChannel(channelUrl);
    const latestVideo = await latestVideoFromFeed(channel.id);

    return NextResponse.json({
      channel: { id: channel.id, title: channel.title },
      latestVideo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar o YouTube.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
