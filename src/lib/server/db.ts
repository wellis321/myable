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

export type StoredPuzzle = GeneratedPuzzle & { id: number };

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
}): StoredPuzzle {
	return {
		id: row.id,
		size: (row.board_size || 7) as BoardSize,
		difficulty: row.difficulty || 'medium',
		swapLimit: row.swap_limit || 20,
		minSwaps: row.min_swaps || 15,
		solution: parseJson(row.solution),
		start: parseJson(row.start_board),
		clues: parseJson<Clue[]>(row.clues)
	};
}

export async function getPuzzle(id: number) {
	await ensureSchema();
	const [rows] = await pool.query(
		'SELECT id, solution, start_board, clues, board_size, difficulty, swap_limit, min_swaps FROM puzzles WHERE id = ?',
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
	return { id, ...puzzle };
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
		 ON DUPLICATE KEY UPDATE puzzle_id = puzzle_id`,
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
