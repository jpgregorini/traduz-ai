"use client";

import { useState } from "react";
import { useConversation } from "@/hooks/useConversation";
import { StatusIndicator } from "@/components/StatusIndicator";
import { BigButton } from "@/components/BigButton";
import { ConversationLog } from "@/components/ConversationLog";
import { RecapPanel } from "@/components/RecapPanel";

export default function Home() {
  const { state, listening, begin, pause, resume, reset, toggleMute } = useConversation();

  // Estado do painel de recap da conversa
  const [recap, setRecap] = useState<{ open: boolean; loading: boolean; text: string }>({
    open: false, loading: false, text: "",
  });

  const gerarRecap = async () => {
    setRecap({ open: true, loading: true, text: "" });
    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Limita o histórico enviado para não estourar contexto/custo em conversas longas.
        body: JSON.stringify({ pair: state.pair, turns: state.turns.slice(-40) }),
      });
      if (!res.ok) throw new Error("Falha ao gerar o resumo.");
      const data = await res.json();
      setRecap({ open: true, loading: false, text: data.summary ?? data.error ?? "" });
    } catch {
      setRecap({ open: true, loading: false, text: "Falha ao gerar o resumo." });
    }
  };

  const pairLabel = state.pair
    ? `${state.pair.langA.code.toUpperCase()} ⇄ ${state.pair.langB.code.toUpperCase()}`
    : undefined;

  const mode: "idle" | "listening" | "paused" =
    state.phase === "ACTIVE" ? (listening ? "listening" : "paused") : "idle";

  const handleClick =
    mode === "idle" ? begin : mode === "listening" ? pause : resume;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between gap-6 p-6">
      <header className="pt-8">
        <h1 className="text-2xl font-bold text-center">TraduzAI</h1>
        <StatusIndicator status={state.status} pairLabel={pairLabel} />
      </header>

      <ConversationLog turns={state.turns} />

      <div className="flex flex-col items-center gap-4 pb-10">
        <BigButton mode={mode} onClick={handleClick} />
        {state.phase === "ACTIVE" && (
          <div className="flex gap-4">
            <button onClick={toggleMute} className="text-sm text-gray-500 underline">
              {state.muted ? "ativar voz" : "silenciar voz"}
            </button>
            <button onClick={reset} className="text-sm text-gray-500 underline">
              resetar idiomas
            </button>
            <button
              onClick={gerarRecap}
              disabled={recap.loading}
              className="text-sm text-gray-500 underline disabled:opacity-50"
            >
              resumo
            </button>
          </div>
        )}
      </div>
      {recap.open && (
        <RecapPanel
          text={recap.text}
          loading={recap.loading}
          onClose={() => setRecap((r) => ({ ...r, open: false }))}
        />
      )}
    </main>
  );
}
