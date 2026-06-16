type Props = {
  active: boolean;
  onStart: () => void;
};

/** Botão central grande: inicia a sessão. */
export function BigButton({ active, onStart }: Props) {
  return (
    <button
      onClick={onStart}
      disabled={active}
      className={`h-40 w-40 rounded-full text-white text-xl font-semibold shadow-lg transition
        ${active ? "bg-green-500 animate-pulse" : "bg-blue-600 active:scale-95"}`}
    >
      {active ? "ouvindo" : "iniciar"}
    </button>
  );
}
