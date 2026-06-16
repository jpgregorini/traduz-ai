"use client";

import { useConversation } from "@/hooks/useConversation";
import { StatusIndicator } from "@/components/StatusIndicator";
import { BigButton } from "@/components/BigButton";
import { ConversationLog } from "@/components/ConversationLog";

export default function Home() {
  const { state, listening, begin, toggleMute } = useConversation();
  const pairLabel = state.pair
    ? `${state.pair.langA.code.toUpperCase()} ⇄ ${state.pair.langB.code.toUpperCase()}`
    : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between gap-6 p-6">
      <header className="pt-8">
        <h1 className="text-2xl font-bold text-center">TraduzAI</h1>
        <StatusIndicator status={state.status} pairLabel={pairLabel} />
      </header>

      <ConversationLog turns={state.turns} />

      <div className="flex flex-col items-center gap-4 pb-10">
        <BigButton active={listening} onStart={begin} />
        {state.phase === "ACTIVE" && (
          <button onClick={toggleMute} className="text-sm text-gray-500 underline">
            {state.muted ? "ativar voz" : "silenciar voz"}
          </button>
        )}
      </div>
    </main>
  );
}
