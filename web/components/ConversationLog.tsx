import type { Turn } from "@/lib/types";

/** Lista os turnos da conversa em balões. */
export function ConversationLog({ turns }: { turns: Turn[] }) {
  return (
    <div className="flex flex-col gap-2 w-full max-w-md">
      {turns.map((t, i) => (
        <div
          key={i}
          className={`rounded-2xl px-4 py-2 max-w-[85%] ${
            t.role === "original"
              ? "self-start bg-gray-200 text-gray-800"
              : "self-end bg-blue-600 text-white"
          }`}
        >
          <span className="block text-[10px] uppercase opacity-60">{t.lang}</span>
          {t.text}
        </div>
      ))}
    </div>
  );
}
