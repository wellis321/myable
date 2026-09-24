import { getStats, openCatalogPuzzle } from '$lib/server/db';
import { DIFFICULTIES, SIZES, type BoardSize, type Difficulty } from '$lib/puzzle';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const COOKIE = 'numble_puzzle';

export const load: PageServerLoad = async ({ params, cookies }) => {
	const size = Number(params.size) as BoardSize;
	const difficulty = params.difficulty as Difficulty;
	const sequence = Number(params.sequence);
	if (!SIZES.includes(size) || !DIFFICULTIES.includes(difficulty) || !Number.isInteger(sequence)) {
		throw error(404, 'That waffle is not in the set');
	}
	const opened = await openCatalogPuzzle(size, difficulty, sequence);
	cookies.set(COOKIE, String(opened.puzzle.id), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 60
	});
	return {
		puzzle: opened.puzzle,
		progress: opened.progress,
		catalog: opened.catalog,
		stats: await getStats()
	};
};
