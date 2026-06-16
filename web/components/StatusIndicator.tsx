type Props = { status: string; pairLabel?: string };

/** Mostra o par de idiomas e o estado atual (ouvindo/traduzindo/…). */
export function StatusIndicator({ status, pairLabel }: Props) {
  return (
    <div className="text-center">
      {pairLabel && <div className="text-sm text-gray-400">{pairLabel}</div>}
      <div className="text-lg font-medium text-gray-700">{status || "—"}</div>
    </div>
  );
}
