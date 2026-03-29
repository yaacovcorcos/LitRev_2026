// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudyFilesPanel } from "@/components/StudyFilesPanel";

describe("StudyFilesPanel", () => {
  it("shows the upload banner when the parent upload handler rejects", async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error("Upload failed loudly"));
    const { container } = render(
      <StudyFilesPanel
        projectId="project-1"
        studyId="study-1"
        studyTitle="Study title"
        files={[]}
        onUpload={onUpload}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();

    fireEvent.change(input!, {
      target: {
        files: [new File(["pdf"], "study.pdf", { type: "application/pdf" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Upload failed loudly")).toBeTruthy();
    });
    expect(onUpload).toHaveBeenCalledTimes(1);
  });
});
