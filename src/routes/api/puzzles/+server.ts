import { json, error } from '@sveltejs/kit';
import { CATALOG_COUNT, getStats, openCatalogPuzzle } from '$lib/server/db';
import { DIFFICULTIES, SIZES, type BoardSize, type Difficulty } from '$lib/puzzle';
import type { RequestHandler } from './$types';

const COOKIE = 'numble_puzzle';

export const POST: RequestHandler = async ({ cookies, request }) => {
	const body = await request.json().catch(() => ({}));
	const size = Number(body.size) as BoardSize;
	const difficulty = String(body.difficulty ?? 'medium') as Difficulty;
	const sequence = body.sequence == null ? undefined : Number(body.sequence);
	if (!SIZES.includes(size) || !DIFFICULTIES.includes(difficulty)) {
		throw error(400, 'Choose a size and a difficulty');
	}
	if (sequence !== undefined && (!Number.isInteger(sequence) || sequence < 1 || sequence > CATALOG_COUNT)) {
		throw error(400, 'That waffle is not in the set');
	}
	const opened = await openCatalogPuzzle(size, difficulty, sequence);
	cookies.set(COOKIE, String(opened.puzzle.id), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 60
	});
	return json({ ...opened, stats: await getStats() });
};
