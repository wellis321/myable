import mysql from 'mysql2/promise';
import { env } from '$env/dynamic/private';
import {
	generatePuzzle,
	starsFor,
	boardsMatch,
	type BoardSize,
	type Clue,
	type Difficulty,
	type GeneratedPuzzle
} from '$lib/puzzle';

export const CATALOG_COUNT = 50;

export type StoredPuzzle = GeneratedPuzzle & { id: number; sequence: number | null };

export type PuzzleProgress = { solved: boolean; stars: number } | null;

export type CatalogSlot = {
	sequence: number;
	id: number;
	solved: boolean;
	stars: number;
	attempted: boolean;
};

export type Stats = {
	played: number;
	solved: number;
	failed: number;
	currentStreak: number;
	bestStreak: number;
	totalStars: number;
	distribution: number[];
};

const pool = mysql.createPool({
	host: env.MYSQL_HOST ?? '127.0.0.1',
	port: Number(env.MYSQL_PORT ?? 8889),
	user: env.MYSQL_USER ?? 'root',
	password: env.MYSQL_PASSWORD ?? 'root',
	database: env.MYSQL_DATABASE ?? 'numble',
	waitForConnections: true,
	connectionLimit: 8
});

let ready: Promise<void> | null = null;

function ensureSchema() {
	ready ??= (async () => {
		await pool.query(`
			CREATE TABLE IF NOT EXISTS puzzles (
				id INT AUTO_INCREMENT PRIMARY KEY,
				solution JSON NOT NULL,
				start_board JSON NOT NULL,
				clues JSON NOT NULL,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			)
		`);
		await pool.query(`ALTER TABLE puzzles ADD COLUMN board_size INT NOT NULL DEFAULT 7`).catch(() => {});
		await pool.query(`ALTER TABLE puzzles ADD COLUMN difficulty VARCHAR(10) NOT NULL DEFAULT 'medium'`).catch(
			() => {}
		);
		await pool.query(`ALTER TABLE puzzles ADD COLUMN swap_limit INT NOT NULL DEFAULT 20`).catch(() => {});
		await pool.query(`ALTER TABLE puzzles ADD COLUMN min_swaps INT NOT NULL DEFAULT 15`).catch(() => {});
		await pool.query(`ALTER TABLE puzzles ADD COLUMN sequence_no INT NULL`).catch(() => {});
		await pool
			.query(`CREATE UNIQUE INDEX puzzles_catalog ON puzzles (board_size, difficulty, sequence_no)`)
			.catch(() => {});
		await pool.query(`
			CREATE TABLE IF NOT EXISTS plays (
				id INT AUTO_INCREMENT PRIMARY KEY,
				puzzle_id INT NOT NULL,
				solved TINYINT(1) NOT NULL,
				swaps_used INT NOT NULL,
				stars INT NOT NULL,
				played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				UNIQUE KEY puzzle_once (puzzle_id)
			)
		`);
	})();
	return ready;
}

function parseJson<T>(value: unknown): T {
	if (typeof value === 'string') return JSON.parse(value) as T;
	return value as T;
}

function rowToPuzzle(row: {
	id: number;
	solution: unknown;
	start_board: unknown;
	clues: unknown;
	board_size: number;
	difficulty: Difficulty;
	swap_limit: number;
	min_swaps: number;
	sequence_no?: number | null;
}): StoredPuzzle {
	return {
		id: row.id,
		size: (row.board_size || 7) as BoardSize,
		difficulty: row.difficulty || 'medium',
		swapLimit: row.swap_limit || 20,
		minSwaps: row.min_swaps || 15,
		sequence: row.sequence_no ?? null,
		solution: parseJson(row.solution),
		start: parseJson(row.start_board),
		clues: parseJson<Clue[]>(row.clues)
	};
}

export async function getPuzzle(id: number) {
	await ensureSchema();
	const [rows] = await pool.query(
		'SELECT id, solution, start_board, clues, board_size, difficulty, swap_limit, min_swaps, sequence_no FROM puzzles WHERE id = ?',
		[id]
	);
	const list = rows as {
		id: number;
		solution: unknown;
		start_board: unknown;
		clues: unknown;
		board_size: number;
		difficulty: Difficulty;
		swap_limit: number;
		min_swaps: number;
		sequence_no: number | null;
	}[];
	return list[0] ? rowToPuzzle(list[0]) : null;
}

export async function createPuzzle(size: BoardSize = 7, difficulty: Difficulty = 'medium') {
	await ensureSchema();
	const puzzle = generatePuzzle(size, difficulty);
	const [result] = await pool.query(
		'INSERT INTO puzzles (solution, start_board, clues, board_size, difficulty, swap_limit, min_swaps) VALUES (?, ?, ?, ?, ?, ?, ?)',
		[
			JSON.stringify(puzzle.solution),
			JSON.stringify(puzzle.start),
			JSON.stringify(puzzle.clues),
			puzzle.size,
			puzzle.difficulty,
			puzzle.swapLimit,
			puzzle.minSwaps
		]
	);
	const id = (result as { insertId: number }).insertId;
	return { id, sequence: null, ...puzzle };
}

