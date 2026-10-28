# GPT-Live browser acceptance host

Run from the Hudson repository root with Bun. This is a loopback-only manual
check, not a deployment template. It uses the real Hudson WebRTC connector,
server session broker, event host, and local `count_words` dispatcher.

Store `OPENAI_API_KEY` securely. Select an account-accessible Responses backend
model for delegated reasoning; the example does not choose one automatically.
For a machine with the `secret` CLI:

```sh
GPT_LIVE_DELEGATION_MODEL='<your Responses model>' \
  secret run OPENAI_API_KEY -- bun docs/examples/conversational-voice/live-web/server.ts
```

Without `secret`, inject `OPENAI_API_KEY` through your normal secure environment
runner. Do not put the value in this directory, the browser, or a command argument.
Open `http://127.0.0.1:4318`. `HUDSON_VOICE_PORT` changes the port. Without both
server variables the page opens but connection is disabled; no provider call occurs.

1. Select **Refresh microphones** to grant permission and show device names, then choose a microphone. Select **Connect microphone**. The page shows the input actually in use. You can change the microphone during a session; a failed switch keeps the previous input.
2. Say: “Count the words in blue birds fly home, using your local tool, and
   tell me the result.” Observe the local-tool event and listen for the answer.
3. Ask for a longer answer. Select **Interrupt playback** while it is audible.
   Verify speech becomes inaudible immediately. This mutes local playback;
   independent delegated tool work continues.
4. Select **Resume playback**, then ask a follow-up. Verify the next response
   is audible. Provider interruptions also require explicit local resume.
5. Select **Stop**. Verify the microphone indicator ends and playback remains
   silent. Reconnect once to check that previous callbacks do not affect the new run.

The page closes each session after 90 seconds and the server permits at most
three exchange attempts per launch. Closing the page stops local capture.
Stop the server with Ctrl-C after testing. Do not treat these client limits as
an account billing cap or a deployment security boundary.

Record browser/platform, actual model, local tool invocation, audible output,
interruption, follow-up, and cleanup separately. A transcript or tool event is
not evidence that audio was heard. Logs remain in the page; the server prints
only exchange attempt/status, never provider credentials or audio.

Current verification: browser bundle and TypeScript checks passed; the page's
missing-credential state was inspected in the browser. HTTP checks verify foreign
origin rejection and no-credential refusal. Real GPT-Live WebSocket acceptance
using the same package passed separately with synthetic speech, a local tool,
returned audio, and provider-acknowledged close. This browser's actual WebRTC,
microphone, audible playback, and interruption checklist remains pending. See
the evidence report (internal local document).
