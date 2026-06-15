function readEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readOptionalEnv(name) {
  return process.env[name] || "";
}

export function getEnv() {
  return {
    googleClientId: readEnv("GOOGLE_CLIENT_ID"),
    googleClientSecret: readEnv("GOOGLE_CLIENT_SECRET"),
    googleRedirectUri: readOptionalEnv("GOOGLE_REDIRECT_URI"),
    sessionSecret: readEnv("SESSION_SECRET"),
    notionToken: readEnv("NOTION_TOKEN"),
    notionReleaseScheduleDb: readEnv("NOTION_RELEASE_SCHEDULE_DB"),
    notionUsersDb: readEnv("NOTION_USERS_DB")
  };
}
