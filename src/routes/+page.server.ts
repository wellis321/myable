import { createPuzzle, getPuzzle, getStats } from '$lib/server/db';
import type { PageServerLoad } from './$types';

const COOKIE = 'numble_puzzle';

export const load: PageServerLoad = async ({ cookies }) => {
	const existingId = Number(cookies.get(COOKIE));
	let puzzle = Number.isInteger(existingId) && existingId > 0 ? await getPuzzle(existingId) : null;
	if (!puzzle) {
		puzzle = await createPuzzle();
		cookies.set(COOKIE, String(puzzle.id), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 60
		});
	}

	return {
		puzzle,
		stats: await getStats()
	};
};
