import { describe, it, expect } from "vitest";
import { encodeWAV } from "@/lib/audio";

describe("encodeWAV", () => {
  it("gera header RIFF/WAVE e tamanho correto", async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const blob = encodeWAV(samples, 16000);
    expect(blob.type).toBe("audio/wav");
    const buf = await blob.arrayBuffer();
    // 44 bytes de header + 2 bytes por amostra
    expect(buf.byteLength).toBe(44 + samples.length * 2);
    const head = new TextDecoder().decode(buf.slice(0, 4));
    expect(head).toBe("RIFF");
    const fmt = new TextDecoder().decode(buf.slice(8, 12));
    expect(fmt).toBe("WAVE");
  });
});
