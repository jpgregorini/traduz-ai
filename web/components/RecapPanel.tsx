"use client";

type Props = { text: string; loading: boolean; onClose: () => void };

/** Painel com o resumo da conversa, com copiar e compartilhar. */
export function RecapPanel({ text, loading, onClose }: Props) {
  const copiar = () => void navigator.clipboard?.writeText(text);
  const compartilhar = () => {
    if (navigator.share) void navigator.share({ text });
    else copiar();
  };
  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Resumo</h2>
          <button onClick={onClose} className="text-sm text-gray-500 underline">fechar</button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm text-gray-700">
          {loading ? "gerando resumo…" : text}
        </div>
        {!loading && text && (
          <div className="mt-3 flex gap-4">
            <button onClick={copiar} className="text-sm text-blue-600 underline">copiar</button>
            <button onClick={compartilhar} className="text-sm text-blue-600 underline">compartilhar</button>
          </div>
        )}
      </div>
    </div>
  );
}
