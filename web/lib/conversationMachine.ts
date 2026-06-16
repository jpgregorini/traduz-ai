import type { LanguagePair, Turn } from "@/lib/types";

export type Phase = "IDLE" | "SETUP" | "ACTIVE" | "ERROR";

export type ConversationState = {
  phase: Phase;
  pair?: LanguagePair;
  turns: Turn[];
  status: string; // rótulo do indicador (ex.: "ouvindo")
  muted: boolean;
  error?: string;
};

export type Action =
  | { type: "BEGIN" }
  | { type: "LANGUAGES_SET"; pair: LanguagePair }
  | { type: "ADD_TURNS"; turns: Turn[] }
  | { type: "SET_STATUS"; status: string }
  | { type: "ERROR"; error: string }
  | { type: "TOGGLE_MUTE" }
  | { type: "RESET" };

export const initialState: ConversationState = {
  phase: "IDLE",
  turns: [],
  status: "",
  muted: false,
};

/** Reducer puro da sessão de conversa. */
export function reducer(state: ConversationState, action: Action): ConversationState {
  switch (action.type) {
    case "BEGIN":
      return { ...state, phase: "SETUP", status: "diga os dois idiomas" };
    case "LANGUAGES_SET":
      return { ...state, phase: "ACTIVE", pair: action.pair, status: "ouvindo", error: undefined };
    case "ADD_TURNS":
      return { ...state, turns: [...state.turns, ...action.turns] };
    case "SET_STATUS":
      return { ...state, status: action.status };
    case "ERROR":
      return { ...state, phase: "ERROR", error: action.error };
    case "TOGGLE_MUTE":
      return { ...state, muted: !state.muted };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}
