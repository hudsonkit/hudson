# Transcription adapter testing

Status: Current-source coverage reconciled September 16, 2026. The implementation
is in isolated worktrees and has not been released. Test totals below describe
specific recorded runs, not universal acceptance of the entire design.

## Current verification

Latest merge check: the root Hudson package on `origin/main` `4a60eb2` passed
72 transcription tests and 27 existing HudsonVoice tests with published Vox
`9190158` and no local Vox override. Run the root-package commands in the
merge validation record (internal local document).
The table below preserves earlier, separately scoped acceptance runs.

| Check | Recorded result | Evidence limit |
| --- | --- | --- |
| Core, cloud, ElevenLabs current-source harness | 38 tests across 6 suites passed | Injected transports; no vendor audio requests |
| Direct FluidAudio harness | 6 tests passed | Lifecycle/runtime fixtures |
| Native Parakeet V3 | File and caller-fed live inference passed on a generated sentence | Does not prove physical microphone or product insertion behavior |
| TalkieTranscription host | 27 reported tests passed; native opt-in skipped | Includes two parameterized completion tests, four cases each; read-only activity inspection; fixed capture routing |
| TalkieAgent | 6 tests previously passed | Routing fixtures, not physical capture acceptance |
| Full Talkie validation build | Passed after the latest host completion fix | Isolated Termini header packaging; published dependency path remains unverified |

The acceptance audit (internal local document) and
chronological evidence (internal local document)
contain scope and log paths. Earlier counts in the chronological report are
historical and are superseded by later runs.

## Current executable coverage

| Source | Assertions exercised |
| --- | --- |
| [HudsonTranscriptionTests](../../packages/native/apple/HudsonKit/Tests/HudsonTranscriptionTests/) | Duplicate registration, unknown saved IDs, fingerprints, optional annotations, unsupported/unverified compatibility, accepted IDs, cancellation distinctions, partial replacement, bounded PCM and terminal events |
| [HudsonTranscriptionCloudTests](../../packages/native/apple/HudsonKit/Tests/HudsonTranscriptionCloudTests/) | MAI model/options/normalization/no retry; Gemini upload ownership and cleanup, option rejection, dedicated versus conversational input, ordered PCM, drain timeout and remote uncertainty |
| [ElevenLabsAdapterTests](../../packages/native/apple/HudsonKit/Tests/HudsonTranscriptionElevenLabsTests/ElevenLabsAdapterTests.swift) | Public-contract registration and submission, words/speakers/provenance, unsupported hints before upload |
| TalkieTranscription `WorkspaceTests` and `LiveWorkspaceTests` | Consent, saved selection/run recovery, ordered audio, result identity, contradictory completion payloads, separate meeting-track recovery without duplicate upload |

The acceptance matrix below remains a requirements checklist. Presence in that
matrix does not assert a passing test for every row. In particular, download
cancellation, automatic session rotation, shared cross-adapter resource ownership,
and physical UI/capture behavior are not established by the checks above.

## Run the recorded checks

The task-owned contract harness symlinks this worktree's current source and tests.
It excludes native SDK targets. Run native checks separately.

```sh
swift test --package-path "$HOME/Library/Caches/codex-builds/hudson-transcription-contract-harness" \
  --scratch-path "$HOME/Library/Caches/codex-builds/hudson-transcription-contract-check"
```

For Talkie's host suite, run from the isolated Talkie worktree:

```sh
HUDSON_PACKAGE_PATH=/Users/arach/dev/hudson-worktrees/transcription-adapters \
  swift test --package-path apps/macos/TalkieTranscription \
  --scratch-path "$HOME/Library/Caches/codex-builds/talkie-transcription-host"
```

Native Parakeet acceptance requires a local model folder and an authorized
recording. Set `HUDSON_PARAKEET_MODEL_DIR` and
`HUDSON_TRANSCRIPTION_ACCEPTANCE_AUDIO`. The test does not record a microphone or
send audio to a cloud service.

## Historical HudsonVoice baseline


