import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_SETTINGS_MAX_BYTES,
  importConversationSettingsFile,
  parseConversationSettingsDocument,
  sampleGPTLiveImportDocument,
  sampleGeminiImportDocument,
} from '../../conversation/import';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures are mutated at arbitrary depth to build invalid documents
const valid = () => JSON.parse(JSON.stringify(sampleGeminiImportDocument)) as Record<string, any>;

describe('conversation settings import', () => {
  it('imports the shipped sample documents and stages, never activates', () => {
    const gemini = parseConversationSettingsDocument(JSON.stringify(sampleGeminiImportDocument));
    expect(gemini.configuration.model).toBe('gemini-3.8-live-extended-thinking');
    expect(gemini.configuration.thinkingLevel).toBe('medium');
    expect(gemini.credentialReference).toBe('gemini-conversation-key');
    expect(gemini.credentialKind).toBe('apiKey');
    const gpt = parseConversationSettingsDocument(JSON.stringify(sampleGPTLiveImportDocument));
    expect(gpt.configuration.options?.delegationModel).toBe('gpt-5.2');
    expect(gpt.credentialKind).toBe('apiKey');
    // The staged value is plain data: no consent flag exists to manufacture.
    expect(Object.keys(gpt)).toEqual(['configuration', 'credentialReference', 'credentialKind']);
  });

  it('rejects wrong format and unsupported versions explicitly', () => {
    const wrongFormat = valid();
    wrongFormat.format = 'some-other-format';
    expect(() => parseConversationSettingsDocument(JSON.stringify(wrongFormat)))
      .toThrowError(/not a hudson-conversation-settings file/);
    const futureVersion = valid();
    futureVersion.version = 2;
    let versionError: unknown = null;
    try {
      parseConversationSettingsDocument(JSON.stringify(futureVersion));
    } catch (error) {
      versionError = error;
    }
    // Understood-but-unsupported classifies distinctly from malformed input.
    expect(versionError).toMatchObject({ code: 'unsupported' });
  });

  it('rejects unknown fields at every level instead of ignoring them', () => {
    const topLevel = valid();
    topLevel.consent = true;
    expect(() => parseConversationSettingsDocument(JSON.stringify(topLevel)))
      .toThrowError(/unknown field "consent"/);
    const nested = valid();
    nested.configuration.apiKey = 'oops';
    expect(() => parseConversationSettingsDocument(JSON.stringify(nested)))
      .toThrowError(/unknown field "apiKey"/);
  });

  it('rejects embedded secret-shaped values anywhere in the document', () => {
    const inReference = valid();
    inReference.credentialReference = 'sk-live-abcdef';
    expect(() => parseConversationSettingsDocument(JSON.stringify(inReference)))
      .toThrowError(/looks like a secret/);
    const inOptions = valid();
    inOptions.configuration.options = { delegationModel: 'AIzaSyExample' };
    expect(() => parseConversationSettingsDocument(JSON.stringify(inOptions)))
      .toThrowError(/looks like a secret/);
    const inInstructions = valid();
    inInstructions.configuration.instructions = 'Bearer abc.def';
    expect(() => parseConversationSettingsDocument(JSON.stringify(inInstructions)))
      .toThrowError(/looks like a secret/);
  });

  it('enforces the size bound and field bounds', async () => {
    const oversized = valid();
    oversized.configuration.instructions = 'a'.repeat(CONVERSATION_SETTINGS_MAX_BYTES);
    expect(() => parseConversationSettingsDocument(JSON.stringify(oversized)))
      .toThrowError(/limited to 65536 bytes/);
    await expect(importConversationSettingsFile({
      size: CONVERSATION_SETTINGS_MAX_BYTES + 1,
      text: async () => '{}',
    })).rejects.toThrowError(/limited to 65536 bytes/);
    const longVoice = valid();
    longVoice.configuration.voice = 'v'.repeat(129);
    expect(() => parseConversationSettingsDocument(JSON.stringify(longVoice)))
      .toThrowError(/exceeds 128 UTF-8 bytes/);
    // Bounds are UTF-8 bytes on both platforms: 43 four-byte scalars exceed
    // a 128-byte cap even though far fewer characters are present.
    const emojiVoice = valid();
    emojiVoice.configuration.voice = '\u{1F600}'.repeat(43);
    expect(() => parseConversationSettingsDocument(JSON.stringify(emojiVoice)))
      .toThrowError(/exceeds 128 UTF-8 bytes/);
  });

  it('allowlists options in version 1 and refuses authored delegation', () => {
    const unknownOption = valid();
    unknownOption.configuration.options = { note: 'hello' };
    expect(() => parseConversationSettingsDocument(JSON.stringify(unknownOption)))
      .toThrowError(/version 1 imports only delegationModel/);
    const authoredDelegation = valid();
    authoredDelegation.configuration.options = { delegation: '{"type":"responses"}' };
    expect(() => parseConversationSettingsDocument(JSON.stringify(authoredDelegation)))
      .toThrowError(/not importable in version 1/);
  });

  it('requires credentialReference and credentialKind to travel as a pair', () => {
    const referenceOnly = valid();
    delete referenceOnly.credentialKind;
    expect(() => parseConversationSettingsDocument(JSON.stringify(referenceOnly)))
      .toThrowError(/needs credentialKind/);
    const kindOnly = valid();
    delete kindOnly.credentialReference;
    expect(() => parseConversationSettingsDocument(JSON.stringify(kindOnly)))
      .toThrowError(/names no credential/);
    const neither = valid();
    delete neither.credentialReference;
    delete neither.credentialKind;
    const staged = parseConversationSettingsDocument(JSON.stringify(neither));
    expect(staged.credentialReference).toBeUndefined();
    expect(staged.credentialKind).toBeUndefined();
  });

  it('rejects malformed shapes and values with reasons', () => {
    expect(() => parseConversationSettingsDocument('not json')).toThrowError(/not valid JSON/);
    expect(() => parseConversationSettingsDocument('[1,2]')).toThrowError(/must be a JSON object/);
    const badRate = valid();
    badRate.configuration.inputSampleRate = 'fast';
    expect(() => parseConversationSettingsDocument(JSON.stringify(badRate)))
      .toThrowError(/integer between 1 and 384000/);
    const badLevel = valid();
    badLevel.configuration.thinkingLevel = 'MINIMAL';
    expect(() => parseConversationSettingsDocument(JSON.stringify(badLevel)))
      .toThrowError(/low, medium, or high/);
    const badKind = valid();
    badKind.credentialKind = 'password';
    expect(() => parseConversationSettingsDocument(JSON.stringify(badKind)))
      .toThrowError(/apiKey or ephemeralToken/);
  });

  it('applies the connectors own provider rules to combinations', () => {
    const thinkingOnBase = valid();
    thinkingOnBase.configuration.model = 'gemini-3.8-live';
    expect(() => parseConversationSettingsDocument(JSON.stringify(thinkingOnBase)))
      .toThrowError(/thinking level/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures are mutated at arbitrary depth to build invalid documents
    const wrongRate = JSON.parse(JSON.stringify(sampleGPTLiveImportDocument)) as Record<string, any>;
    wrongRate.configuration.inputSampleRate = 8_000;
    expect(() => parseConversationSettingsDocument(JSON.stringify(wrongRate)))
      .toThrowError(/24000 or 16000/);
    const unknownProvider = valid();
    unknownProvider.configuration.provider = 'someone-else';
    delete unknownProvider.configuration.thinkingLevel;
    expect(() => parseConversationSettingsDocument(JSON.stringify(unknownProvider)))
      .toThrowError(/Unknown conversation provider/);
  });

  it('is atomic: a failed import returns nothing and touches nothing', async () => {
    const before = { configuration: { provider: 'gemini-live-conversation' } };
    const snapshot = JSON.stringify(before);
    await expect(importConversationSettingsFile({
      text: async () => {
        throw new Error('disk error');
      },
    })).rejects.toThrowError(/could not be read/);
    expect(JSON.stringify(before)).toBe(snapshot);
    // Parsing throws before any value escapes; there is no partial result.
    let staged: unknown = null;
    try {
      staged = parseConversationSettingsDocument('{"format":"hudson-conversation-settings"}');
    } catch {
      // expected
    }
    expect(staged).toBeNull();
  });
});
