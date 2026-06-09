import { NextResponse } from "next/server";
import { createReleaseSubmission } from "@/lib/notion";
import { readSessionToken, SESSION_COOKIE_NAME } from "@/lib/session";
import { releasePayloadSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await readSessionToken(token);

  if (!session?.authorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const payloadText = formData.get("payload");

    if (typeof payloadText !== "string") {
      return NextResponse.json({ error: "Missing payload." }, { status: 400 });
    }

    const parsedPayload = releasePayloadSchema.parse(JSON.parse(payloadText));
    const normalizedPayload = {
      ...parsedPayload,
      dealTags: ["Distribution Only"],
      distributor: "Fuga"
    };

    const lyricsFile = formData.get("lyricsFile");
    const coverArtFile = formData.get("coverArtFile");

    const createdPage = await createReleaseSubmission(
      normalizedPayload,
      {
        lyricsFile: lyricsFile instanceof File ? lyricsFile : null,
        coverArtFile: coverArtFile instanceof File ? coverArtFile : null
      },
      session
    );

    return NextResponse.json({
      ok: true,
      pageId: createdPage.id
    });
  } catch (error) {
    const message =
      error?.issues?.[0]?.message ||
      error?.message ||
      "Something went wrong while submitting the release.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
