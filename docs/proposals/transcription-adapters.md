# Shared transcription adapters

Status: Implemented in isolated worktrees; verification and documentation reconciliation in progress. Not released or installed.
Owner: Hudson contract and reusable presentation; Talkie product integration.
Base: freshly fetched `origin/main` at `71fee5e03192dffe48056dedc0efacc94925bb62`, isolated branch `codex/transcription-adapters`.
Evidence checked: September 16, 2026. Provider documentation is not live API verification.
Change, September 24, 2026: the WhisperKit reference adapter was removed from Hudson. Talkie's own WhisperKit engine is unaffected.
Change, October 22, 2026: the FluidAudio adapter was removed from Hudson, which now ships no local transcription adapter. Local Parakeet remains available through HudsonVoice (Vox).

## Outcome

Let an app select a transcription implementation for dictation, recordings, or meetings without inheriting that implementation's transport, model lifecycle, or response format. Ship maintained FluidAudio, Microsoft MAI, and Gemini integrations alongside two reference extensions: an API vendor adapter and a local non-FluidAudio adapter.

Local/remote and maintained/custom are independent dimensions. A custom remote adapter calls its vendor directly; it does not require a user-hosted service. A custom local adapter can embed a library or supervise a process. Vox is optional, not the required path for all engines.

This document retains the design requirements and acceptance plan. The implementation below exists in the isolated Hudson and Talkie worktrees; it has not been committed, published, or installed. Requirement language in later sections remains an acceptance target, not evidence that every target has passed.

## Implementation snapshot — September 16, 2026

The root manifest now exports `HudsonTranscription`, `HudsonTranscriptionUI`, `HudsonTranscriptionCloud`,
`HudsonTranscriptionFluidAudio`, `HudsonTranscriptionElevenLabs`, and
`HudsonTranscriptionWhisperKit`. The shared contract owns descriptors, model
capabilities, compatibility, non-secret configuration, readiness, normalized
results, operation events, and caller-fed live sessions. Provider SDKs remain
outside that core. The implementation uses adapter metadata for catalogs; it
must not be described as a live, automatically refreshed vendor catalog.

Talkie's `TalkieTranscription` package composes the registry, selection storage,
consent, operation ledger, and PCM delivery. Product settings currently live in
Talkie's `TranscriptionAdapterSettingsView`, which uses Hudson's controlled,
schema-driven configuration fields, provider picker, and model picker. Ineligible
models remain visible with reasons and cannot be saved. Parakeet installation
remains in Talkie’s existing FluidAudio-backed model management; the adapter
reads the same SDK cache or an explicitly selected model folder. Recording and meeting
integration retains caller-owned audio and per-track identity. Global dictation
fixes its route at capture start and forwards PCM only after recorder file writes.
A selected live-route failure does not silently reroute to batch or legacy.
Existing embedded Vox and legacy provider paths remain available.

Parakeet is the preferred local path. A native Parakeet V3 acceptance test passed
for both file and caller-fed live transcription with installed assets and one
generated sentence. Six current-source FluidAudio fixture tests pass, including
cancellation and deadline termination. WhisperKit's reference implementation is
batch only; all 17 reference tests passed under network denial, including actual
tiny-model preparation and file inference. This is sample acceptance, not a broad
quality or performance result. Gemini dedicated transcription and Gemini 3.8
Live input transcription remain separate paths. Vendor calls are not accepted
on the strength of fixture tests.

Remote acceptance has an environment blocker: the checked Talkie credential
stores and environment did not provide readable Gemini or MAI credentials or a
MAI endpoint. The development ElevenLabs item was not readable noninteractively;
this is an access failure, not evidence that no key exists. No remote audio was
submitted during that probe. Full app validation used an isolated Termini header
packaging fix; the published dependency path remains unverified.

See [implementation evidence](../reports/transcription-implementation-progress.md)
for exact checks and superseded results. The sections below retain requirements
that still need final requirement-by-requirement reconciliation.

