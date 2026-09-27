import { ConfigService } from '@nestjs/config';
import { JevFieldDetectionService } from './jev-field-detection.service';
import { FIELD_CRITERIA } from './lib/detection-types';
import type { InputCandidate } from './lib/field-candidates';

export const candidate: InputCandidate = {
  id: 'input_0_0',
  page: 0,
  source: 'blank',
  label: 'Email',
  context: 'Email: ____',
  hint: 'text',
  required: false,
  x: 10,
  y: 20,
  width: 100,
  height: 20,
  fontSize: 14,
};

export function answerFor(id: string, choice = 'email', confidence = 0.95) {
  return {
    [`${id}_type`]: {
      type: 'choice',
      choice,
      confidence,
      probabilities: Object.fromEntries(
        Object.keys(FIELD_CRITERIA).map((key) => [
          key,
          key === choice
            ? 0.96
            : 0.04 / (Object.keys(FIELD_CRITERIA).length - 1),
        ]),
      ),
    },
    [`${id}_required`]: { type: 'noul', noul: 0.1 },
  };
}

describe('Jev input detection API', () => {
  let request: jest.SpyInstance;
  beforeEach(() => {
    request = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());
  const service = (extra = {}) =>
    new JevFieldDetectionService(
      new ConfigService({ TYPESAFE_API_KEY: 'test-key', ...extra }),
    );
  const response = (extra = {}) =>
    new Response(
      JSON.stringify({
        model: 'jev-1.13.0',
        usage: { input_tokens: 1500, output_tokens: 40 },
        answers: answerFor(candidate.id),
        ...extra,
      }),
      { headers: { 'x-request-id': 'req-1' } },
    );

  it('asks type and required together and computes input-only cost from reported usage', async () => {
    request.mockResolvedValue(response());
    const result = await service().evaluate([candidate], 0, 1000);
    expect(result.decisions[0]).toMatchObject({
      choice: 'email',
      accepted: true,
      requiredProbability: 0.1,
    });
    expect(result.attempt).toMatchObject({
      status: 'completed',
      inputTokens: 1500,
      outputTokens: 40,
      model: 'jev-1.13.0',
      inputUsdPerMillion: 0.042,
      outputUsdPerMillion: 0,
      requestId: 'req-1',
    });
    expect(result.attempt.estimatedCostUsd).toBeCloseTo(0.000063, 10);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(options.body);
    expect(Object.keys(body.questions)).toHaveLength(2);
    expect(body.state.candidates).toHaveLength(1);
    expect(body.questions[`${candidate.id}_type`].instructions).toContain(
      'candidates[0]',
    );
  });

  it('does not turn a low-confidence answer into a field', async () => {
    request.mockResolvedValue(
      response({ answers: answerFor(candidate.id, 'email', 0.4) }),
    );
    expect(
      (await service().evaluate([candidate], 0, 1000)).decisions[0].accepted,
    ).toBe(false);
  });

  it('leaves missing usage unknown, not free', async () => {
    request.mockResolvedValue(response({ usage: undefined }));
    expect(
      (await service().evaluate([candidate], 0, 1000)).attempt,
    ).toMatchObject({
      status: 'completed',
      inputTokens: null,
      estimatedCostUsd: null,
    });
  });

  it('does not silently apply old prices to an unknown model release', async () => {
    request.mockResolvedValue(response({ model: 'jev-future' }));
    expect(
      (await service().evaluate([candidate], 0, 1000)).attempt.estimatedCostUsd,
    ).toBeNull();
    request.mockResolvedValue(response({ model: 'jev-future' }));
    const priced = await service({
      TYPESAFE_INPUT_USD_PER_MILLION: '2',
      TYPESAFE_OUTPUT_USD_PER_MILLION: '3',
    }).evaluate([candidate], 0, 1000);
    expect(priced.attempt.estimatedCostUsd).toBeCloseTo(0.00312, 10);
  });

  it('records paid usage even when a response is malformed and discards all invalid field decisions', async () => {
    request.mockResolvedValue(
      response({
        answers: {
          ...answerFor(candidate.id),
          [`${candidate.id}_type`]: { type: 'choice', choice: 'arbitrary' },
        },
      }),
    );
    const result = await service().evaluate([candidate], 0, 1000);
    expect(result.decisions).toEqual([]);
    expect(result.attempt).toMatchObject({
      status: 'failed',
      errorCode: 'invalid_response',
      inputTokens: 1500,
    });
    expect(result.attempt.estimatedCostUsd).toBeCloseTo(0.000063, 10);
  });

  it('handles provider rejection without storing its body or automatically retrying', async () => {
    request.mockResolvedValue(
      new Response('secret document text', { status: 429 }),
    );
    const result = await service().evaluate([candidate], 0, 1000);
    expect(result.attempt).toMatchObject({
      errorCode: 'http_429',
      httpStatus: 429,
      estimatedCostUsd: null,
    });
    expect(JSON.stringify(result)).not.toContain('secret document');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('handles timeouts as an unknown-cost failed request', async () => {
    request.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    expect((await service().evaluate([candidate], 0, 1)).attempt).toMatchObject(
      { errorCode: 'timeout', estimatedCostUsd: null },
    );
  });
});
