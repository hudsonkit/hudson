# OpenAI as a Hudson AI provider

Status as of 2026-11-27. This note covers three paths, all working: a pasted OpenAI API key, a ChatGPT plan through the Codex CLI, and a ChatGPT plan through Hudson's own **Continue with ChatGPT**. Section 4 is the research behind the third path.

## 1. OpenAI API key (works today)

1. Open **Hudson AI → Settings → Environment Credentials**.
2. Click the `OPENAI_API_KEY` chip, paste the key, and click **Save**. The key goes into the encrypted local vault (`.data/hudson-local-vault.json`), not into `.env.local`.
3. Under **Hudson Default** (or **Workspace Override**), set **AI Provider** to **OpenAI**. The model changes to `gpt-4o-mini`, and the model list shows only OpenAI models.
4. Chat from the console AI tab.

Server path: `apps/web/app/api/ai/chat` → Pi backend → provider `openai` with credential `OPENAI_API_KEY`.

The following fixes were needed to make this work end to end:

- **Provider/model pairing.** Changing the provider kept the old model, so OpenAI received `gemini-3-flash-preview`. Now a provider change resets the model to that provider's default (`withProviderDefaultModel`), and the model picker shows only the selected provider's models (`modelOptionsForProvider`). Both helpers are in `apps/web/app/lib/ai-models.ts`.
- **Same-tab settings sync.** The Hudson AI window and the shell each hold a `useAppSettings('hudson-ai')` copy. The shell's copy stayed stale, so the console kept sending the old provider. `usePersistentState` now adopts writes that another instance in the same tab makes to the same key (through `hudson:saved`).
- **Restore under StrictMode.** After a reload, the stored setting was overwritten with defaults. The cause: the restore guard was a ref, and the React 19 StrictMode double render kept the ref but dropped the restored value. The guard is now state. This bug affected every `usePersistentState` value in dev, not only AI settings.

## 2. ChatGPT plan through Codex (works today, local Hudson only)

Hudson does not run its own ChatGPT sign-in. It uses the Codex CLI on the same machine, which is already signed in to the user's ChatGPT plan. OpenAI documents Codex app-server as a supported way for an app to use a ChatGPT plan ([Codex app-server route](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)).

1. Install the Codex CLI and run `codex login` (choose ChatGPT).
2. Open **Hudson AI → Settings**. Under **Hudson Default**, set **AI Provider** to **Codex (ChatGPT plan)**. The model list shows the models Codex reports for that account.
3. Chat from the console AI tab.

How it works:

- `/api/ai/models` asks Codex for its model list. If Codex is not installed or returns no models, the provider is not listed. The hosted site has no Codex, so it never shows the provider.
- `/api/ai/chat` sends `provider: "codex"` to `apps/web/app/api/ai/codex.ts`. That module runs one Codex turn through the Scout backend (`@hudsonkit/ai/scout`) and returns the reply as a UI message stream. Earlier messages are added to the prompt as a transcript.
- **Sandbox.** agent-sessions starts Codex with full machine access and no approval prompts by default. Hudson starts Codex itself instead, with `sandbox: "read-only"` and `approvalPolicy: "never"`, in the empty folder `~/.hudson/codex-chat`. A turn can read files but cannot write them. A request to write a file fails with "the filesystem is read-only".

Limits:

- Hudson's app tools do not run in a Codex turn. Codex gets Hudson's system prompt only.
- The reply arrives whole, not token by token. A cold turn takes about 4–5 seconds.
- The read-only sandbox still lets Codex read files on the machine.

## 3. Continue with ChatGPT (works today, local Hudson only)

Hudson signs in to the user's ChatGPT plan itself, through OpenAI's official **Sign in with ChatGPT** flow (section 4). Unlike the Codex path, replies stream token by token and Hudson's tools run.

1. Open **Hudson AI → Settings → Environment Credentials** and click **Continue with ChatGPT**.
2. In the OpenAI tab that opens ("Use ChatGPT to sign in to Hudson"), choose an account and approve. The tab comes back to `127.0.0.1:1455` and the card changes to **Using your ChatGPT plan**. The sign-in times out after 10 minutes; click the button again to retry.
3. Under **Hudson Default**, set **AI Provider** to **ChatGPT plan**. The model list shows the account's models that pi-ai can route.
4. Chat from the console AI tab.

