import { describe, expect, it } from "vitest";
import { referencePlaybackUrlKeyToYujaDocId } from "./yuja-funny-urls-id";

describe("referencePlaybackUrlKeyToYujaDocId", () => {
  it("is stable for a fixed normalized URL key", () => {
    const key = "https://example.com/video?node=1&v=2";
    expect(referencePlaybackUrlKeyToYujaDocId(key)).toBe(
      "c5dc99055bec227b592ba134cfa0d3b0a5b28f93e77ce507c126ca258ebd97f2"
    );
  });
});
