import type { ConversationContextAttachment, ConversationMessageAttachment } from "@/types/ai";
import type { ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { TimelineItem } from "@/types/timeline";

type DbConversationMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  attachments?: ConversationMessageAttachment[];
};

type DbConversationArtifact = {
  id: string;
  type: string;
  status: string;
  title: string;
  payload: unknown;
  version: number;
  createdAt: string;
};

const isContextAttachment = (
  attachment: ConversationMessageAttachment,
): attachment is ConversationContextAttachment => "type" in attachment && attachment.type === "context_capture";

function getTimelineItemCreatedAt(item: TimelineItem): string {
  if (
    item.type === "user_message"
    || item.type === "assistant_message"
    || item.type === "artifact"
    || item.type === "tool_activity"
    || item.type === "checkpoint"
    || item.type === "error"
  ) {
    return item.createdAt;
  }
  return "";
}

export function stripReservedAssistantTimelineItems(items: TimelineItem[], assistantMessageId: string): TimelineItem[] {
  return items.filter((item) => !(
    item.type === "assistant_message"
    && item.id === assistantMessageId
    && item.deliveryState === "reserved"
    && !item.content
    && !item.reasoning?.text
  ));
}

export function mapDbMessagesToTimeline(
  messages: DbConversationMessage[],
  artifacts: DbConversationArtifact[] = [],
): TimelineItem[] {
  const messageItems: TimelineItem[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      messageItems.push({
        type: "user_message",
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
        attachments: message.attachments?.map((attachment) => (
          isContextAttachment(attachment)
            ? attachment
            : {
                fileAssetId: attachment.fileAssetId,
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                size: attachment.size,
              }
        )),
      });
      continue;
    }

    if (message.role === "assistant") {
      messageItems.push({
        type: "assistant_message",
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
      });
    }
  }

  const artifactItems: TimelineItem[] = artifacts.map((artifact) => ({
    type: "artifact",
    id: `artifact-${artifact.id}`,
    artifactId: artifact.id,
    artifactType: artifact.type as ArtifactType,
    status: artifact.status as ArtifactStatus,
    title: artifact.title,
    payload: artifact.payload ?? {},
    version: artifact.version,
    createdAt: artifact.createdAt,
  }));

  return [...messageItems, ...artifactItems].sort(
    (left, right) =>
      new Date(getTimelineItemCreatedAt(left)).getTime() - new Date(getTimelineItemCreatedAt(right)).getTime(),
  );
}
