import { describe, it, expect } from "vitest";
import { resolveTarget } from "@/lib/routing";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("resolveTarget", () => {
  it("origem A → alvo B", () => {
    expect(resolveTarget("pt", par)).toEqual(par.langB);
  });
  it("origem B → alvo A", () => {
    expect(resolveTarget("en", par)).toEqual(par.langA);
  });
  it("idioma fora do par → alvo B (padrão)", () => {
    expect(resolveTarget("fr", par)).toEqual(par.langB);
  });
});
