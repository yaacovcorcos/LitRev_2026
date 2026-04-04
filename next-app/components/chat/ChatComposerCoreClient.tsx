"use client";

import { ChatComposerCore, type ChatComposerCoreProps } from "./ChatComposerCore";

export function ChatComposerCoreClient(props: ChatComposerCoreProps) {
    return <ChatComposerCore {...props} />;
}
