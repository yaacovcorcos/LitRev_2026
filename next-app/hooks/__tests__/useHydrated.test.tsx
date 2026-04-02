// @vitest-environment jsdom

"use client";

import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useHydrated } from "@/hooks/useHydrated";

function HydrationValue() {
    const hydrated = useHydrated();
    return <span>{hydrated ? "hydrated" : "pending"}</span>;
}

describe("useHydrated", () => {
    it("uses the server snapshot during SSR and the client snapshot in the browser", () => {
        expect(renderToString(<HydrationValue />)).toContain("pending");

        render(<HydrationValue />);

        expect(screen.getByText("hydrated")).toBeTruthy();
    });
});
