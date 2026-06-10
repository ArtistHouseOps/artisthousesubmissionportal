import { NextResponse } from "next/server";
import { findReleaseSubmissionsByTitleAndEmail } from "@/lib/notion";
import { readSessionToken, SESSION_COOKIE_NAME } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await readSessionToken(token);

  if (!session?.authorized || !session.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const title = request.nextUrl.searchParams.get("title")?.trim();

  if (!title) {
    return NextResponse.json({ error: "Missing title." }, { status: 400 });
  }

  try {
    const matches = await findReleaseSubmissionsByTitleAndEmail(title, session.email);

    return NextResponse.json({
      ok: true,
      matches
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error?.message || "Could not look up submissions."
      },
      { status: 400 }
    );
  }
}
