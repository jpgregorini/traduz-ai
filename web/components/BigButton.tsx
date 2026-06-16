type Props =
  | { mode: "idle"; onClick: () => void }
  | { mode: "listening"; onClick: () => void }
  | { mode: "paused"; onClick: () => void };

const LABELS: Record<Props["mode"], string> = {
  idle: "iniciar",
  listening: "pausar",
  paused: "retomar",
};

/** Botão central grande: alterna entre iniciar, pausar e retomar a sessão. */
export function BigButton({ mode, onClick }: Props) {
  const isListening = mode === "listening";
  return (
    <button
      onClick={onClick}
      className={`h-40 w-40 rounded-full text-white text-xl font-semibold shadow-lg transition
        ${isListening ? "bg-green-500 animate-pulse" : "bg-blue-600 active:scale-95"}`}
    >
      {LABELS[mode]}
    </button>
  );
}
