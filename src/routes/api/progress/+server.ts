import { json, error } from '@sveltejs/kit';
import { clearPlay, getCatalog, resetProgress } from '$lib/server/db';
import { DIFFICULTIES, SIZES, type BoardSize, type Difficulty } from '$lib/puzzle';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	if (body.puzzleId != null) {
		const puzzleId = Number(body.puzzleId);
		if (!Number.isInteger(puzzleId)) throw error(400, 'Missing waffle');
		const stats = await clearPlay(puzzleId);
		return json({ stats });
	}

	const sizes = (Array.isArray(body.sizes) ? body.sizes : []).filter((size: number) =>
		SIZES.includes(size as BoardSize)
	) as BoardSize[];
	const difficulties = (Array.isArray(body.difficulties) ? body.difficulties : []).filter((level: string) =>
		DIFFICULTIES.includes(level as Difficulty)
	) as Difficulty[];
	if (sizes.length === 0 || difficulties.length === 0) {
		throw error(400, 'Choose a size and a difficulty to reset');
	}
	const stats = await resetProgress(sizes, difficulties);
	const size = SIZES.includes(body.catalogSize) ? (body.catalogSize as BoardSize) : sizes[0];
	const difficulty = DIFFICULTIES.includes(body.catalogDifficulty)
		? (body.catalogDifficulty as Difficulty)
		: difficulties[0];
	return json({ stats, catalog: await getCatalog(size, difficulty) });
};
