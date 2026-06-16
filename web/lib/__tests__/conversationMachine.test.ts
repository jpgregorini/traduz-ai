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
