import { streamText, convertToModelMessages, UIMessage } from 'ai';
import { openai, defaultModelName } from '@/app/lib/ai';
import { tools } from './tools';
import { prompt } from '@/app/lib/prompt';
import { getJwtSession } from '@/app/lib/appwrite';

//export const runtime = 'edge';

export const maxDuration = 30;

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
	const jwt = req.headers.get("x-appwrite-user-jwt") || req.headers.get("X-Appwrite-JWT");
	const session = await getJwtSession(jwt!);
	if (!session) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
		});
	}

	try {
		const { messages }: { messages: UIMessage[] } = await req.json();


        const result = streamText({
			model: openai('gpt-4o'),
			system: prompt,
			messages: convertToModelMessages(messages),
			tools,
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


