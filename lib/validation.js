import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const optionalTrimmed = z.string().trim().optional().or(z.literal(""));

export const releasePayloadSchema = z
  .object({
    releaseType: z.enum(["album", "single"]),
    title: nonEmpty,
    labelName: optionalTrimmed,
    mainArtists: optionalTrimmed,
    featuredArtists: optionalTrimmed,
    releaseVersion: optionalTrimmed,
    tracklist: optionalTrimmed,
    explicit: z.enum(["Non-Explicit", "Explicit"]),
    dealTags: z.array(z.string()).optional().default([]),
    distributor: optionalTrimmed,
    mainGenre: nonEmpty,
    subGenre: optionalTrimmed,
    secondaryGenre: optionalTrimmed,
    secondarySubGenre: optionalTrimmed,
    releaseDate: nonEmpty,
    preorderDate: optionalTrimmed,
    recordingDate: optionalTrimmed,
    socialReleaseDate: optionalTrimmed,
    audioFileLink: optionalTrimmed,
    lyricsUrl: optionalTrimmed,
    coverArtUrl: optionalTrimmed,
    dolbyAtmosLink: optionalTrimmed,
    appleMotionArtLink: optionalTrimmed,
    waterfallRelease: z.string().trim(),
    waterfallTracklist: optionalTrimmed,
    writersSplits: optionalTrimmed,
    publisherInformation: optionalTrimmed,
    producerCredits: optionalTrimmed,
    notes: optionalTrimmed
  })
  .superRefine((data, ctx) => {
    if (data.releaseType === "album" && !data.tracklist.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tracklist"],
        message: "Tracklist is required for Album / EP submissions."
      });
    }

    if (data.releaseType === "single" && data.waterfallRelease === "Yes" && !data.waterfallTracklist.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["waterfallTracklist"],
        message: "Please provide the waterfall track order."
      });
    }

    if (data.releaseType === "single" && !["Yes", "No"].includes(data.waterfallRelease)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["waterfallRelease"],
        message: "Please select whether this is a waterfall release."
      });
    }
  });

export function splitTrackLines(value) {
  return value
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}