export async function ensureCatalog(size: BoardSize, difficulty: Difficulty) {
	await ensureSchema();
	const [rows] = await pool.query(
		'SELECT sequence_no FROM puzzles WHERE board_size = ? AND difficulty = ? AND sequence_no IS NOT NULL',
		[size, difficulty]
	);
	const have = new Set((rows as { sequence_no: number }[]).map((row) => row.sequence_no));
	for (let sequence = 1; sequence <= CATALOG_COUNT; sequence++) {
		if (have.has(sequence)) continue;
		const puzzle = generatePuzzle(size, difficulty);
		await pool.query(
			`INSERT INTO puzzles (solution, start_board, clues, board_size, difficulty, swap_limit, min_swaps, sequence_no)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				JSON.stringify(puzzle.solution),
				JSON.stringify(puzzle.start),
				JSON.stringify(puzzle.clues),
				puzzle.size,
				puzzle.difficulty,
				puzzle.swapLimit,
				puzzle.minSwaps,
				sequence
			]
		);
	}
}

export async function getCatalog(size: BoardSize, difficulty: Difficulty): Promise<CatalogSlot[]> {
	await ensureCatalog(size, difficulty);
	const [rows] = await pool.query(
		`SELECT puzzles.sequence_no, puzzles.id, plays.solved, plays.stars
		 FROM puzzles
		 LEFT JOIN plays ON plays.puzzle_id = puzzles.id
		 WHERE puzzles.board_size = ? AND puzzles.difficulty = ? AND puzzles.sequence_no IS NOT NULL
		 ORDER BY puzzles.sequence_no`,
		[size, difficulty]
	);
	return (rows as { sequence_no: number; id: number; solved: number | null; stars: number | null }[]).map(
		(row) => ({
			sequence: row.sequence_no,
			id: row.id,
			solved: row.solved === 1,
			stars: row.stars ?? 0,
			attempted: row.solved !== null
		})
	);
}

export async function openCatalogPuzzle(size: BoardSize, difficulty: Difficulty, sequence?: number) {
	const catalog = await getCatalog(size, difficulty);
	const slot =
		catalog.find((item) => item.sequence === sequence) ??
		catalog.find((item) => !item.solved) ??
		catalog[0];
	const puzzle = await getPuzzle(slot.id);
	if (!puzzle) throw new Error('Missing waffle');
	return { puzzle, catalog, progress: slot.attempted ? { solved: slot.solved, stars: slot.stars } : null };
}

export async function clearPlay(puzzleId: number) {
	await ensureSchema();
	await pool.query('DELETE FROM plays WHERE puzzle_id = ?', [puzzleId]);
	return getStats();
}

export async function resetProgress(sizes: BoardSize[], difficulties: Difficulty[]) {
	await ensureSchema();
	if (sizes.length === 0 || difficulties.length === 0) return getStats();
	await pool.query(
		`DELETE plays FROM plays
		 INNER JOIN puzzles ON puzzles.id = plays.puzzle_id
		 WHERE puzzles.sequence_no IS NOT NULL
		 AND puzzles.board_size IN (?)
		 AND puzzles.difficulty IN (?)`,
		[sizes, difficulties]
	);
	return getStats();
}

export async function recordPlay(puzzleId: number, board: number[][], swapsUsed: number) {
	await ensureSchema();
	const puzzle = await getPuzzle(puzzleId);
	if (!puzzle) throw new Error('Unknown waffle');
	if (!Number.isInteger(swapsUsed) || swapsUsed < 0 || swapsUsed > puzzle.swapLimit) {
		throw new Error('That swap count is not allowed');
	}

	const solved = boardsMatch(board, puzzle.solution);
	const stars = starsFor(swapsUsed, solved, puzzle.swapLimit, puzzle.minSwaps);
	await pool.query(
		`INSERT INTO plays (puzzle_id, solved, swaps_used, stars)
		 VALUES (?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE
		   solved = IF(solved = 1, solved, VALUES(solved)),
		   stars = IF(solved = 1, stars, VALUES(stars)),
		   swaps_used = IF(solved = 1, swaps_used, VALUES(swaps_used))`,
		[puzzleId, solved ? 1 : 0, swapsUsed, stars]
	);
	return { solved, stars, stats: await getStats() };
}

export async function getStats(): Promise<Stats> {
	await ensureSchema();
	const [rows] = await pool.query(
		'SELECT solved, stars FROM plays ORDER BY id ASC'
	);
	const plays = rows as { solved: number; stars: number }[];
	const distribution = [0, 0, 0, 0, 0, 0];
	let solved = 0;
	let failed = 0;
	let totalStars = 0;
	let currentStreak = 0;
	let bestStreak = 0;

	for (const play of plays) {
		if (play.solved) {
			solved++;
			currentStreak++;
			bestStreak = Math.max(bestStreak, currentStreak);
			totalStars += play.stars;
			distribution[play.stars] = (distribution[play.stars] ?? 0) + 1;
		} else {
			failed++;
			currentStreak = 0;
		}
	}

	return {
		played: plays.length,
		solved,
		failed,
		currentStreak,
		bestStreak,
		totalStars,
		distribution
	};
}
