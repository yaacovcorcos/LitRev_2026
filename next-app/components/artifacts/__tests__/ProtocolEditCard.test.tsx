// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProtocolEditCard } from "../ProtocolEditCard";

describe("ProtocolEditCard", () => {
  it("accepts the current edited string value on the first click while the input still has focus", () => {
    const onAccept = vi.fn();

    render(
      <ProtocolEditCard
        payload={{
          field: "researchQuestion",
          value: "Original question",
          rationale: "Tighten the question",
        }}
        onAccept={onAccept}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit research question/i }));

    const input = screen.getByDisplayValue("Original question");
    fireEvent.change(input, { target: { value: "Updated question" } });
    fireEvent.click(screen.getByRole("button", { name: /accept edited & save/i }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith("Updated question");
  });

  it("accepts the original value without an edited payload when unchanged", () => {
    const onAccept = vi.fn();

    render(
      <ProtocolEditCard
        payload={{
          field: "researchQuestion",
          value: "Original question",
          rationale: "Keep it",
        }}
        onAccept={onAccept}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /accept & save to protocol/i }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith();
  });

  it("accepts the current edited array value from textarea mode on the first click", () => {
    const onAccept = vi.fn();

    render(
      <ProtocolEditCard
        payload={{
          field: "eligibility.inclusion",
          value: ["Adults", "Randomized trials"],
          rationale: "Broaden the criteria",
        }}
        onAccept={onAccept}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit inclusion criteria/i }));

    const textarea = screen.getByPlaceholderText("One item per line");
    fireEvent.change(textarea, { target: { value: "Adults\nChildren\n" } });
    fireEvent.click(screen.getByRole("button", { name: /accept edited & save/i }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith(["Adults", "Children"]);
  });
});
