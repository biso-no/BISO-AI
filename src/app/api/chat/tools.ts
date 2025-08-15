import { tool } from 'ai';
import { z } from 'zod';
import { searchSharePoint, getDocumentStats, listSharePointSites } from './rag';

export const weather = tool({
	description: 'Get the weather in a location',
	inputSchema: z.object({
	  location: z.string().describe('The location to get the weather for'),
	}),
	execute: async ({ location }) => ({
	  location,
	  temperature: 72 + Math.floor(Math.random() * 21) - 10,
	}),
});

export const tools = {
	weather,
	searchSharePoint,
	getDocumentStats,
	listSharePointSites,
};


