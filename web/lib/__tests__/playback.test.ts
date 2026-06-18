import { describe, it, expect, vi } from "vitest";
import { playWithVadGuard } from "@/lib/playback";

describe("playWithVadGuard", () => {
  it("pausa o mic, toca e retoma — nessa ordem", async () => {
    const calls: string[] = [];
    await playWithVadGuard({
      audioBase64: "QUJD",
      muted: false,
      play: async () => { calls.push("play"); },
      pauseMic: () => { calls.push("pause"); },
      resumeMic: () => { calls.push("resume"); },
    });
    expect(calls).toEqual(["pause", "play", "resume"]);
  });

  it("retoma o mic mesmo se o playback falhar", async () => {
    const calls: string[] = [];
    await playWithVadGuard({
      audioBase64: "QUJD",
      muted: false,
      play: async () => { calls.push("play"); throw new Error("falha"); },
      pauseMic: () => { calls.push("pause"); },
      resumeMic: () => { calls.push("resume"); },
    });
    expect(calls).toEqual(["pause", "play", "resume"]);
  });

  it("não toca nem mexe no mic quando muted", async () => {
    const play = vi.fn();
    const pauseMic = vi.fn();
    await playWithVadGuard({
      audioBase64: "QUJD", muted: true, play, pauseMic, resumeMic: vi.fn(),
    });
    expect(play).not.toHaveBeenCalled();
    expect(pauseMic).not.toHaveBeenCalled();
  });
});
