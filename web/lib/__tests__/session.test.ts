import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadSession, saveSession, clearSession } from "@/lib/session";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe("session", () => {
  it("salva e recarrega a sessão", () => {
    saveSession({
      pair: par,
      turns: [{ role: "original", lang: "pt", text: "oi" }],
      glossary: [],
    });
    const s = loadSession();
    expect(s?.pair.langA.code).toBe("pt");
    expect(s?.turns).toHaveLength(1);
  });

  it("sem dados salvos retorna null", () => {
    expect(loadSession()).toBeNull();
  });

  it("versão incompatível é ignorada", () => {
    localStorage.setItem(
      "traduzai.session",
      JSON.stringify({ v: 0, pair: par, turns: [], glossary: [] })
    );
    expect(loadSession()).toBeNull();
  });

  it("apaga a sessão salva", () => {
    saveSession({
      pair: par,
      turns: [{ role: "original", lang: "pt", text: "oi" }],
      glossary: [],
    });
    expect(loadSession()).not.toBeNull();
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
