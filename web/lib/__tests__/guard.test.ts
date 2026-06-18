import { describe, it, expect } from "vitest";
import { createBusyGate } from "@/lib/guard";

describe("createBusyGate", () => {
  it("primeira entrada passa, segunda é bloqueada até release", () => {
    const gate = createBusyGate();
    expect(gate.tryEnter()).toBe(true);
    expect(gate.tryEnter()).toBe(false);
    gate.release();
    expect(gate.tryEnter()).toBe(true);
  });
});
