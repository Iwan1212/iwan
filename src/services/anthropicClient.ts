// src/services/anthropicClient.ts — singleton Anthropic client
import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
