import { createOpenAI } from '@ai-sdk/openai';

export const openai = createOpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export const defaultModelName = process.env.OPENAI_MODEL || 'gpt-5-mini';


