import {
  createMediaContainer,
  getPublishedMediaPermalink,
  publishMediaContainer,
  waitForContainerReady,
} from "./graph-api";

interface PublishInput {
  igUserId: string;
  accessToken: string;
  mediaUrl: string;
  caption: string;
  mediaType: "IMAGE" | "VIDEO" | "REELS";
}

interface PublishResult {
  igMediaId: string;
  igPermalink?: string;
}

export async function publishToInstagram(input: PublishInput): Promise<PublishResult> {
  const containerId = await createMediaContainer(input);
  await waitForContainerReady(containerId, input.accessToken);
  const igMediaId = await publishMediaContainer(input.igUserId, containerId, input.accessToken);
  const igPermalink = await getPublishedMediaPermalink(igMediaId, input.accessToken);
  return { igMediaId, igPermalink };
}
