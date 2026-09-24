import { json, error } from '@sveltejs/kit';
import { createPuzzle, getStats } from '$lib/server/db';
import { DIFFICULTIES, SIZES, type BoardSize, type Difficulty } from '$lib/puzzle';
import type { RequestHandler } from './$types';

const COOKIE = 'numble_puzzle';

export const POST: RequestHandler = async ({ cookies, request }) => {
	const body = await request.json().catch(() => ({}));
	const size = Number(body.size) as BoardSize;
	const difficulty = String(body.difficulty ?? 'medium') as Difficulty;
	if (!SIZES.includes(size) || !DIFFICULTIES.includes(difficulty)) {
		throw error(400, 'Choose a size and a difficulty');
	}
	const puzzle = await createPuzzle(size, difficulty);
	cookies.set(COOKIE, String(puzzle.id), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 60
	});
	return json({ puzzle, stats: await getStats() });
};