The card also has **Manage usage** (ChatGPT's per-app usage page) and **Sign out**. Sign out revokes the refresh token at OpenAI and deletes it locally. If OpenAI does not confirm the revocation, the card says so and points to ChatGPT settings.

How it works:

- **Flow.** pi-ai (1.5.2 or later) implements SIWC: dynamic client registration, PKCE, the `127.0.0.1:1455` loopback callback and `chatgpt.tokens.use.direct`. `apps/web/app/api/ai/chatgpt.ts` drives it through `openaiProvider().auth.oauth` with `agentName: "Hudson"` and a stable per-install device ID.
- **Routes.** `/api/ai/chatgpt`: `GET` status, `POST` start, `DELETE` sign out (`?cancel=1` cancels a pending sign-in). All reject non-local requests.
- **Storage.** The credential is a sealed file, `.data/hudson-chatgpt-credential.sealed.json`, encrypted with the local vault's key (AES-256-GCM, mode 0600). It is kept apart from the vault so it never reaches `process.env` or the Environment editor. The device ID is in `hudson-chatgpt-device.sealed.json`.
- **Tokens.** A request with an expired access token refreshes it first. Refreshes run one at a time because each one rotates the refresh token. If OpenAI rejects the refresh token, Hudson deletes the credential and asks the user to sign in again.
- **Chat.** `/api/ai/chat` with `provider: "chatgpt"` passes the access token to pi-ai's `openai` provider. pi-ai detects a ChatGPT token (not an `sk-` key) and sends the request in plan mode, dropping the parameters SIWC does not accept.
- **Models.** `/api/ai/models` lists the provider only when the user is signed in. It reads `GET /v1/models` with the user's token and keeps `visibility == "list"` entries that are in pi-ai's OpenAI registry.

Verified on 2026-11-27 with a real account: sign-in, a streamed reply, a tool call (`set_shell_setting` switched the shell to dark mode), and sign-out with revocation.

## 4. Sign in with ChatGPT: what OpenAI supports

OpenAI ships an official program for this: **Sign in with ChatGPT (SIWC)** with **ChatGPT plan usage** ([docs](https://developers.openai.com/siwc), [quickstart](https://developers.openai.com/siwc/quickstart), [help center](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites), [user page](https://learn.chatgpt.com/docs/sign-in-with-chatgpt)). It was expanded at DevDay 2026 ([The New Stack](https://thenewstack.io/sign-in-with-chatgpt/)).

**Who may use it**

- Plan usage is documented for **open-source apps and personal projects that run locally**, and for selected private clients ([overview](https://developers.openai.com/siwc/token-sharing-open-source), [cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)). Hudson is public under Apache-2.0, so local Hudson fits.
- **Paid or remotely hosted apps** must fill in the [interest form](https://openai.com/form/sign-in-with-chatgpt-interest/) and wait for approval. The hosted site, **app.hudsonkit.com**, is not covered today.
- A single-user self-hosted VM is supported: you sign in locally and copy the credential file to the VM ([self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)). Multi-tenant hosting is not covered.
- Users: eligible Plus and Pro subscribers per the developer docs. The help center also lists Go and Business. Plus users share one 5-hour limit across all apps. Users can cap usage per app in ChatGPT Settings → Usage.

**How it works**

| Step | Details |
|---|---|
| Registration | Dynamic, with no client secret and no API key. The first authorize request uses `client_id=dynamic_agent_client` plus `agent_name_hint`. The callback returns an issued `client_id` (`oaiapp_…`), which the app stores and reuses. Each install has a stable `ext_agent_host_id`. |
| Authorize | `https://auth.openai.com/api/accounts/authorize`, PKCE S256, scopes `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, `resource=https://api.openai.com/v1` |
| Redirect URI | Loopback on `http://127.0.0.1:<port>/auth/callback`. The docs say not to use `localhost`. The listener must start before the browser opens. |
| Tokens | Access tokens last 1 hour. Refresh tokens last 30 days and rotate on each refresh, so refreshes must be serialized. Revoke on sign-out. |
| Inference | `POST https://api.openai.com/v1/responses` with `Authorization: Bearer <access token>`. Every request needs `store=false` and `stream=true`. A request counts as successful only after `response.completed`. Get models from `GET /v1/models` and keep entries with `visibility == "list"`. |
| Limits | Function and custom tools are supported. Image generation, file search, code interpreter, computer use, and hosted MCP are not. Omit `temperature`, `max_output_tokens`, and `previous_response_id`. Send `instructions`, not system messages ([preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)). |
| Storage | Tokens must live in protected local or self-hosted runtime storage. Never put them in browser storage, logs, or URLs. |

**What is not allowed, or not documented**

- No OpenAI page grants permission to reuse **Codex CLI's** login (`client_id app_EMoamEEZ73f0CkXaXp7hrann`) or to call `chatgpt.com/backend-api`. The inference docs say not to point requests at backend-api endpoints. The supported route is the app's own SIWC registration.
- Hudson's current `openai-codex` provider does exactly that. `@earendil-works/pi-ai` 0.85.1 (`dist/auth/oauth/openai-codex.js`) logs in with Codex CLI's client ID on `localhost:1455` and calls `chatgpt.com/backend-api`. pi-ai 1.x adds the SIWC flow, which section 3 uses; the `openai-codex` path is still there.

## Recommendation

1. **API key**: done and verified (section 1).
2. **ChatGPT plan, local Hudson**: prefer **Continue with ChatGPT** (section 3). It streams and runs Hudson's tools. Keep the Codex path (section 2) for users who already use Codex and want no extra sign-in.
3. **Do not offer ChatGPT sign-in on app.hudsonkit.com** until OpenAI approves an interest-form application. Production keeps Workers AI. The hosted site has no server routes, so the card does not render there.
4. **Retire or relabel the `openai-codex` path**, which relies on Codex CLI's client ID. Also note: the Pi backend maps provider `copilot` to `openai-codex` (`packages/web/ai-backends/src/adapters/pi-ai.ts:normalizeProvider`). With no Codex login, Copilot fails with `No API key for provider "openai-codex"`. This predates the pi-ai upgrade.
