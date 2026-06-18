import { describe, it, expect } from "vitest";
import { buildRecapMessages } from "@/lib/recap";
import type { LanguagePair, Turn } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("buildRecapMessages", () => {
  it("inclui os dois idiomas e os turnos da conversa", () => {
    const turns: Turn[] = [
      { role: "original", lang: "pt", text: "Bom dia" },
      { role: "translation", lang: "en", text: "Good morning" },
    ];
    const msgs = buildRecapMessages({ pair: par, turns });
    const blob = JSON.stringify(msgs);
    expect(blob).toContain("Português");
    expect(blob).toContain("English");
    expect(blob).toContain("Bom dia");
    expect(blob).toContain("Good morning");
  });
});
