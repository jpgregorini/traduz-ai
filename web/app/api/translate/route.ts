import { NextResponse } from "next/server";
import { runTranslate } from "@/lib/translatePipeline";
import type { LanguagePair, Turn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    const pairRaw = form.get("pair");
    const historyRaw = form.get("history");

    if (!(audio instanceof File) || typeof pairRaw !== "string") {
      return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
    }

    const pair = JSON.parse(pairRaw) as LanguagePair;
    const history = (typeof historyRaw === "string" ? JSON.parse(historyRaw) : []) as Turn[];
    const glossaryRaw = form.get("glossary");
    const glossaryText = typeof glossaryRaw === "string" ? glossaryRaw : "";

    const result = await runTranslate({ audio, pair, history, glossaryText });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[translate] erro:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha na tradução." },
      { status: 500 },
    );
  }
}
