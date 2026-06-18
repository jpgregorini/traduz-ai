import { describe, it, expect } from "vitest";
import { VAD_ASSET_PATH, ORT_WASM_PATH } from "@/hooks/useMicVAD";

describe("paths dos assets do VAD", () => {
  it("apontam para versões fixas, não @latest", () => {
    expect(VAD_ASSET_PATH).not.toContain("@latest");
    expect(ORT_WASM_PATH).not.toContain("@latest");
    expect(VAD_ASSET_PATH).toContain("@ricky0123/vad-web@0.0.30");
    expect(ORT_WASM_PATH).toContain("onnxruntime-web@1.26.0");
  });
});