These Swift Testing suites exist in this Hudson checkout today. They cover current `HudsonVoice` behavior that the proposal says to preserve. They are not adapter contract tests.

Verified run, 16 September 2026, assigned `origin/main` worktree, exit 0. 27 tests in 5 suites passed. This validates existing behavior only, not proposed adapters. See the baseline verification report (internal local document) for scope and limits.

```text
swift test --scratch-path "$HOME/Library/Caches/codex-builds/hudson-transcription-baseline" --filter HudsonVoiceTests
```

| Suite | Path | What it exercises | Out of scope |
| --- | --- | --- | --- |
| `HudDictation capture start gate` | [`HudDictationCaptureStartGateTests.swift`](../../packages/native/apple/HudsonKit/Tests/HudsonVoiceTests/HudDictationCaptureStartGateTests.swift) | Duplicate begin is rejected, cancel invalidates delayed callbacks, finish is idempotent for the current generation | PCM adapters, provider cancellation states |
| `HudPendingUtteranceStore` | [`HudPendingUtterancesTests.swift`](../../packages/native/apple/HudsonKit/Tests/HudsonVoiceTests/HudPendingUtterancesTests.swift) | Held dictation audio moves onto durable storage, replays in capture order including sub-second captures, survives store relaunch, discards one utterance, and round-trips capture context | Adapter submit, remote jobs, meeting tracks |
| `HudsonVoicePreferences` | [`HudsonVoicePreferencesTests.swift`](../../packages/native/apple/HudsonKit/Tests/HudsonVoiceTests/HudsonVoicePreferencesTests.swift) | Hudson preferences save and mirror into embedded Vox preferences, including transcription model id | Adapter configuration fingerprints, credential resolvers |
| `HudSpeech` | [`HudSpeechTests.swift`](../../packages/native/apple/HudsonKit/Tests/HudsonVoiceTests/HudSpeechTests.swift) | Spoken-output provider and credential helpers | Transcription adapters |
| `HudSpeechPlayback` | [`HudSpeechPlaybackTests.swift`](../../packages/native/apple/HudsonKit/Tests/HudsonVoiceTests/HudSpeechPlaybackTests.swift) | Host-lent TTS playback through Vox Apple Speech | Transcription adapters |

Related current code, not covered by an adapter suite:

| Surface | Path | Note |
| --- | --- | --- |
| `HudDictation` | [`HudDictation.swift`](../../packages/native/apple/HudsonKit/Sources/HudsonVoice/HudDictation.swift) | Embedded Parakeet plus Apple partials/fallback and `parakeetOnly` queue. Preserve callers. Existing embedded path remains separate from new adapter tests |
| `HudAudioTranscriber` | [`HudAudioTranscriber.swift`](../../packages/native/apple/HudsonKit/Sources/HudsonUIAudio/HudAudioTranscriber.swift) | Apple Speech file facade. No matching test target was found in this checkout |
| `HudVoxLiveSession` | [`HudVoxLiveSession.swift`](../../packages/native/apple/HudsonKit/Sources/HudsonVoice/HudVoxLiveSession.swift) | Sends `transcribe.startSession`. Vox owns mic capture. Not a caller-fed PCM adapter |
| `HudAudioRecorder` formatting | [`HudAudioRecorderTests.swift`](../../packages/native/apple/HudsonKit/Tests/HudsonUITests/HudAudioRecorderTests.swift) | Duration and file-prefix formatting only |

Talkie meeting and engine tests live in the Talkie checkout (`EngineService`, `MeetingAnnotation`, `AnnotationProviderFactory`, `MeetingStreamingTranscriptionSession`). They were not inventoried here. Preserve those product paths during migration. Do not treat their absence from this matrix as proof they do not exist.

The new `HudsonTranscriptionTests` target exists alongside this historical baseline.

## Required contract acceptance matrix

Use these IDs to track design requirements. Map each claimed pass to a named
executable assertion or a recorded native/vendor run. The coverage inventory
above identifies implemented checks; remaining rows retain their requirements.
Do not infer a pass from a descriptor or a successful build.

