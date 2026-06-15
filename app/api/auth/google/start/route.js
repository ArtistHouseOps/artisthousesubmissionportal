import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getStateCookieOptions, OAUTH_STATE_COOKIE_NAME } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request) {
  const env = getEnv();
  const state = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const redirectUri = new URL("/api/auth/google/callback", request.url).toString();

  url.searchParams.set("client_id", env.googleClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, state, getStateCookieOptions());
  return response;
}
