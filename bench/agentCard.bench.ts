import { bench, describe } from 'vitest';
import {
  AgentCardTrustVerifier,
  canonicalizeAgentCardPayload,
  canonicalizeJson,
} from '../src/panels/a2a/agentCardTrust';
import {
  resolveAgentCardDiscoveryUrl,
  validateAgentCardPayload,
  validateAgentCardText,
  validateAgentRegistryPayload,
} from '../src/panels/a2a/agentCardValidation';
import { agentCard, CARD_URL, signedEs256Card } from './fixtures';

const smallCard = agentCard(1);
const largeCard = agentCard(100);
const smallCardText = JSON.stringify(smallCard);
const largeCardText = JSON.stringify(largeCard, null, 2);
const invalidCardText = JSON.stringify({ ...smallCard, name: '', skills: 'not-an-array' });
const registry = Array.from({ length: 50 }, (_, index) => ({
  card: agentCard(5),
  lastSeen: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
  online: index % 3 !== 0,
}));

describe('agent card validation', () => {
  bench('validateAgentCardPayload (1 skill)', () => {
    validateAgentCardPayload(smallCard);
  });

  bench('validateAgentCardPayload (100 skills)', () => {
    validateAgentCardPayload(largeCard);
  });

  bench('validateAgentCardText (valid)', () => {
    validateAgentCardText(smallCardText);
  });

  bench('validateAgentCardText (100 skills, pretty-printed)', () => {
    validateAgentCardText(largeCardText);
  });

  bench('validateAgentCardText (invalid)', () => {
    validateAgentCardText(invalidCardText);
  });

  bench('validateAgentRegistryPayload (50 entries)', () => {
    validateAgentRegistryPayload(registry);
  });

  bench('resolveAgentCardDiscoveryUrl', () => {
    resolveAgentCardDiscoveryUrl('https://agent.example');
    resolveAgentCardDiscoveryUrl(CARD_URL);
  });
});

describe('agent card canonicalization', () => {
  bench('canonicalizeAgentCardPayload (1 skill)', () => {
    canonicalizeAgentCardPayload(smallCard);
  });

  bench('canonicalizeAgentCardPayload (100 skills)', () => {
    canonicalizeAgentCardPayload(largeCard);
  });

  bench('canonicalizeJson (100 skills)', () => {
    canonicalizeJson(largeCard);
  });
});

describe('agent card trust verification', () => {
  const signed = signedEs256Card(10);
  const verifier = new AgentCardTrustVerifier({
    jwksFetcher: () => Promise.resolve(signed.jwks),
  });

  bench('verify unsigned card', async () => {
    await verifier.verify(smallCard, { sourceUrl: CARD_URL });
  });

  bench('verify ES256-signed card (cached JWKS)', async () => {
    await verifier.verify(signed.card, { sourceUrl: CARD_URL });
  });
});
