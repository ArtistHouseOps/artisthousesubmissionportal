import "server-only";

import { Client } from "@notionhq/client";
import { getEnv } from "@/lib/env";
import { splitTrackLines } from "@/lib/validation";

const RELEASE_FIELD_CANDIDATES = {
  releaseTitle: ["Release Title"],
  releaseType: ["Type of Release:"],
  labelName: ["Label Name"],
  submitterEmail: ["Submitter’s Email:"],
  mainArtists: ["Display Artist"],
  featuredArtists: ["Featured Artist(s)"],
  releaseVersion: ["Release Version"],
  tracklist: ["Tracklist"],
  explicit: ["Explicit?"],
  dealTags: ["Tags"],
  distributor: ["Distribution"],
  mainGenre: ["Main Genre"],
  subGenre: ["Sub Genre"],
  secondaryGenre: ["Secondary Genre"],
  secondarySubGenre: ["Secondary Sub Genre"],
  releaseDate: ["Release Date"],
  preorderDate: ["Pre-Order Date"],
  recordingDate: ["Recording Date:", "Recording Date: (1)"],
  socialReleaseDate: ["Social's Release Date"],
  audioFileLink: ["Audio File(s) Link"],
  lyrics: ["Lyrics"],
  coverArt: ["Cover Art"],
  dolbyAtmosLink: ["Dolby Atmos Mix(s)"],
  appleMotionArtLink: ["Apple Motion Art"],
  waterfallRelease: ["Waterfall Release?"],
  writersSplits: ["Writer(s)/Splits"],
  publisherInformation: ["Publisher Information"],
  producerCredits: ["Producers/Other Credits"],
  notes: ["Notes"],
  coverArtComplete: ["Cover Art ✓ "],
  lyricsComplete: ["Lyrics ✓"],
  dolbyAtmosComplete: ["Dolby Atmos Mix(s) ✓"],
  appleMotionArtComplete: ["Apple Motion Art ✓"],
  masterAudioComplete: ["Master Audio File ✓"],
  nmdStatus: ["NMD Status"],
  status: ["Status"]
};

let releaseSchemaPromise;
let usersSchemaPromise;

function createNotionClient() {
  const { notionToken } = getEnv();
  return new Client({ auth: notionToken });
}

function getPlainTitle(items = []) {
  return items.map((item) => item.plain_text).join("").trim();
}

function toRichText(value) {
  if (!value) {
    return [];
  }

  return [
    {
      type: "text",
      text: {
        content: value
      }
    }
  ];
}

function buildNotionFileValue(url, label) {
  if (!url) {
    return null;
  }

  return {
    type: "external",
    name: label,
    external: {
      url
    }
  };
}

function resolvePropertyName(properties, candidates, required = true) {
  for (const name of candidates) {
    if (properties[name]) {
      return name;
    }
  }

  if (required) {
    throw new Error(`Expected Notion property not found. Tried: ${candidates.join(", ")}`);
  }

  return null;
}

async function getReleaseSchema() {
  if (!releaseSchemaPromise) {
    const notion = createNotionClient();
    const { notionReleaseScheduleDb } = getEnv();
    releaseSchemaPromise = notion.dataSources.retrieve({
      data_source_id: notionReleaseScheduleDb
    });
  }

  return releaseSchemaPromise;
}

async function getUsersSchema() {
  if (!usersSchemaPromise) {
    const notion = createNotionClient();
    const { notionUsersDb } = getEnv();
    usersSchemaPromise = notion.dataSources.retrieve({
      data_source_id: notionUsersDb
    });
  }

  return usersSchemaPromise;
}

function findAllowlistProperty(properties) {
  const entries = Object.entries(properties);

  const emailProperty =
    entries.find(([name, property]) => property.type === "email" && /email/i.test(name)) ||
    entries.find(([name, property]) => property.type === "title" && /name|email/i.test(name)) ||
    entries.find(([name, property]) => property.type === "rich_text" && /email/i.test(name)) ||
    entries.find(([, property]) => property.type === "title");

  if (!emailProperty) {
    throw new Error("Could not find an email-compatible property in the allowlist data source.");
  }

  return emailProperty;
}

