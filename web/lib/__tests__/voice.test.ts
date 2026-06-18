import { describe, it, expect } from "vitest";
import { voiceFor } from "@/lib/voice";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("voiceFor", () => {
  it("idioma A e idioma B usam vozes distintas", () => {
    expect(voiceFor("pt", par)).not.toBe(voiceFor("en", par));
  });
  it("idioma fora do par cai na voz do B (padrão)", () => {
    expect(voiceFor("fr", par)).toBe(voiceFor("en", par));
  });
  it("é determinístico", () => {
    expect(voiceFor("pt", par)).toBe(voiceFor("pt", par));
  });
});
