import { NextResponse } from "next/server";
import { runRecap } from "@/lib/recapPipeline";
import type { LanguagePair, Turn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { pair?: LanguagePair; turns?: Turn[] };
    if (!body.pair || !Array.isArray(body.turns)) {
      return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
    }
    const summary = await runRecap({ pair: body.pair, turns: body.turns });
    return NextResponse.json({ summary });
  } catch (e) {
    console.error("[recap] erro:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha no resumo." },
      { status: 500 },
    );
  }
}
