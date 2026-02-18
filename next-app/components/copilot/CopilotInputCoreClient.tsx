"use client";

import dynamic from "next/dynamic";
import type { CopilotInputCoreProps } from "./CopilotInputCore";

const CopilotInputCoreNoSSR = dynamic(
    () => import("./CopilotInputCore").then((m) => m.CopilotInputCore),
    { ssr: false },
);

export function CopilotInputCoreClient(props: CopilotInputCoreProps) {
    return <CopilotInputCoreNoSSR {...props} />;
}
