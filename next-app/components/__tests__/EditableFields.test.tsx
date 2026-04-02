// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditableText } from "../EditableText";
import { EditableTextArea } from "../EditableTextArea";

describe("EditableText", () => {
  it("seeds the edit buffer from the latest prop value when editing starts", () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <EditableText value="Original title" onChange={handleChange} ariaLabel="Editable title" />,
    );

    rerender(<EditableText value="Updated title" onChange={handleChange} ariaLabel="Editable title" />);

    fireEvent.click(screen.getByRole("textbox", { name: "Editable title" }));

    expect(screen.getByRole("textbox", { name: "Editable title" })).toHaveProperty("value", "Updated title");
  });

  it("trims and commits the edited value on blur", () => {
    const handleChange = vi.fn();

    render(<EditableText value="Original title" onChange={handleChange} ariaLabel="Editable title" />);

    fireEvent.click(screen.getByRole("textbox", { name: "Editable title" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Editable title" }), {
      target: { value: "  Revised title  " },
    });
    fireEvent.blur(screen.getByRole("textbox", { name: "Editable title" }));

    expect(handleChange).toHaveBeenCalledWith("Revised title");
  });
});

describe("EditableTextArea", () => {
  it("seeds the edit buffer from the latest prop value when editing starts", () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <EditableTextArea value="Original query" onChange={handleChange} ariaLabel="Editable query" />,
    );

    rerender(<EditableTextArea value="Updated query" onChange={handleChange} ariaLabel="Editable query" />);

    fireEvent.click(screen.getByRole("textbox", { name: "Editable query" }));

    expect(screen.getByRole("textbox", { name: "Editable query" })).toHaveProperty("value", "Updated query");
  });

  it("commits the edited value on blur without trimming", () => {
    const handleChange = vi.fn();

    render(<EditableTextArea value="Original query" onChange={handleChange} ariaLabel="Editable query" />);

    fireEvent.click(screen.getByRole("textbox", { name: "Editable query" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Editable query" }), {
      target: { value: "  revised query  " },
    });
    fireEvent.blur(screen.getByRole("textbox", { name: "Editable query" }));

    expect(handleChange).toHaveBeenCalledWith("  revised query  ");
  });
});
