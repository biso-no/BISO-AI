import { z } from 'zod';
import { createIndexingService } from '@/app/lib/indexing-service';

//export const runtime = 'nodejs';

const IndexRequestSchema = z.object({
	siteId: z.string().min(1),
	folderPath: z.string().default('/'),
	recursive: z.boolean().default(true),
});

export async function POST(req: Request) {
	try {
		const json = await req.json();
		const { siteId, folderPath, recursive } = IndexRequestSchema.parse(json);

		const indexingService = await createIndexingService();
		const jobId = await indexingService.startIndexing({ siteId, folderPath, recursive });

		return new Response(
			JSON.stringify({ ok: true, jobId }),
			{
				status: 202,
				headers: {
					'content-type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			},
		);
	} catch (err: any) {
		return new Response(
			JSON.stringify({ error: err?.message ?? 'Invalid request' }),
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