### Normalization and provenance

| ID | Setup | Action | Observable result |
| --- | --- | --- | --- |
| C-NORM-1 | Vendor payload with transcript only | Map to the shared result type | Transcript present. Timing, speaker, and confidence fields absent, not zeroed |
| C-NORM-2 | Vendor payload with word timings | Map to the shared result type | Audio-relative offsets preserved. No wall-clock timestamps invented |
| C-PROV-1 | Successful batch job | Read provenance | Provider, model, adapter version, secret-free configuration fingerprint, source digest, run identity, timestamp |
| C-PROV-2 | Provider returns a request ID | Read provenance | Provider request ID present and handed to the host persistence seam |
| C-PROV-3 | Derived speaker labels from a later step | Read provenance | Annotations marked derived, not native |
| C-PROV-4 | Saved model id missing from current discovery | Enumerate models, then load saved configuration | Identifier round-trips. Readiness is unavailable. No silent substitute |

### Request option conflicts

Evaluate the whole request, including duration and feature combinations, before prepare or upload.

| ID | Setup | Action | Observable result |
| --- | --- | --- | --- |
| C-OPT-1 | Gemini file model, speaker labels plus vocabulary hints | `compatibility` | Unsupported, with a machine-readable reason. No upload |
| C-OPT-2 | Gemini file model, speaker labels plus smart formatting | `compatibility` | Unsupported, with a distinct reason. No upload |
| C-OPT-3 | Gemini annotated file longer than 30 minutes | `compatibility` | Unsupported for duration. No automatic chopping |
| C-OPT-4 | MAI-Transcribe-2 file with diarization around 15 minutes | `compatibility` | Not represented as unconditionally ready. Unknown or documented risk is visible |
| C-OPT-5 | Dedicated `gemini-3.5-transcribe-live` session past documented ten-minute limit | `compatibility` or rotation policy | Reject or rotate with caller-owned offsets. Do not apply this limit to `gemini-3.8-live` |
| C-OPT-6 | Unknown context or session limit | `compatibility` | Unverified, not treated as unlimited |
| C-OPT-7 | Request for MAI-Transcribe-1 or 1.5 | Model resolve | Rejected. MAI-Transcribe-2 is required. No implementation fallback |
| C-OPT-8 | Request that names `gemini-3.5-transcribe`, `gemini-3.5-transcribe-live`, or `gemini-3.8-live` | Model resolve | Each id stays distinct. No silent replacement by a conversational stand-in |

### Cancellation and unknown remote outcomes

| ID | Setup | Action | Observable result |
| --- | --- | --- | --- |
| C-CAN-1 | Local batch in progress | Cancel | Work stops. Resources released. Completion status is cancelled |
| C-CAN-2 | Live session after some chunks | Cancel | Late writes rejected. No terminal success. Resources released |
| C-CAN-3 | Remote job accepted, cancel supported | Request cancel | Status is cancellation requested, then cancelled when the vendor confirms |
| C-CAN-4 | Remote job accepted, vendor cancel unsupported or unanswered | Request cancel, then time out | Status is remote outcome unknown. Host still has the provider request ID |
| C-CAN-5 | Timeout after remote accept, no idempotency key | Observe retry policy | Adapter does not resubmit. Coordinator owns retry |
| C-CAN-6 | Local model download in progress | Cancel download | Model is not marked installed |

### Partial and final sequencing

| ID | Setup | Action | Observable result |
| --- | --- | --- | --- |
| C-LIVE-1 | Live session, several revisions of one utterance | Emit events | Provisional revisions replace in place. Sequence numbers increase |
| C-LIVE-2 | Same session, utterance finalized | Emit events | One finalized utterance. Session remains open |
| C-LIVE-3 | Finish input | Drain within deadline | Exactly one terminal result or error |
| C-LIVE-4 | Audio loss mid-session | Finish or cancel | Visible incomplete result, not silent success |
| C-LIVE-5 | Session rotation | Open the next session | Caller-owned source offsets continue. Speaker IDs do not silently continue across sessions |
| C-LIVE-6 | Dictation live path | Replaceable partials, then stop | One final utterance, no duplicate insertion |
| C-LIVE-7 | Dictation batch-on-release | Stop capture, then transcribe | Result labeled as batch, not as live partials |

