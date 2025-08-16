import { streamText, convertToModelMessages, UIMessage, stepCountIs } from 'ai';
import { openai, defaultModelName } from '@/app/lib/ai';
import { tools } from './tools';
import { prompt } from '@/app/lib/prompt';
import { getJwtSession } from '@/app/lib/appwrite';
import { headers } from 'next/headers';


export const maxDuration = 30;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Basic CORS preflight support for Flutter HTTP clients
export async function OPTIONS() {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		},
	});
}


type ChatRequest = {
    messages: any[];
    model?: string;
};

export async function POST(req: Request) {
	const jwt = (await headers()).get("x-appwrite-user-jwt") || (await headers()).get("X-Appwrite-JWT") || (await headers()).get("x-bisoai-session");
	const session = await getJwtSession(jwt!);
	if (!session) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
		});
	}

	try {
		const { messages }: { messages: UIMessage[] } = await req.json();

		console.log("Session: ", session);
		console.log("Messages: ", messages);
		console.log("Raw messages string: ", JSON.stringify(messages));

        const result = streamText({
			model: openai('gpt-5-mini'),
			system: prompt,
			messages: convertToModelMessages(messages),
			tools,
			stopWhen: stepCountIs(5),
		});
		const response = result.toUIMessageStreamResponse();
		console.log("response", response);
		return response;
	} catch (error: any) {
		return new Response(
			JSON.stringify({ error: error?.message ?? 'Unknown error' }),
			{
				status: 400,
				headers: {
					'content-type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			},
		);
	}
}


