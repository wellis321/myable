import { json, error } from '@sveltejs/kit';
import { recordPlay } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const puzzleId = Number(body.puzzleId);
	const swapsUsed = Number(body.swapsUsed);
	const board = body.board;
	if (!Number.isInteger(puzzleId) || !Array.isArray(board)) {
		throw error(400, 'Missing waffle result');
	}

	try {
		const result = await recordPlay(puzzleId, board, swapsUsed);
		return json(result);
	} catch (err) {
		throw error(400, err instanceof Error ? err.message : 'Could not save');
	}
};
