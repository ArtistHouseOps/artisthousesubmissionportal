"use client";

import { useState } from "react";
import { EXPLICIT_OPTIONS, INITIAL_FORM_VALUES, RELEASE_TYPES, STEP_DEFINITIONS, WATERFALL_OPTIONS } from "@/lib/release-config";

function getTrackPreview(value) {
  return value
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");
}

function getStepErrors(releaseType, formValues, files, stepId) {
  const errors = {};

  if (stepId === "song") {
    if (!formValues.title.trim()) {
      errors.title = "Title is required.";
    }

    if (releaseType === "album" && !formValues.tracklist.trim()) {
      errors.tracklist = "Tracklist is required for Album / EP.";
    }
  }

  if (stepId === "timeline") {
    if (!formValues.mainGenre.trim()) {
      errors.mainGenre = "Main genre is required.";
    }

    if (!formValues.releaseDate.trim()) {
      errors.releaseDate = "Release date is required.";
    }
  }

  if (stepId === "song" && releaseType === "single" && formValues.waterfallRelease === "Yes" && !formValues.waterfallTracklist.trim()) {
    errors.waterfallTracklist = "Provide the waterfall track order.";
  }

  return errors;
}

export default function PortalApp({ initialSession }) {
  const [session, setSession] = useState(initialSession);
  const [releaseType, setReleaseType] = useState("album");
  const [stepIndex, setStepIndex] = useState(0);
  const [formValues, setFormValues] = useState(INITIAL_FORM_VALUES);
  const [files, setFiles] = useState({
    lyricsFile: null,
    coverArtFile: null
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({
    type: "idle",
    message: ""
  });

  const currentStep = STEP_DEFINITIONS[stepIndex];
  const trackPreview = getTrackPreview(releaseType === "album" ? formValues.tracklist : formValues.waterfallTracklist);
  const isAuthorized = Boolean(session?.authorized);

  function updateField(field, value) {
    setFormValues((current) => ({
      ...current,
      [field]: value
    }));
  }

  function handleStepChange(nextIndex) {
    if (nextIndex > stepIndex) {
      const stepErrors = getStepErrors(releaseType, formValues, files, currentStep.id);

      if (Object.keys(stepErrors).length) {
        setErrors(stepErrors);
        return;
      }
    }

    setErrors({});
    setStepIndex(nextIndex);
  }

  function handleFormKeyDown(event) {
    if (event.key !== "Enter") {
      return;
    }

    if (event.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (stepIndex < STEP_DEFINITIONS.length - 1) {
      event.preventDefault();
    }
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    setSession(null);
    setStatus({
      type: "idle",
      message: ""
    });
  }

  async function handleSubmit(event) {
    event?.preventDefault?.();

    if (stepIndex < STEP_DEFINITIONS.length - 1) {
      handleStepChange(stepIndex + 1);
      return;
    }

    const allErrors = STEP_DEFINITIONS.reduce((accumulator, step) => {
      return {
        ...accumulator,
        ...getStepErrors(releaseType, formValues, files, step.id)
      };
    }, {});

    if (Object.keys(allErrors).length) {
      setErrors(allErrors);
      setStatus({
        type: "error",
        message: "Please complete the required fields before submitting."
      });
      return;
    }

    setErrors({});
    setStatus({
      type: "loading",
      message: "Submitting release to Artist House and Notion..."
    });

    const payload = {
      ...formValues,
      releaseType
    };

    const body = new FormData();
    body.append("payload", JSON.stringify(payload));

    if (files.lyricsFile) {
      body.append("lyricsFile", files.lyricsFile);
    }

    if (files.coverArtFile) {
      body.append("coverArtFile", files.coverArtFile);
    }

    const response = await fetch("/api/submit-release", {
      method: "POST",
      body
    });

    const result = await response.json();

    if (!response.ok) {
      setStatus({
        type: "error",
        message: result.error || "Submission failed."
      });
      return;
    }

    setStatus({
      type: "success",
      message: "Release submitted successfully. The row has been added to the release schedule."
    });
    setFormValues(INITIAL_FORM_VALUES);
    setFiles({
      lyricsFile: null,
      coverArtFile: null
    });
    setStepIndex(0);
    setReleaseType("album");
  }

  return (
    <div className="site-shell">
      <header className="header">
        <div className="header__inner">
          <a href="https://www.artisthouse.world/" aria-label="Artist House home" target="_blank" rel="noreferrer">
            <img
              src="https://images.squarespace-cdn.com/content/v1/6888fc28887005277bd77716/4873028a-2d73-466c-b924-0f9c72496d17/artisthouse_horizontal.png?format=1500w"
              alt="Artist House"
              className="logo"
            />
          </a>
          {session ? (
            <button className="header-logout" type="button" onClick={handleLogout}>
              Log Out
            </button>
          ) : null}
        </div>
      </header>

      <main id="top">
        <section className={`section section--portal ${!isAuthorized ? "section--portal-centered" : ""}`} id="portal">
          <div>
              {!session ? (
                <div className="auth-card">
                  <h2 className="auth-title">Sign in to open the Artist House portal.</h2>
                  <p>
                    Access is limited to approved emails. After sign-in, the portal will check
                    whether your Google account is registered.
                  </p>
                  <a className="button button--solid" href="/api/auth/google/start">
                    Continue with Google
                  </a>
                </div>
              ) : null}

              {session && !isAuthorized ? (
                <div className="auth-card">
                  <div className="auth-label">Access Denied</div>
                  <h2 className="denied-title">This Google account is not on the registered user list.</h2>
                  <p className="denied-copy">
                    Signed in as {session.email}. Ask the Artist House team to add this address to the
                    Notion allowlist, then try again.
                  </p>
                  <button className="button" onClick={handleLogout} type="button">
                    Sign Out
                  </button>
                </div>
              ) : null}

              {isAuthorized ? (
                <>
                  <div className="release-switcher">
                    <div className="eyebrow">Authorized Session</div>
                    <h2 className="portal-title">Welcome back{session.name ? `, ${session.name}` : ""}.</h2>
                    <p className="portal-copy">
                      Signed in as {session.email}. Choose the release format before moving through
                      the submission tabs.
                    </p>
                    <div className="release-switcher__grid">
                      <button
                        type="button"
                        className={`release-option ${releaseType === "album" ? "is-active" : ""}`}
                        onClick={() => setReleaseType("album")}
                      >
                        <strong>Album / EP</strong>
                      </button>
                      <button
                        type="button"
                        className={`release-option ${releaseType === "single" ? "is-active" : ""}`}
                        onClick={() => setReleaseType("single")}
                      >
                        <strong>Single</strong>
                      </button>
                    </div>
                  </div>

                  <div className="step-panel" onKeyDown={handleFormKeyDown}>
                    <div className="tabs">
                      {STEP_DEFINITIONS.map((step, index) => (
                        <button
                          type="button"
                          key={step.id}
                          className={`tab-button ${index === stepIndex ? "is-active" : ""}`}
                          onClick={() => handleStepChange(index)}
                        >
                          <span className="tab-button__index">{String(index + 1).padStart(2, "0")}</span>
                          <strong>{step.label}</strong>
                          <span>{step.description}</span>
                        </button>
                      ))}
                    </div>

                    <div className="step-count">
                      Step {stepIndex + 1} of {STEP_DEFINITIONS.length}
                    </div>
                    <h3 className="step-title">{currentStep.label}</h3>
                    <p className="step-description">{currentStep.description}</p>

                    {status.type === "error" ? <div className="error-banner">{status.message}</div> : null}
                    {status.type === "success" ? <div className="success-banner">{status.message}</div> : null}
                    {status.type === "loading" ? <div className="success-banner">{status.message}</div> : null}

                  {currentStep.id === "song" ? (
                      <div className="field-grid">
                        <div className="field">
                          <label className="field-label" htmlFor="title">
                            Title <span className="required-mark">*</span>
                          </label>
                          <input
                            id="title"
                            className="text-input"
                            value={formValues.title}
                            onChange={(event) => updateField("title", event.target.value)}
                          />
                          {errors.title ? <div className="field-help">{errors.title}</div> : null}
                        </div>

                        {releaseType === "single" ? (
                          <div className="field">
                            <label className="field-label" htmlFor="releaseVersion">
                              Release Version
                            </label>
                            <input
                              id="releaseVersion"
                              className="text-input"
                              value={formValues.releaseVersion}
                              onChange={(event) => updateField("releaseVersion", event.target.value)}
                              placeholder="Remix, Extended, Acoustic, etc."
                            />
                          </div>
                        ) : null}

                        <div className="field">
                          <label className="field-label" htmlFor="mainArtists">
                            Main Artist(s){releaseType === "album" ? <span className="required-mark"> *</span> : null}
                          </label>
                          <input
                            id="mainArtists"
                            className="text-input"
                            value={formValues.mainArtists}
                            onChange={(event) => updateField("mainArtists", event.target.value)}
                          />
                        </div>

                        <div className="field">
                          <label className="field-label" htmlFor="labelName">
                            Label Name
                          </label>
                          <input
                            id="labelName"
                            className="text-input"
                            value={formValues.labelName}
                            onChange={(event) => updateField("labelName", event.target.value)}
                          />
                        </div>

                        {releaseType === "single" ? (
                          <div className="field">
                            <label className="field-label" htmlFor="featuredArtists">
                              Featured Artist(s)
                            </label>
                            <input
                              id="featuredArtists"
                              className="text-input"
                              value={formValues.featuredArtists}
                              onChange={(event) => updateField("featuredArtists", event.target.value)}
                            />
                          </div>
                        ) : null}

                        <div className="field field--full">
                          <label className="field-label" htmlFor="tracklist">
                            Tracklist
                            {releaseType === "album" ? <span className="required-mark"> *</span> : null}
                          </label>
                          {releaseType === "album" ? (
                            <>
                              <textarea
                                id="tracklist"
                                className="textarea"
                                value={formValues.tracklist}
                                onChange={(event) => updateField("tracklist", event.target.value)}
                                placeholder="Enter one track title per line."
                              />
                              {errors.tracklist ? <div className="field-help">{errors.tracklist}</div> : null}
                              {trackPreview ? (
                                <div className="track-preview">
                                  <strong>Numbered Preview</strong>
                                  {trackPreview}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <div className="field-help">
                              Waterfall releases are singles with multiple previously released singles or a single attached to a new release.
                            </div>
                          )}
                        </div>

                        <div className="field">
                          <label className="field-label" htmlFor="explicit">
                            {releaseType === "album" ? "Are any of the tracks explicit?" : "Is this release explicit?"}
                          </label>
                          <select
                            id="explicit"
                            className="select"
                            value={formValues.explicit}
                            onChange={(event) => updateField("explicit", event.target.value)}
                          >
                            {EXPLICIT_OPTIONS.map((option) => (
                              <option value={option} key={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>

                        {releaseType === "single" ? (
                          <div className="field">
                            <label className="field-label" htmlFor="waterfallRelease">
                              Waterfall Release? <span className="required-mark">*</span>
                            </label>
                            <select
                              id="waterfallRelease"
                              className="select"
                              value={formValues.waterfallRelease}
                              onChange={(event) => updateField("waterfallRelease", event.target.value)}
                            >
                              <option value="">Select one</option>
                              {WATERFALL_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                            <div className="field-help">
                              Waterfall releases are singles with multiple previously released singles or a single attached to a new release.
                            </div>
                          </div>
                        ) : null}

                        {releaseType === "single" && formValues.waterfallRelease === "Yes" ? (
                          <div className="field field--full">
                            <label className="field-label" htmlFor="waterfallTracklist">
                              Please indicate the titles and order of songs included in the release.
                            </label>
                            <textarea
                              id="waterfallTracklist"
                              className="textarea"
                              value={formValues.waterfallTracklist}
                              onChange={(event) => updateField("waterfallTracklist", event.target.value)}
                              placeholder="One track title per line."
                            />
                            {errors.waterfallTracklist ? <div className="field-help">{errors.waterfallTracklist}</div> : null}
                            {trackPreview ? (
                              <div className="track-preview">
                                <strong>Numbered Preview</strong>
                                {trackPreview}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {currentStep.id === "timeline" ? (
                      <div className="field-grid">
                        <div className="field">
                          <label className="field-label" htmlFor="mainGenre">
                            Main Genre <span className="required-mark">*</span>
                          </label>
                          <input
                            id="mainGenre"
                            className="text-input"
                            value={formValues.mainGenre}
                            onChange={(event) => updateField("mainGenre", event.target.value)}
                          />
                          {errors.mainGenre ? <div className="field-help">{errors.mainGenre}</div> : null}
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="subGenre">
                            Sub Genre
                          </label>
                          <input
                            id="subGenre"
                            className="text-input"
                            value={formValues.subGenre}
                            onChange={(event) => updateField("subGenre", event.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="secondaryGenre">
                            Secondary Genre
                          </label>
                          <input
                            id="secondaryGenre"
                            className="text-input"
                            value={formValues.secondaryGenre}
                            onChange={(event) => updateField("secondaryGenre", event.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="secondarySubGenre">
                            Secondary Sub Genre
                          </label>
                          <input
                            id="secondarySubGenre"
                            className="text-input"
                            value={formValues.secondarySubGenre}
                            onChange={(event) => updateField("secondarySubGenre", event.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="releaseDate">
                            Release Date <span className="required-mark">*</span>
                          </label>
                          <input
                            id="releaseDate"
                            className="text-input"
                            type="date"
                            value={formValues.releaseDate}
                            onChange={(event) => updateField("releaseDate", event.target.value)}
                          />
                          {errors.releaseDate ? <div className="field-help">{errors.releaseDate}</div> : null}
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="preorderDate">
                            Preorder Date
                          </label>
                          <input
                            id="preorderDate"
                            className="text-input"
                            type="date"
                            value={formValues.preorderDate}
                            onChange={(event) => updateField("preorderDate", event.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="recordingDate">
                            Recording Date
                          </label>
                          <input
                            id="recordingDate"
                            className="text-input"
                            type="date"
                            value={formValues.recordingDate}
                            onChange={(event) => updateField("recordingDate", event.target.value)}
                          />
                        </div>
                        <div className="field field--full">
                          <label className="field-label" htmlFor="socialReleaseDate">
                            Social’s Release Date
                          </label>
                          <input
                            id="socialReleaseDate"
                            className="text-input"
                            type="date"
                            value={formValues.socialReleaseDate}
                            onChange={(event) => updateField("socialReleaseDate", event.target.value)}
                          />
                          <div className="field-help">
                            Usually the TikTok sound and Facebook audio go live two weeks before the
                            official audio release unless this project needs a different date.
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {currentStep.id === "assets" ? (
                      <div className="field-grid">
                        <div className="field field--full">
                          <label className="field-label" htmlFor="audioFileLink">
                            Audio File(s) Link
                          </label>
                          <input
                            id="audioFileLink"
                            className="text-input"
                            type="url"
                            value={formValues.audioFileLink}
                            onChange={(event) => updateField("audioFileLink", event.target.value)}
                            placeholder="https://"
                          />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="lyricsUrl">
                            Lyrics URL
                          </label>
                          <input
                            id="lyricsUrl"
                            className="text-input"
                            type="url"
                            value={formValues.lyricsUrl}
                            onChange={(event) => updateField("lyricsUrl", event.target.value)}
                            placeholder="https://"
                          />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="lyricsFile">
                            Attach Lyrics
                          </label>
                          <input
                            id="lyricsFile"
                            className="file-input"
                            type="file"
                            onChange={(event) =>
                              setFiles((current) => ({
                                ...current,
                                lyricsFile: event.target.files?.[0] || null
                              }))
                            }
                          />
                          {files.lyricsFile ? (
                            <div className="file-meta">
                              <strong>Selected File</strong>
                              {files.lyricsFile.name}
                            </div>
                          ) : null}
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="coverArtUrl">
                            Cover Art URL
                          </label>
                          <input
                            id="coverArtUrl"
                            className="text-input"
                            type="url"
                            value={formValues.coverArtUrl}
                            onChange={(event) => updateField("coverArtUrl", event.target.value)}
                            placeholder="https://"
                          />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="coverArtFile">
                            Attach Cover Art
                          </label>
                          <input
                            id="coverArtFile"
                            className="file-input"
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              setFiles((current) => ({
                                ...current,
                                coverArtFile: event.target.files?.[0] || null
                              }))
                            }
                          />
                          {files.coverArtFile ? (
                            <div className="file-meta">
                              <strong>Selected File</strong>
                              {files.coverArtFile.name}
                            </div>
                          ) : null}
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="dolbyAtmosLink">
                            Dolby Atmos Mix Link
                          </label>
                          <input
                            id="dolbyAtmosLink"
                            className="text-input"
                            type="url"
                            value={formValues.dolbyAtmosLink}
                            onChange={(event) => updateField("dolbyAtmosLink", event.target.value)}
                            placeholder="https://"
                          />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="appleMotionArtLink">
                            Apple Motion Art Link
                          </label>
                          <input
                            id="appleMotionArtLink"
                            className="text-input"
                            type="url"
                            value={formValues.appleMotionArtLink}
                            onChange={(event) => updateField("appleMotionArtLink", event.target.value)}
                            placeholder="https://"
                          />
                        </div>
                      </div>
                    ) : null}

                    {currentStep.id === "publishing" ? (
                      <div className="field-grid">
                        <div className="field field--full">
                          <label className="field-label" htmlFor="writersSplits">
                            Writer(s) and Splits
                          </label>
                          <textarea
                            id="writersSplits"
                            className="textarea"
                            value={formValues.writersSplits}
                            onChange={(event) => updateField("writersSplits", event.target.value)}
                          />
                        </div>
                        <div className="field field--full">
                          <label className="field-label" htmlFor="publisherInformation">
                            Publisher Information
                          </label>
                          <textarea
                            id="publisherInformation"
                            className="textarea"
                            value={formValues.publisherInformation}
                            onChange={(event) => updateField("publisherInformation", event.target.value)}
                          />
                        </div>
                        <div className="field field--full">
                          <label className="field-label" htmlFor="producerCredits">
                            Producer(s) / Other Credits
                          </label>
                          <textarea
                            id="producerCredits"
                            className="textarea"
                            value={formValues.producerCredits}
                            onChange={(event) => updateField("producerCredits", event.target.value)}
                          />
                        </div>
                        <div className="field field--full">
                          <label className="field-label" htmlFor="notes">
                            Any Other Notes / Special Requests
                          </label>
                          <textarea
                            id="notes"
                            className="textarea"
                            value={formValues.notes}
                            onChange={(event) => updateField("notes", event.target.value)}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="step-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={stepIndex === 0}
                        onClick={() => handleStepChange(stepIndex - 1)}
                      >
                        Previous
                      </button>
                      {stepIndex < STEP_DEFINITIONS.length - 1 ? (
                        <button className="button button--solid" type="button" onClick={() => handleStepChange(stepIndex + 1)}>
                          Continue
                        </button>
                      ) : (
                        <button className="button button--solid" type="button" onClick={handleSubmit} disabled={status.type === "loading"}>
                          {status.type === "loading" ? "Submitting..." : "Submit Release"}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div>
          <h4>ARTIST HOUSE</h4>
        </div>
        <div>
          <h4>Location</h4>
          <p>
            60 Charlton Street
            <br />
            New York, NY 10014
          </p>
        </div>
        <div>
          <h4>Connect</h4>
          <a href="https://www.instagram.com/artisthousehq" target="_blank" rel="noreferrer">
            Instagram
          </a>
          <br />
          <a href="https://www.tiktok.com/@artisthousehq" target="_blank" rel="noreferrer">
            TikTok
          </a>
        </div>
        <div>
          <h4>Terms & Privacy</h4>
          <a href="https://www.artisthouse.world/terms-and-conditions" target="_blank" rel="noreferrer">
            Terms & Conditions
          </a>
          <br />
          <a href="https://www.artisthouse.world/privacy-policy" target="_blank" rel="noreferrer">
            Privacy Policy
          </a>
        </div>
      </footer>
    </div>
  );
}