## Pre-existing integration evidence

Paths below are relative to the named checkout.

| Repository | Existing source | Consequence |
| --- | --- | --- |
| Hudson | `packages/native/apple/HudsonKit/Sources/HudsonUIAudio/HudAudioTranscriber.swift` | Apple Speech file transcription already has update/result types; keep a compatibility facade. |
| Hudson | `Package.swift` and `packages/native/apple/HudsonKit/Sources/HudsonVoice/HudDictation.swift` | Root manifest already links VoxCore, VoxEngine and VoxAppleSpeech into HudsonVoice. HudDictation captures audio and composes embedded Parakeet with Apple partials/fallback; preserve its callers and held-utterance queue. |
| Hudson | `packages/native/apple/HudsonKit/Sources/HudsonVoice/HudVoxLiveSession.swift` | Existing Vox WebSocket session is one implementation, not a universal provider contract. |
| Hudson | `packages/native/apple/HudsonKit/Sources/HudsonVoice/HudVoiceTypes.swift` | Reuse concepts for partials, final utterances, session state, and word timing. Audit naming and semantics before reusing concrete types. |
| Vox | `swift/Sources/VoxService/VoxRuntimeService.swift`, `transcribe.startSession` handler | Starts Vox's own microphone recorder. The existing Hudson session controls capture; it is not a caller-fed PCM adapter. |
| Hudson | `packages/native/apple/HudsonKit/Sources/HudsonUI/Vault/HudVault.swift` | Existing secret storage boundary; core transcription must not depend on settings UI. |
| Talkie | `apps/macos/TalkieEngineCore/Sources/TalkieEngineCore/EngineService.swift` | Hosts FluidAudio Parakeet and WhisperKit today. Preserve behavior during migration. |
| Talkie | `apps/macos/TalkieKit/Sources/TalkieKit/Meeting/MeetingAnnotation.swift` | Submit/result contract, provider job identity, billing and per-feed annotation provenance already exist. |
| Talkie | `apps/macos/TalkieKit/Sources/TalkieKit/Meeting/Annotation/AnnotationProviderFactory.swift` | ElevenLabs and Deepgram are concrete current meeting providers. Do not remove them. |
| Talkie | `apps/macos/TalkieKit/Sources/TalkieKit/Meeting/Streaming/MeetingStreamingTranscriptionSession.swift` | A session owns one connection; capture pacing, reconnect, rotation, joining, and durable storage belong to the coordinator. Preserve this boundary. |
| Talkie | `apps/macos/Talkie/Views/Settings/TranscriptionModelsSettingsView.swift` and `MeetingsSettingsView.swift` | Local model management and cloud meeting annotation are currently separate surfaces. |

## Required model targets

- Microsoft: `MAI-Transcribe-2` explicitly. Do not use MAI-Transcribe-1 or 1.5 as an implementation fallback.
- Gemini dedicated transcription: `gemini-3.5-transcribe` for files and `gemini-3.5-transcribe-live` for live input are the current dedicated family. Keep these explicit rather than silently replacing them with a conversational model.
- Gemini latest live: include `gemini-3.8-live` as an explicit evaluation target for live input transcription and voice interaction. Google documents input-audio transcription for this model. Evaluate it alongside dedicated Transcribe Live; do not exclude it merely because its primary purpose is conversation, or assume identical transcription capabilities.
- Recheck the official model catalog before implementation and live acceptance. Resolve and record the actual model used; do not silently downgrade if the configured model is unavailable. Keep model selection discoverable and updateable rather than permanently pinning a UI allowlist.

