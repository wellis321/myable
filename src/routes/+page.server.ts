import { getCatalog, getStats } from '$lib/server/db';
import { DIFFICULTIES, SIZES, type BoardSize, type Difficulty } from '$lib/puzzle';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const sizeParam = Number(url.searchParams.get('size'));
	const difficultyParam = url.searchParams.get('difficulty') ?? 'medium';
	const size = SIZES.includes(sizeParam as BoardSize) ? (sizeParam as BoardSize) : 7;
	const difficulty = DIFFICULTIES.includes(difficultyParam as Difficulty)
		? (difficultyParam as Difficulty)
		: 'medium';
	return {
		size,
		difficulty,
		catalog: await getCatalog(size, difficulty),
		stats: await getStats()
	};
};
