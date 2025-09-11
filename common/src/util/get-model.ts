import { AGENT_IDS, AGENT_PERSONAS } from '../constants/agents'
import { env } from '@codebuff/internal/env'

const DEFAULT_MODEL = 'openrouter/anthropic/claude-3.5-sonnet'

function getAgentType(agentId: string): keyof typeof AGENT_PERSONAS | undefined {
  const parts = agentId.split('/')
  if (parts.length < 2) {
    return undefined
  }
  const typePart = parts[1].split('-')[0] as keyof typeof AGENT_PERSONAS
  if (AGENT_IDS.includes(typePart)) {
    return typePart
  }
  return undefined
}

export function getModelForAgent(agentId?: string): string {
  const modelStr = env.CB_MODEL
  if (!modelStr) {
    return DEFAULT_MODEL
  }

  const models = modelStr.split(';').filter(Boolean)
  if (models.length === 0) {
    return DEFAULT_MODEL
  }
  const defaultModel = models[0]

  if (!agentId) {
    return defaultModel
  }

  const agentType = getAgentType(agentId)
  if (!agentType) {
    return defaultModel
  }

  const agentIndex = AGENT_IDS.indexOf(agentType)
  if (agentIndex !== -1 && agentIndex < models.length) {
    return models[agentIndex]
  }

  return defaultModel
}
