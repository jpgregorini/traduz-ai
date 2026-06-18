import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openai", () => ({ chatText: vi.fn() }));

import { chatText } from "@/lib/openai";
import { runRecap } from "@/lib/recapPipeline";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

beforeEach(() => vi.mocked(chatText).mockReset());

describe("runRecap", () => {
  it("devolve o texto do resumo", async () => {
    vi.mocked(chatText).mockResolvedValue("Resumo...");
    const out = await runRecap({ pair: par, turns: [] });
    expect(out).toBe("Resumo...");
    expect(chatText).toHaveBeenCalled();
  });
});
