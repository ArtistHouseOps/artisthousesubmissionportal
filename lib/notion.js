import "server-only";

import { Client } from "@notionhq/client";
import { getEnv } from "@/lib/env";
import { splitTrackLines } from "@/lib/validation";

const RELEASE_FIELD_CANDIDATES = {
  releaseTitle: ["Release Title"],
  releaseType: ["Type of Release:", "Type of Release", "Release Type", "Release type"],
  labelName: ["Label Name"],
  submitterEmail: ["Submitter’s Email:"],
  mainArtists: ["Display Artist"],
  featuredArtists: ["Featured Artist(s)"],
  releaseVersion: ["Release Version"],
  productVersion: ["Product Version"],
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

function getRichTextValue(property) {
  if (!property) {
    return "";
  }

  if (property.type === "email") {
    return property.email || "";
  }

  if (property.type === "title") {
    return getPlainTitle(property.title);
  }

  if (property.type === "rich_text") {
    return getPlainTitle(property.rich_text);
  }

  return "";
}

function getSelectValue(property) {
  if (!property) {
    return "";
  }

  if (property.type === "select") {
    return property.select?.name || "";
  }

  if (property.type === "status") {
    return property.status?.name || "";
  }

  return "";
}

function getMultiSelectValue(property) {
  if (!property || property.type !== "multi_select") {
    return [];
  }

  return property.multi_select.map((item) => item.name).filter(Boolean);
}

function getDateValue(property) {
  if (!property || property.type !== "date") {
    return "";
  }

  return property.date?.start || "";
}

function getUrlValue(property) {
  if (!property || property.type !== "url") {
    return "";
  }

  return property.url || "";
}

function getFiles(property) {
  if (!property || property.type !== "files") {
    return [];
  }

  return property.files || [];
}

function getReleaseTypeValue(property) {
  const candidates = [
    getRichTextValue(property),
    getSelectValue(property),
    ...(property?.type === "multi_select" ? property.multi_select.map((item) => item.name) : [])
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  return candidates.find(Boolean) || "";
}

function stripTracklistNumbering(value) {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\.\s*/, ""))
    .join("\n")
    .trim();
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

function buildNamedPropertyValue(propertySchema, value) {
  if (!propertySchema || !value) {
    return null;
  }

  if (propertySchema.type === "select") {
    return {
      select: { name: value }
    };
  }

  if (propertySchema.type === "multi_select") {
    return {
      multi_select: [{ name: value }]
    };
  }

  if (propertySchema.type === "status") {
    return {
      status: { name: value }
    };
  }

  return {
    rich_text: toRichText(value)
  };
}

function normalizePropertyName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function resolvePropertyName(properties, candidates, required = true) {
  for (const name of candidates) {
    if (properties[name]) {
      return name;
    }
  }

  const propertyNames = Object.keys(properties);
  const normalizedMap = new Map(propertyNames.map((name) => [normalizePropertyName(name), name]));

  for (const candidate of candidates) {
    const normalizedCandidate = normalizePropertyName(candidate);

    if (normalizedMap.has(normalizedCandidate)) {
      return normalizedMap.get(normalizedCandidate);
    }

    const partialMatch = propertyNames.find((name) => {
      const normalizedName = normalizePropertyName(name);
      return normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName);
    });

    if (partialMatch) {
      return partialMatch;
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

function buildReleaseQueryFilter(fields, releaseSchema, title, email) {
  const titleField = releaseSchema.properties[fields.releaseTitle];
  const emailField = releaseSchema.properties[fields.submitterEmail];

  const titleFilter =
    titleField?.type === "title"
      ? { property: fields.releaseTitle, title: { equals: title } }
      : { property: fields.releaseTitle, rich_text: { equals: title } };

  const emailFilter =
    emailField?.type === "email"
      ? { property: fields.submitterEmail, email: { equals: email } }
      : { property: fields.submitterEmail, rich_text: { equals: email } };

  return {
    and: [titleFilter, emailFilter]
  };
}

function buildReleaseFormValuesFromPage(page, fields) {
  const releaseTypeText = getReleaseTypeValue(page.properties[fields.releaseType]);
  const releaseType = /single/i.test(releaseTypeText) ? "single" : "album";
  const tracklistText = stripTracklistNumbering(getRichTextValue(page.properties[fields.tracklist]));
  const lyricsFiles = getFiles(page.properties[fields.lyrics]);
  const coverArtFiles = getFiles(page.properties[fields.coverArt]);
  const lyricsUrl = lyricsFiles.find((file) => file.type === "external")?.external?.url || "";
  const coverArtUrl = coverArtFiles.find((file) => file.type === "external")?.external?.url || "";

  return {
    pageId: page.id,
    releaseType,
    formValues: {
      title: getRichTextValue(page.properties[fields.releaseTitle]),
      labelName: getRichTextValue(page.properties[fields.labelName]),
      mainArtists: getRichTextValue(page.properties[fields.mainArtists]),
      featuredArtists: getRichTextValue(page.properties[fields.featuredArtists]),
      releaseVersion: getRichTextValue(page.properties[fields.releaseVersion]),
      tracklist: releaseType === "album" ? tracklistText : "",
      explicit: getSelectValue(page.properties[fields.explicit]) || "Non-Explicit",
      dealTags: getMultiSelectValue(page.properties[fields.dealTags]),
      distributor: getMultiSelectValue(page.properties[fields.distributor])[0] || "",
      mainGenre: getRichTextValue(page.properties[fields.mainGenre]),
      subGenre: getRichTextValue(page.properties[fields.subGenre]),
      secondaryGenre: getRichTextValue(page.properties[fields.secondaryGenre]),
      secondarySubGenre: getRichTextValue(page.properties[fields.secondarySubGenre]),
      releaseDate: getDateValue(page.properties[fields.releaseDate]),
      preorderDate: getDateValue(page.properties[fields.preorderDate]),
      recordingDate: getDateValue(page.properties[fields.recordingDate]),
      socialReleaseDate: getDateValue(page.properties[fields.socialReleaseDate]),
      audioFileLink: getUrlValue(page.properties[fields.audioFileLink]),
      lyricsUrl,
      coverArtUrl,
      dolbyAtmosLink: getUrlValue(page.properties[fields.dolbyAtmosLink]),
      appleMotionArtLink: getUrlValue(page.properties[fields.appleMotionArtLink]),
      waterfallRelease: releaseType === "single" ? getSelectValue(page.properties[fields.waterfallRelease]) || "" : "",
      waterfallTracklist: releaseType === "single" ? tracklistText : "",
      writersSplits: getRichTextValue(page.properties[fields.writersSplits]),
      publisherInformation: getRichTextValue(page.properties[fields.publisherInformation]),
      producerCredits: getRichTextValue(page.properties[fields.producerCredits]),
      notes: getRichTextValue(page.properties[fields.notes])
    },
    existingAssets: {
      lyrics: lyricsFiles.length > 0,
      coverArt: coverArtFiles.length > 0
    },
    updatedAt: page.last_edited_time,
    createdAt: page.created_time
  };
}

async function buildReleaseProperties({ notion, payload, files, session, existingPage = null }) {
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
  const existingLyricsFiles = existingPage ? getFiles(existingPage.properties[fields.lyrics]) : [];
  const existingCoverArtFiles = existingPage ? getFiles(existingPage.properties[fields.coverArt]) : [];
  const hasNewLyrics = Boolean(lyricsUpload || lyricsExternal);
  const hasNewCoverArt = Boolean(coverArtUpload || coverArtExternal);
  const lyricsFiles = hasNewLyrics ? [lyricsExternal, lyricsUpload].filter(Boolean) : existingLyricsFiles;
  const coverArtFiles = hasNewCoverArt ? [coverArtExternal, coverArtUpload].filter(Boolean) : existingCoverArtFiles;

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
    [fields.productVersion]: buildNamedPropertyValue(releaseSchema.properties[fields.productVersion], "All DSPs (Main)"),
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
      select: payload.releaseType === "single" && payload.waterfallRelease ? { name: payload.waterfallRelease } : null
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

  return { properties, fields };
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
  const { properties } = await buildReleaseProperties({ notion, payload, files, session });

  const response = await notion.pages.create({
    parent: {
      data_source_id: env.notionReleaseScheduleDb
    },
    properties
  });

  return response;
}

export async function findReleaseSubmissionsByTitleAndEmail(title, email) {
  const notion = createNotionClient();
  const env = getEnv();
  const releaseSchema = await getReleaseSchema();
  const fields = buildResolvedFieldMap(releaseSchema.properties);

  const response = await notion.dataSources.query({
    data_source_id: env.notionReleaseScheduleDb,
    result_type: "page",
    page_size: 10,
    filter: buildReleaseQueryFilter(fields, releaseSchema, title.trim(), email.trim())
  });

  return response.results
    .filter((result) => result.object === "page")
    .map((page) => buildReleaseFormValuesFromPage(page, fields));
}

export async function getReleaseSubmissionById(pageId) {
  const notion = createNotionClient();
  const releaseSchema = await getReleaseSchema();
  const fields = buildResolvedFieldMap(releaseSchema.properties);
  const page = await notion.pages.retrieve({ page_id: pageId });

  if (page.object !== "page") {
    throw new Error("Submission not found.");
  }

  return {
    page,
    fields,
    mapped: buildReleaseFormValuesFromPage(page, fields)
  };
}

export async function updateReleaseSubmission(pageId, payload, files, session) {
  const notion = createNotionClient();
  const { page } = await getReleaseSubmissionById(pageId);
  const releaseSchema = await getReleaseSchema();
  const fields = buildResolvedFieldMap(releaseSchema.properties);
  const existingEmail = getRichTextValue(page.properties[fields.submitterEmail]).trim().toLowerCase();

  if (!session?.email || existingEmail !== session.email.trim().toLowerCase()) {
    throw new Error("Unauthorized to edit this submission.");
  }

  const { properties } = await buildReleaseProperties({
    notion,
    payload,
    files,
    session,
    existingPage: page
  });

  return notion.pages.update({
    page_id: pageId,
    properties
  });
}
