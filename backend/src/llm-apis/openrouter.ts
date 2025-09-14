import { models } from '@codebuff/common/old-constants'
import { getModelForAgent } from '@codebuff/common/util/get-model'
import { isExplicitlyDefinedModel } from '@codebuff/common/util/model-utils'
import { env } from '@codebuff/internal/env'
import { createOpenRouter } from '@codebuff/internal/openrouter-ai-sdk'

import type { Model } from '@codebuff/common/old-constants'

// Provider routing documentation: https://openrouter.ai/docs/features/provider-routing
const providerOrder = {
  [models.openrouter_claude_sonnet_4]: [
    'Google',
    'Anthropic',
    'Amazon Bedrock',
  ],
  [models.openrouter_claude_opus_4]: ['Google', 'Anthropic'],
} as const

export function openRouterLanguageModel(
  model: Model,
  agentId?: string,
  logprobs?: boolean,
) {
  if (env.CB_ENABLE_CUSTOM_MODELS) {
    if (!env.CB_KEY) {
      throw new Error('CB_KEY is required when custom models are enabled')
    }
    if (!env.CB_BASE_URL) {
      throw new Error('CB_BASE_URL is required when custom models are enabled')
    }
    const newModel = getModelForAgent(agentId)
    return createOpenRouter({
      apiKey: env.CB_KEY,
      baseURL: env.CB_BASE_URL,
      headers: {
        'HTTP-Referer': 'https://codebuff.com',
        'X-Title': 'Codebuff',
      },
    }).languageModel(newModel as Model, {
      usage: { include: true },
      ...(typeof logprobs !== 'undefined' ? { logprobs } : {}),
    })
  }
  const extraBody: Record<string, any> = {
    transforms: ['middle-out'],
  }

  // Set allow_fallbacks based on whether model is explicitly defined
  const isExplicitlyDefined = isExplicitlyDefinedModel(model)

  extraBody.provider = {
    order: providerOrder[model as keyof typeof providerOrder],
    allow_fallbacks: !isExplicitlyDefined,
  }

  return createOpenRouter({
    apiKey: env.OPEN_ROUTER_API_KEY,
    headers: {
      'HTTP-Referer': 'https://codebuff.com',
      'X-Title': 'Codebuff',
    },
    extraBody,
  }).languageModel(model, {
    usage: { include: true },
    ...(typeof logprobs !== 'undefined' ? { logprobs } : {}),
  })
}
