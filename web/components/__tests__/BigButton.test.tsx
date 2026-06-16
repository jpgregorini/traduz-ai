import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BigButton } from "@/components/BigButton";

describe("BigButton", () => {
  it("mode=idle mostra 'iniciar' e dispara onClick", async () => {
    const onClick = vi.fn();
    render(<BigButton mode="idle" onClick={onClick} />);
    const btn = screen.getByRole("button", { name: /iniciar/i });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("mode=listening mostra 'pausar' e dispara onClick", async () => {
    const onClick = vi.fn();
    render(<BigButton mode="listening" onClick={onClick} />);
    const btn = screen.getByRole("button", { name: /pausar/i });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("mode=paused mostra 'retomar' e dispara onClick", async () => {
    const onClick = vi.fn();
    render(<BigButton mode="paused" onClick={onClick} />);
    const btn = screen.getByRole("button", { name: /retomar/i });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