### Adding a provider without changing core or Talkie

| ID | Setup | Action | Observable result |
| --- | --- | --- | --- |
| C-EXT-1 | Example remote package (ElevenLabs file) | Compile against the public contract only | No TalkieKit or Hudson core source change |
| C-EXT-2 | Example local package (file, batch only) | Compile against the public contract only | Same as C-EXT-1. Streaming not published |
| C-EXT-3 | Both example packages registered at app composition | Render picker and result viewer | New rows appear from registration. No provider-specific branches |
| C-EXT-4 | Conformance fixtures from C-NORM through C-CAN | Run against each example package | Same fixture set, no core edits |
| C-EXT-5 | Future Vox adapter attempt that only starts `transcribe.startSession` | Feed a Talkie meeting track | Must fail the caller-fed file/PCM requirement. Starting a second microphone is not a pass |

## Live provider acceptance

Run only with user-approved fixtures and explicit credentials from the host resolver. Do not embed secrets. Do not send diagnostic audio from a readiness check. An explicit sample transcription is a separate action.

Record provider, model, adapter version, API version, source digest, exact options, latency, and vendor usage when supplied. Recheck official catalogs before a live run. If the configured model is unavailable, record unavailable. Do not silently downgrade.

Required named targets:

| Provider path | Model id | Mode | Start condition |
| --- | --- | --- | --- |
| Microsoft MAI file | `MAI-Transcribe-2` | Batch file | Required. Do not use 1 or 1.5 |
| Gemini dedicated file | `gemini-3.5-transcribe` | Batch file | Required and distinct |
| Gemini dedicated live | `gemini-3.5-transcribe-live` | Live PCM | Required and distinct |
| Gemini 3.8 Live input transcription | `gemini-3.8-live` | Live PCM evaluation | Required as its own target. Not a replacement for dedicated Transcribe Live |
| FluidAudio local | the shipped dependency's model | File and, if verified, stream | Direct adapter, no Vox hop |
| ElevenLabs reference | vendor file model | Batch file | Example package |
| Talkie ElevenLabs / Deepgram | current meeting providers | Meeting tracks | Preserve existing product paths |

MAI Voice Live is a separate implementation path. Leave it unverified until its contract is checked. Do not copy MAI file capabilities onto it.

Gemini 3.8 Live captions-only evaluation must record response behavior, transcript completeness, finalization, latency, and billed usage. Discarding generated audio does not prove generation or its cost is disabled. Speaker labels and word timings stay unverified on this path until measured.

### Use-case fixtures

| Case | Input | Expected behavior | Required evidence |
| --- | --- | --- | --- |
| Dictation | Short push-to-talk recording | Batch-on-release is valid and labeled honestly. A separate live path shows replaceable partials and one final utterance | Captured audio, transcript, latency, stop/cancel, no duplicate insertion |
| Existing recording | Several-minute user-approved fixture with names and punctuation | Compare MAI-Transcribe-2, Gemini 3.5 file, local FluidAudio, and the ElevenLabs reference adapter on the same file | Same input digest, exact options, output, provenance, measured time, vendor usage where supplied, human-checked errors |
| Meeting | Short multi-speaker fixture plus a 45-minute fixture | Preserve mic and system track origins. Reject unsupported long input before upload. No false speaker continuity. Original recording is not lost | Speaker/timing evaluation only on supported paths. 45-minute rejection evidence on constrained models |

## Remaining product acceptance

