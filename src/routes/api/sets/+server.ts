import { json, error } from '@sveltejs/kit';
import { replaceCatalog } from '$lib/server/db';
import { DIFFICULTIES, SIZES, type BoardSize, type Difficulty } from '$lib/puzzle';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const size = Number(body.size) as BoardSize;
	const difficulty = String(body.difficulty ?? '') as Difficulty;
	if (!SIZES.includes(size) || !DIFFICULTIES.includes(difficulty)) {
		throw error(400, 'Choose a size and a difficulty');
	}
	return json(await replaceCatalog(size, difficulty));
};