function buildAllowlistFilter(propertyName, propertyType, email) {
  if (propertyType === "email") {
    return { property: propertyName, email: { equals: email } };
  }

  if (propertyType === "rich_text") {
    return { property: propertyName, rich_text: { equals: email } };
  }

  return { property: propertyName, title: { equals: email } };
}

async function uploadFileToNotion(notion, file) {
  if (!file || typeof file.name !== "string" || file.size === 0) {
    return null;
  }

  const created = await notion.fileUploads.create({
    mode: "single_part",
    filename: file.name,
    content_type: file.type || "application/octet-stream"
  });

  await notion.fileUploads.send({
    file_upload_id: created.id,
    file: {
      filename: file.name,
      data: file
    }
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const uploaded = await notion.fileUploads.retrieve({
      file_upload_id: created.id
    });

    if (uploaded.status === "uploaded") {
      return {
        type: "file_upload",
        file_upload: {
          id: created.id
        },
        name: file.name
      };
    }

    if (uploaded.status === "failed") {
      const message = uploaded.file_import_result?.type === "error" ? uploaded.file_import_result.error.message : "File upload failed in Notion.";
      throw new Error(message);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return {
    type: "file_upload",
    file_upload: {
      id: created.id
    },
    name: file.name
  };
}

function buildResolvedFieldMap(properties) {
  return Object.fromEntries(
    Object.entries(RELEASE_FIELD_CANDIDATES).map(([key, candidates]) => [
      key,
      resolvePropertyName(properties, candidates, !["appleMotionArtComplete"].includes(key))
    ])
  );
}

export async function isEmailAllowed(email) {
  const notion = createNotionClient();
  const { notionUsersDb } = getEnv();
  const schema = await getUsersSchema();
  const [propertyName, property] = findAllowlistProperty(schema.properties);

  const response = await notion.dataSources.query({
    data_source_id: notionUsersDb,
    page_size: 1,
    result_type: "page",
    filter: buildAllowlistFilter(propertyName, property.type, email.trim().toLowerCase())
  });

  return response.results.some((result) => {
    if (result.object !== "page") {
      return false;
    }

    const propertyValue = result.properties[propertyName];

    if (!propertyValue) {
      return false;
    }

    if (property.type === "email") {
      return propertyValue.email?.trim().toLowerCase() === email.trim().toLowerCase();
    }

    if (property.type === "rich_text") {
      return getPlainTitle(propertyValue.rich_text).trim().toLowerCase() === email.trim().toLowerCase();
    }

    return getPlainTitle(propertyValue.title).trim().toLowerCase() === email.trim().toLowerCase();
  });
}

export async function createReleaseSubmission(payload, files, session) {
  const notion = createNotionClient();
  const env = getEnv();
  const releaseSchema = await getReleaseSchema();
  const fields = buildResolvedFieldMap(releaseSchema.properties);
  const tracklistValue =
    payload.releaseType === "album"
      ? splitTrackLines(payload.tracklist)
          .map((line, index) => `${index + 1}. ${line}`)
          .join("\n")
      : payload.waterfallRelease === "Yes"
        ? splitTrackLines(payload.waterfallTracklist)
            .map((line, index) => `${index + 1}. ${line}`)
            .join("\n")
        : "";

  const lyricsUpload = await uploadFileToNotion(notion, files.lyricsFile);
  const coverArtUpload = await uploadFileToNotion(notion, files.coverArtFile);
  const lyricsExternal = buildNotionFileValue(payload.lyricsUrl, "Lyrics URL");
  const coverArtExternal = buildNotionFileValue(payload.coverArtUrl, "Cover Art URL");
  const lyricsFiles = [lyricsExternal, lyricsUpload].filter(Boolean);
  const coverArtFiles = [coverArtExternal, coverArtUpload].filter(Boolean);

  const properties = {
    [fields.releaseTitle]: {
      title: toRichText(payload.title)
    },
    [fields.releaseType]: {
      rich_text: toRichText(payload.releaseType === "album" ? "Album / EP" : "Single")
    },
    [fields.labelName]: {
      rich_text: toRichText(payload.labelName)
    },
    [fields.submitterEmail]: {
      rich_text: toRichText(session.email || "")
    },
    [fields.mainArtists]: {
      rich_text: toRichText(payload.mainArtists)
    },
    [fields.featuredArtists]: {
      rich_text: toRichText(payload.featuredArtists)
    },
    [fields.releaseVersion]: {
      rich_text: toRichText(payload.releaseVersion)
    },
    [fields.tracklist]: {
      rich_text: toRichText(tracklistValue)
    },
    [fields.explicit]: {
      select: payload.explicit ? { name: payload.explicit } : null
    },
    [fields.dealTags]: {
      multi_select: payload.dealTags.map((name) => ({ name }))
    },
    [fields.distributor]: {
      multi_select: payload.distributor ? [{ name: payload.distributor }] : []
    },
    [fields.mainGenre]: {
      rich_text: toRichText(payload.mainGenre)
    },
    [fields.subGenre]: {
      rich_text: toRichText(payload.subGenre)
    },
    [fields.secondaryGenre]: {
      rich_text: toRichText(payload.secondaryGenre)
    },
    [fields.secondarySubGenre]: {
      rich_text: toRichText(payload.secondarySubGenre)
    },
    [fields.releaseDate]: {
      date: payload.releaseDate ? { start: payload.releaseDate } : null
    },
    [fields.preorderDate]: {
      date: payload.preorderDate ? { start: payload.preorderDate } : null
    },
    [fields.recordingDate]: {
      date: payload.recordingDate ? { start: payload.recordingDate } : null
    },
    [fields.socialReleaseDate]: {
      date: payload.socialReleaseDate ? { start: payload.socialReleaseDate } : null
    },
    [fields.audioFileLink]: {
      url: payload.audioFileLink || null
    },
    [fields.lyrics]: {
      files: lyricsFiles
    },
    [fields.coverArt]: {
      files: coverArtFiles
    },
    [fields.dolbyAtmosLink]: {
      url: payload.dolbyAtmosLink || null
    },
    [fields.appleMotionArtLink]: {
      url: payload.appleMotionArtLink || null
    },
    [fields.waterfallRelease]: {
      select: payload.releaseType === "single" ? { name: payload.waterfallRelease } : null
    },
    [fields.writersSplits]: {
      rich_text: toRichText(payload.writersSplits)
    },
    [fields.publisherInformation]: {
      rich_text: toRichText(payload.publisherInformation)
    },
    [fields.producerCredits]: {
      rich_text: toRichText(payload.producerCredits)
    },
    [fields.notes]: {
      rich_text: toRichText(payload.notes)
    },
    [fields.coverArtComplete]: {
      checkbox: Boolean(coverArtFiles.length)
    },
    [fields.lyricsComplete]: {
      checkbox: Boolean(lyricsFiles.length)
    },
    [fields.dolbyAtmosComplete]: {
      checkbox: Boolean(payload.dolbyAtmosLink)
    },
    [fields.masterAudioComplete]: {
      checkbox: Boolean(payload.audioFileLink)
    },
    [fields.nmdStatus]: {
      select: { name: "Queue" }
    },
    [fields.status]: {
      status: { name: "Scheduled" }
    }
  };

  if (fields.appleMotionArtComplete) {
    properties[fields.appleMotionArtComplete] = {
      checkbox: Boolean(payload.appleMotionArtLink)
    };
  }

  const response = await notion.pages.create({
    parent: {
      data_source_id: env.notionReleaseScheduleDb
    },
    properties
  });

  return response;
}