Source: [Google model catalog](https://ai.google.dev/gemini-api/docs/models), checked September 16, 2026.

## Provider evidence and resulting product constraints

**FluidAudio:** local Core ML transcription, streaming, VAD, and diarization. Its model registry config concerns downloads, not routing to arbitrary cloud providers. Use a direct optional dependency behind a Hudson adapter; do not add a Vox hop. Model-specific support must be checked against the dependency actually shipped. [Overview](https://github.com/FluidInference/FluidAudio#readme), [API](https://github.com/FluidInference/FluidAudio/blob/main/Documentation/API.md).

**MAI:** current Azure documentation describes MAI-Transcribe-2 in preview, with file transcription, word timing, and diarization. It warns of diarization failures on recordings around 15 minutes or longer. It separately documents Voice Live integration; that is a distinct implementation path and must not inherit file capabilities. Start with file transcription; leave live support unverified until its contract is checked and tested. [Microsoft documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe).

**Gemini files:** current dedicated transcription documentation supports speaker labels and word timings, limits annotated audio to 30 minutes, and calls attribution for three or more speakers experimental. Vocabulary hints conflict with those annotations; smart formatting also conflicts with them. Represent these as request constraints, not independent toggles. [Google file transcription](https://ai.google.dev/gemini-api/docs/transcribe).

**Gemini live:** separate live model and API; documented sessions last up to ten minutes. It provides interim and final utterances, but not live speaker diarization or word-level timing. Rotation needs explicit timeline continuity. [Google live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe).

**Gemini 3.8 Live:** the latest conversational Live model also exposes input-audio transcription, separately from transcripts of its generated speech. Its model-specific guidance requires audio response modality and permanently enables proactive audio. For a captions-only evaluation, verify response behavior, transcript completeness, finalization, latency, and billed usage; discarding generated audio does not establish that generation or its cost is disabled. Speaker labels and word timings are unverified for this path. Do not apply the dedicated Transcribe Live session limits to it. This is a documented integration candidate, not a tested replacement. [Model and migration details](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), [input and output transcription](https://ai.google.dev/gemini-api/docs/live-api/capabilities#audio-transcriptions).

These are documentation-derived capabilities. Credentials, account access, regional availability, exact request/response behavior, and quality on our recordings remain untested. Keep provider/model/API-version identifiers in run provenance and revalidate capabilities as implementations change. Do not make the provider catalog a static UI allowlist.

## Ownership and dependency direction

```text
Talkie: capture, recordings, meeting tracks, durable runs, consent, use-case defaults
                               |
Hudson: descriptors, request validation, jobs/sessions, results, setup presentation
           |                  |                   |                  |
     FluidAudio          MAI / Gemini       Custom vendor API    Custom local
     embedded            remote adapters    adapter              library/process
                                                                    |
                                                              Vox is one option
```

Implemented package split: a Foundation-based `HudsonTranscription` contract, separate adapter targets, and `HudsonTranscriptionUI` configuration fields. The complete shared settings flow remains a design target; current product orchestration lives in Talkie. No transcription dependency on TalkieKit; existing Talkie interfaces bridge into Hudson. No engine may own meeting persistence, select another provider, or decide to upload audio.

The root `Package.swift` is the Apple manifest; current platform minimums are iOS 26 and macOS 26, with Swift tools 5.9. HudsonVoice already embeds VoxEngine as well as offering daemon control. Add the new provider-neutral contract alongside it, with adapters depending inward on the contract. Keep HudDictation as a higher-level capture/coordinator facade, preserving its existing fallback policy and durable held utterances. Do not remove Vox dependencies or switch existing consumers in the contract change. Before adding another FluidAudio dependency, compare Talkie's shipped version with VoxEngine's dependency graph and choose one compatible resolution; do not load duplicate local runtimes for the same job. A direct adapter means no mandatory daemon hop, not an assumption that the current Hudson package is engine-free.

## Contract to implement

The following are semantic requirements, not frozen Swift signatures.

| Type | Required information |
| --- | --- |
| Provider descriptor | Stable provider ID; display name; adapter version; maintainer/origin; execution locality; supported platforms; configuration schema; model-discovery method. |
| Model descriptor | Stable upstream ID; display name; batch/live capabilities; languages; timing granularity; speaker support; input formats; context/session limits; feature-combination constraints; documentation and verification evidence. |
| Configuration | Non-secret provider/model selection and endpoint/region options; opaque credential reference; local model location/installation reference. No embedded secret values. |
| Readiness | Unconfigured, needs credential, needs download, preparing, ready, unavailable, or failed; actionable reason and last probe time. Separate this from compatibility and from live-test evidence. |
| Request | Audio file or streaming format; source identity; language hints; vocabulary hints; verbatim/clean style; desired timing and speaker features; deadline; caller-owned operation ID. |
| Compatibility result | Supported, unsupported, or unverified; machine-readable reasons and user-facing explanations. Evaluate the whole request, including duration and feature combinations. |
| Result | Transcript; optional timed segments and words; optional speaker references; language; completion status; provenance; optional provider usage/billing data. Missing confidence/timing/speaker fields stay missing. |
| Provenance | Provider/model/adapter version; configuration fingerprint without secrets; source digest; provider request ID when supplied; run and session identity; timestamp; native versus derived annotations. |

Capabilities are not a single Boolean set: a constraint evaluator validates combinations before preparation or upload. For example, a file model with speaker labels can still reject a long meeting. Unknown limits must not be interpreted as unlimited.

Expose model enumeration through the adapter, using an upstream catalog where available and versioned adapter metadata otherwise. Do not fabricate dynamic discovery for vendors that do not offer it. Existing saved identifiers round-trip even when temporarily absent from discovery; report unavailable rather than silently substituting a model.

### Batch jobs

1. Validate request and resolve configuration without sending audio.
2. Prepare local resources or validate credentials; report progress with no fabricated percentage.
3. Submit and return an operation handle. Local/synchronous implementations may complete immediately; asynchronous vendors preserve accepted job identity.
4. Observe progress and completion; support resuming polling only where the provider supports it.
5. Cancel local work or request remote cancellation where supported. Distinguish cancellation requested, cancelled, and remote outcome unknown.

An accepted remote job and its request ID must be handed to Talkie's persistence boundary promptly. A timeout after submission may already be billed; do not automatically resubmit without provider idempotency or a recoverable job ID. Retry policy belongs to the app coordinator, with adapter advice about retryability and delay.

### Live sessions

Open one session with an explicit PCM format. Send ordered, bounded chunks with backpressure. Emit provisional utterance revisions separately from finalized utterances; finalized utterances do not mean the session has finished. Finish input, drain within a deadline, then emit exactly one terminal result or error. Cancellation must release resources and reject late writes.

Events carry a sequence number, session identity, utterance identity, and audio-relative offsets when available. Do not invent word timestamps from wall-clock arrival. Session rotation preserves caller-owned source offsets; speaker IDs are scoped to a session/run unless a separate matching step establishes continuity. Audio loss or uncertain finalization becomes a visible incomplete result, not silent success.

### Local preparation and remote credentials

Local readiness distinguishes missing assets, preparation, ready, and failure.
Reuse the host’s existing SDK-backed installation and cache management; do not
introduce a second Parakeet downloader or repository manifest service. Adapter
preparation loads existing assets and returns needsDownload when they are absent.
Download cancellation and installation integrity remain responsibilities of the
existing installation path. Never uninstall a model in use. FluidAudio and
WhisperKit adapters share an in-memory resource owner per Talkie workspace; this
does not coordinate separate processes or legacy Vox model ownership.

Adapters receive credentials from an injected resolver. The host can back it with HudVault or its existing Keychain store; migration must not duplicate secrets into JSON. Endpoint changes invalidate credential checks and compatibility evidence. Network errors and raw provider payloads must be sanitized before logs or UI.

Remote use follows the app's explicit configured choice and existing upload consent. Do not add repeated permission prompts, silently fall back from local to remote, or send diagnostic audio during an ordinary readiness check. An explicit sample transcription is separate from a credential check.

### Extension boundary

Maintained and custom integrations use the same public interfaces and conformance fixtures. No provider-specific branches in the picker, result viewer, or coordinator.

First reference remote adapter: a separate example package wrapping ElevenLabs file transcription, reusing knowledge from the existing Talkie adapter but depending only on Hudson's public contract. This is a real vendor integration, not a fake endpoint, and can later be promoted to maintained status without changing its interface.

First reference local adapter: a separate example package wrapping WhisperKit file transcription, already used by Talkie. Start with batch capability only; publish streaming only after implementing and verifying its actual semantics. Vox is a further process/service example, not a prerequisite for this proof.

V1 registration is application composition with compiled adapter packages. Runtime installation of arbitrary executable plugins is a separate delivery/security decision, not implied by the word custom. Settings shows registered extensions and their setup; it must not show a nonfunctional Install plugin button. The example packages demonstrate source extensibility without changes to Hudson core.

Keep the current Vox capture-owning API separate from the new caller-fed audio contract. A future Vox adapter must implement file or PCM input explicitly before it can process Talkie-owned meeting tracks; starting a second microphone capture is not a valid bridge. Preserve existing Vox callers while introducing that boundary.

## Talkie settings and interaction brief

Audience: someone choosing how Talkie transcribes private audio, including users bringing their own API credentials and developers adding an engine. Mode: Operate. Preserve Talkie's native settings controls, compact typography, full-width separators, and existing theme tokens. This is an interaction wireframe, not an approved visual redesign.

```text
Transcription
Choose how Talkie turns audio into text.

DEFAULTS
Dictation                 [Current selection               v]
Recordings                [Current selection               v]
Meetings
  Live captions           [Current selection / Off         v]
  Final transcript        [Current selection               v]
  Speaker labels          [Off / Included / Separate step  v]

ENGINES
On this device
  Parakeet · FluidAudio    Model and readiness          [Manage]
  Whisper · Custom        Model and readiness          [Manage]
Cloud
  Microsoft MAI           Needs setup                  [Set up]
  Gemini                  Needs setup                  [Set up]
  ElevenLabs              Existing configuration       [Manage]
  Deepgram                Existing configuration       [Manage]

Developer integrations                                  [Guide]
```

Displayed rows are examples of registered adapters, not claims of current installation or a fixed catalog. Preserve the current selections on migration. MAI/Gemini appear as available only after their adapters ship; design previews clearly label simulated states.

A picker groups compatible models by locality. Incompatible options can be inspected with their specific reason but cannot be selected for an unsupported job. Unverified capabilities are not represented as ready. Setup-required compatible options lead to setup before enabling the default. A provider's account setup is shared even when file and live models differ.

Provider detail contains account/region or local model setup, model choice, supported use cases, test connection, and an explicit sample transcription action. Custom origin belongs in secondary metadata; it must not create a separate incompatible workflow. Keep exact API fields in advanced setup.

Meeting live captions are provisional. Final transcript processing can use a different configured provider and must retain its provenance. Speaker labels may be integrated or a separately selected local diarization step. A combined pipeline is ready only when alignment has been implemented and verified; do not imply that selecting two engines automatically composes them.

Before processing a recording, validate its duration and requested annotations. For an unsupported long meeting, explain the constraint and offer an explicitly chosen compatible engine or a verified alternate pipeline. Do not automatically chop audio and treat independent speaker IDs as the same person.

Settings state coverage: no registered adapters; missing credential; expired credential; model missing; downloading; unavailable platform; unsupported language; incompatible options; offline; rate limited; cancelled; remote outcome unknown; completed; incomplete audio; plugin unavailable after restart. Use keyboard-operable native controls and text explanations rather than color-only state.

## Three real use cases and proof

| Case | Input and expected behavior | Required evidence |
| --- | --- | --- |
| Dictation | A short push-to-talk recording; batch-on-release is valid and labeled honestly. A separate live path shows replaceable partials and one final utterance. | Captured audio, transcript, latency measurements, stop/cancel behavior, and no duplicate insertion. |
| Existing recording | A several-minute user-approved fixture with names and punctuation; compare MAI, Gemini, local FluidAudio and reference adapters. | Same input digest; exact options; output/provenance; measured time and vendor usage where supplied; human-checked errors. |
| Meeting | A short multi-speaker fixture plus a 45-minute fixture to exercise duration restrictions; preserve mic/system track origins. | Speaker/timing evaluation on supported paths; unsupported long input rejected before upload; no false speaker continuity or lost original recording. |

Do not choose a quality winner without measurements. Fixture tests prove decoding and lifecycle; credential checks prove access only; live audio proves that one request worked. Report these evidence levels separately.

## Implementation sequence and bounded delegation

1. Primary agent freezes contract semantics and reviews package boundaries. Preserve existing public APIs through bridging.
2. Implement contract and conformance fixtures with no provider requests. Verify normalization, option conflicts, cancellation, partial replacement, job recovery, and provenance.
3. Wrap current FluidAudio and existing cloud meeting paths incrementally; demonstrate no change to saved-recording behavior.
4. Implement MAI file and Gemini file adapters against current official contracts. Add Gemini live as a separate capability; investigate MAI live separately.
5. Build the remote and local reference packages without core modifications. Publish their code as case-study artifacts only after verification.
6. Wire Talkie defaults/setup and verify actual native settings on each supported platform. Add the Studio study before Swift polish; its route remains a follow-up, not a claimed existing surface.
7. Run user-approved live fixture comparisons and document observed limits, quality, latency, and cost.

Grok performs precisely specified labor: source inventories, repetitive fixture generation from sanitized examples, mechanical adapter scaffolding after signatures are frozen, and validation tables. The primary agent owns research, architecture, specification, code review, and outcome verification. No broad autonomous design assignment.

## Design acceptance and remaining decisions

This design is reviewable when the contract, ownership, settings flow, provider constraints, migration plan, and both reference cases are concrete. Production acceptance additionally requires compiled adapters, meaningful contract tests, native UI evidence, and live provider evidence; none are claimed here.

Before implementation, resolve the exact Swift package placement and deployment baselines, inspect the Vox wire contract if choosing that example, and verify provider upload retention/deletion and account availability. Costs are intentionally not hardcoded in this design. Core abstraction work does not depend on choosing a default cloud vendor.

## OpenRouter MAI route (user-directed follow-up)

OpenRouter's model page and live public transcription catalog confirm
`microsoft/mai-transcribe-2`. The existing secret-cli store includes
`OPENROUTER_API_KEY`, so this route does not require a separate Azure resource
key or Speech endpoint. The user subsequently authorized testing, and the
Swift adapter passed account-backed short-file acceptance on 2026-09-16.

The implemented MAI adapter selects a distinct OpenRouter wire client: POST JSON with base64 input_audio to
`https://openrouter.ai/api/v1/audio/transcriptions`, using Bearer authorization.
Use verbose_json and word timestamp granularities for timed output; Azure
diarization, phrase lists and style options are passed via provider.options.azure.
Preserve X-Generation-Id as the provider request ID and normalize returned usage.
Keep the routing service identity distinct from the underlying MAI model in
configuration, consent, and provenance. Reuse the existing contract, HTTP
transport, remote-operation lifecycle and schema-driven settings. No additional
shared-core or settings provider branches are needed. Talkie registers this
route as `openrouter-mai`, alongside the existing direct Azure route.

The public transcription catalog query returned MAI 2 and 1.5 but no Gemini
entry on this check; OpenRouter availability for Gemini is not established.
Sources: https://openrouter.ai/microsoft/mai-transcribe-2 and
https://openrouter.ai/docs/guides/overview/multimodal/stt .