The three use-case fixtures above remain in scope. The short local native tests
do not replace the several-minute recording comparison or the meeting fixture.
The two-track workspace regression verifies ledger recovery, successful-track
reuse, and suppression of duplicate uploads after a partial failure. A separate production-helper harness now exercises adapter word mapping, the
real merger, track separation, object serialization and revision increments. The database extension exercises the production GRDB publication helper,
including concurrent edits and rollback on an injected outbox failure. It does
not start the sweep scheduler or sync worker. See the progress
report for its command and results.

Account-backed ElevenLabs short-file acceptance passed using the secret-cli meetings key; see the acceptance audit. Gemini acceptance remains pending. MAI via OpenRouter subsequently passed live Swift-adapter acceptance after user authorization. The following earlier checks covered Talkie stores only. Checked stores did not provide
readable MAI/Azure or Gemini credentials and MAI endpoint configuration. The
ElevenLabs development key lookup returned an authentication failure, which does
not prove the key is absent. Resolve credentials through the host before testing;
do not print them or add them to fixtures.

For each live path, record the actual model, source digest, options, result,
provider request ID, completion behavior and supplied usage. A successful API
request is evidence for that request, not a comparative quality ranking.

## Settings and failure states to cover

The production mapping/database harness reports six passing tests after adding
dictation library publication. It verifies pending insertion, title/notes
preservation, completion immunity to a late failure, retained audio references on
failure, and no restoration of a deleted row. These are real GRDB tests of the
production helper; they do not prove microphone capture, library rendering, or
audio playback in the running app.

Native acceptance should include opening an active adapter dictation after more
than two minutes and attempting retranscription from another surface. The UI and
service now use controller ownership rather than the pending-age heuristic for
this case. Also cancel a capture and verify the guard remains in place until the
audio writer closes. These interaction checks are not claimed by the database
or workspace fixture suites.

Talkie has a native adapter settings view. Source and build checks do not prove
its interaction states. Exercise the following states through applicable fixtures
and native UI acceptance; do not claim all are verified current UI.

The activity disclosure lists unfinished requests from the app workspace and a
read-only snapshot of the recording agent's ledger. It shows source and track
identities, configured provider/model, and any provider request ID. An uncertain
remote outcome explains the duplicate-upload risk. A persisted `submitting`
status says that a result is pending; it does not claim the process is alive.
Refresh reads state only and never retries an upload. Missing ledgers are empty;
unreadable ledgers show an error rather than a false empty result. Fixtures cover
those distinctions and verify byte-for-byte preservation of inspected ledgers.
Native interaction acceptance is still required.

No registered adapters; missing credential; expired credential; model missing; downloading; cancelled download not installed; unavailable platform; unsupported language; incompatible options; unverified capability; offline; rate limited; cancelled; remote outcome unknown; completed; incomplete audio; plugin package unavailable after restart.

Use keyboard-operable native controls and text explanations. Do not encode state in color only.

## Deferred or unsupported in this design

- Runtime installation of arbitrary executable plugins
- Automatic composition of a transcription engine plus a second diarization engine
- Automatic audio chopping to bypass duration limits
- Silent local-to-remote fallback
- Quality ranking without the recording-fixture measurements
- MAI live, until its contract is checked and tested
- Switching existing `HudDictation` or Vox daemon callers onto the new contract in the same change that introduces the contract

## Longer native Parakeet file acceptance

The Talkie host test `nativeParakeetLongFileAcceptance` accepts
`HUDSON_PARAKEET_LONG_AUDIO` and `HUDSON_PARAKEET_MODEL_DIR`. Supply at least
180 seconds of generated speech. It checks file compatibility beyond the live
limit, completed output, provenance, more than 300 timed words, ordered starts,
and a final word within ten seconds of the file duration. It does not send that
long file through the live test. Run the host suite with
`--filter nativeParakeetLongFileAcceptance` and the two environment variables.

On 2026-09-16, a 185-second WAV made by repeating the existing generated sentence
passed in 53.390 seconds including model preparation. FluidAudio used its native
file chunk processor. Log: `/tmp/talkie-parakeet-long-file.log`. This verifies
long-file completion for that synthetic fixture, not accuracy on diverse speech
or meeting diarization. No new model installation was needed.
