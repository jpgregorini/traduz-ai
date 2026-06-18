import { describe, it, expect } from "vitest";
import { initialState, reducer } from "@/lib/conversationMachine";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("conversationMachine", () => {
  it("IDLE + BEGIN → SETUP", () => {
    const s = reducer(initialState, { type: "BEGIN" });
    expect(s.phase).toBe("SETUP");
  });
  it("SETUP + LANGUAGES_SET → ACTIVE com par", () => {
    let s = reducer(initialState, { type: "BEGIN" });
    s = reducer(s, { type: "LANGUAGES_SET", pair: par });
    expect(s.phase).toBe("ACTIVE");
    expect(s.pair).toEqual(par);
  });
  it("ADD_TURNS acumula turnos", () => {
    let s = reducer(initialState, { type: "BEGIN" });
    s = reducer(s, { type: "LANGUAGES_SET", pair: par });
    s = reducer(s, {
      type: "ADD_TURNS",
      turns: [
        { role: "original", lang: "pt", text: "Oi" },
        { role: "translation", lang: "en", text: "Hi" },
      ],
    });
    expect(s.turns).toHaveLength(2);
  });
  it("TOGGLE_MUTE inverte muted", () => {
    const s = reducer(initialState, { type: "TOGGLE_MUTE" });
    expect(s.muted).toBe(true);
  });
  it("RESET volta ao estado inicial", () => {
    let s = reducer(initialState, { type: "BEGIN" });
    s = reducer(s, { type: "RESET" });
    expect(s).toEqual(initialState);
  });
});

describe("glossário e hidratação", () => {
  it("SET_GLOSSARY substitui o glossário", () => {
    const s = reducer(initialState, {
      type: "SET_GLOSSARY",
      glossary: [{ term: "João", translations: { pt: "João", en: "John" } }],
    });
    expect(s.glossary).toHaveLength(1);
    expect(s.glossary[0].term).toBe("João");
  });

  it("HYDRATE restaura par, turnos e glossário em ACTIVE", () => {
    const s = reducer(initialState, {
      type: "HYDRATE",
      pair: { langA: { code: "pt", name: "Português" }, langB: { code: "en", name: "English" } },
      turns: [{ role: "original", lang: "pt", text: "oi" }],
      glossary: [],
    });
    expect(s.phase).toBe("ACTIVE");
    expect(s.turns).toHaveLength(1);
    expect(s.status).toBe("ouvindo");
  });
});
