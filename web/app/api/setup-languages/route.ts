import { NextResponse } from "next/server";
import { runSetup } from "@/lib/setupPipeline";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Áudio ausente." }, { status: 400 });
    }
    const pair = await runSetup(audio);
    return NextResponse.json(pair);
  } catch (e) {
    console.error("[setup-languages] erro:", e);
    // 422: cliente deve pedir para repetir os idiomas.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha no setup." },
      { status: 422 },
    );
  }
}
