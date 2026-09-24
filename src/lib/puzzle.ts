export const SIZES = [5, 7, 9] as const;
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export type BoardSize = (typeof SIZES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];

export type PuzzleRules = {
	size: BoardSize;
	difficulty: Difficulty;
	minSwaps: number;
	swapLimit: number;
};

export type Direction = 'up' | 'down' | 'left' | 'right';

export type Clue = {
	row: number;
	col: number;
	sum: number;
	a: Direction;
	b: Direction;
};

export type GeneratedPuzzle = PuzzleRules & {
	solution: number[][];
	start: number[][];
	clues: Clue[];
};

export function rulesFor(size: BoardSize, difficulty: Difficulty): PuzzleRules {
	const fullCount = (size + 1) / 2;
	const tiles = fullCount * size + ((size - 1) / 2) * fullCount;
	const kept = difficulty === 'easy' ? 0.55 : difficulty === 'hard' ? 0.18 : 0.28;
	const slack = difficulty === 'easy' ? 6 : difficulty === 'hard' ? 2 : 5;
	const greens = Math.max(size === 5 ? 4 : 8, Math.round(tiles * kept));
	let minSwaps = Math.max(4, Math.floor((tiles - greens) / 2));
	if (size >= 9 && difficulty === 'hard') minSwaps = Math.min(minSwaps, 20);
	return { size, difficulty, minSwaps, swapLimit: minSwaps + slack };
}

function fullLines(size: number) {
	return Array.from({ length: size }, (_, i) => i).filter((i) => i % 2 === 0);
}

function holeLines(size: number) {
	return Array.from({ length: size }, (_, i) => i).filter((i) => i % 2 === 1);
}

function numbers(size: number) {
	return Array.from({ length: size }, (_, i) => i + 1);
}

const DELTA: Record<Direction, [number, number]> = {
	up: [-1, 0],
	down: [1, 0],
	left: [0, -1],
	right: [0, 1]
};

const CORNERS: [Direction, Direction][] = [
	['up', 'left'],
	['up', 'right'],
	['down', 'left'],
	['down', 'right']
];

export function isHole(row: number, col: number) {
	return row % 2 === 1 && col % 2 === 1;
}

export function isTile(row: number, col: number, size = 7) {
	return row >= 0 && col >= 0 && row < size && col < size && !isHole(row, col);
}

function shuffle<T>(items: T[]): T[] {
	const copy = items.slice();
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

function emptyGrid(size: number) {
	return Array.from({ length: size }, () => Array(size).fill(0));
}

function cloneGrid(grid: number[][]) {
	return grid.map((row) => row.slice());
}

export function generateSolution(size: BoardSize): number[][] {
	const rows = fullLines(size);
	const cols = holeLines(size);
	const digits = numbers(size);
	for (let attempt = 0; attempt < 8000; attempt++) {
		const grid = emptyGrid(size);
		for (const row of rows) {
			const perm = shuffle(digits);
			for (let col = 0; col < size; col++) grid[row][col] = perm[col];
		}

		let columnsOk = true;
		for (const col of rows) {
			const seen = new Set(rows.map((row) => grid[row][col]));
			if (seen.size < rows.length) {
				columnsOk = false;
				break;
			}
		}
		if (!columnsOk) continue;

		for (const col of rows) {
			const used = new Set(rows.map((row) => grid[row][col]));
			const missing = shuffle(digits.filter((n) => !used.has(n)));
			cols.forEach((row, index) => {
				grid[row][col] = missing[index];
			});
		}

		return grid;
	}

	throw new Error('Could not build a waffle');
}

function scramble(solution: number[][], pairCount: number): number[][] {
	const size = solution.length;
	const tiles: [number, number][] = [];
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (isTile(row, col, size)) tiles.push([row, col]);
		}
	}

	for (let attempt = 0; attempt < 300; attempt++) {
		const order = shuffle(tiles);
		const start = cloneGrid(solution);
		const used = new Set<string>();
		let pairs = 0;

		for (const [r1, c1] of order) {
			if (pairs === pairCount) break;
			const key1 = `${r1},${c1}`;
			if (used.has(key1)) continue;
			const partner = order.find(([r, c]) => {
				const key = `${r},${c}`;
				return key !== key1 && !used.has(key) && solution[r][c] !== solution[r1][c1];
			});
			if (!partner) continue;
			const [r2, c2] = partner;
			used.add(key1);
			used.add(`${r2},${c2}`);
			[start[r1][c1], start[r2][c2]] = [start[r2][c2], start[r1][c1]];
			pairs++;
		}

		if (pairs === pairCount && displacedCount(start, solution) === pairCount * 2) return start;
	}

	throw new Error('Could not shuffle the waffle');
}

function clueSum(solution: number[][], clue: Clue) {
	const [dr1, dc1] = DELTA[clue.a];
	const [dr2, dc2] = DELTA[clue.b];
	return solution[clue.row + dr1][clue.col + dc1] + solution[clue.row + dr2][clue.col + dc2];
}

function randomClues(solution: number[][], difficulty: Difficulty): Clue[] {
	const size = solution.length;
	const mid = size + 1;
	const clues: Clue[] = [];
	for (const row of holeLines(size)) {
		for (const col of holeLines(size)) {
			const ranked = CORNERS.map(([a, b]) => {
				const clue: Clue = { row, col, sum: 0, a, b };
				clue.sum = clueSum(solution, clue);
				return clue;
			}).sort((left, right) => Math.abs(right.sum - mid) - Math.abs(left.sum - mid));
			const clue =
				difficulty === 'easy'
					? ranked[0]
					: difficulty === 'hard'
						? ranked[ranked.length - 1]
						: ranked[Math.floor(Math.random() * ranked.length)];
			clues.push(clue);
		}
	}
	return clues;
}

function digitCounts(grid: number[][]) {
	const size = grid.length;
	const counts = Array(size + 1).fill(0);
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (isTile(row, col, size)) counts[grid[row][col]]++;
		}
	}
	return counts;
}

function bitCount(mask: number) {
	let count = 0;
	while (mask) {
		mask &= mask - 1;
		count++;
	}
	return count;
}

function lowestBit(mask: number) {
	return mask & -mask;
}

/** How many grids fit the opening greens, the grey "not this" marks, and the clues. */
export function countSolutions(start: number[][], solution: number[][], clues: Clue[], limit = 2) {
	const size = start.length;
	const cells: [number, number][] = [];
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (isTile(row, col, size)) cells.push([row, col]);
		}
	}

	const counts = digitCounts(start);
	let full = 0;
	for (let n = 1; n <= size; n++) full |= 1 << n;
	const domain = cells.map(([row, col]) => {
		const fixed = start[row][col] === solution[row][col];
		if (fixed) return 1 << start[row][col];
		return full ^ (1 << start[row][col]);
	});

	const cluePairs = clues.map((clue) => {
		const [first, second] = [
			[clue.row + DELTA[clue.a][0], clue.col + DELTA[clue.a][1]],
			[clue.row + DELTA[clue.b][0], clue.col + DELTA[clue.b][1]]
		];
		return {
			sum: clue.sum,
			i: cells.findIndex(([r, c]) => r === first[0] && c === first[1]),
			j: cells.findIndex(([r, c]) => r === second[0] && c === second[1])
		};
	});

	const peers: number[][] = cells.map(([row, col]) => {
		const list: number[] = [];
		cells.forEach(([r, c], index) => {
			if (r === row && c === col) return;
			if (r === row && row % 2 === 0) list.push(index);
			else if (c === col && col % 2 === 0) list.push(index);
		});
		return list;
	});

	let found = 0;

	function propagate(dom: number[], left: number[], placed: boolean[]) {
		const queue: number[] = [];
		for (let i = 0; i < dom.length; i++) {
			if (bitCount(dom[i]) === 1 && !placed[i]) queue.push(i);
		}

		while (queue.length) {
			const index = queue.pop()!;
			if (placed[index]) continue;
			if (bitCount(dom[index]) !== 1) continue;
			const value = Math.log2(dom[index]);
			if (left[value] <= 0) return false;
			placed[index] = true;
			left[value]--;

			const bit = 1 << value;
			const strip = (cell: number) => {
				if (placed[cell] || (dom[cell] & bit) === 0) return true;
				dom[cell] ^= bit;
				if (dom[cell] === 0) return false;
				if (bitCount(dom[cell]) === 1) queue.push(cell);
				return true;
			};

			for (const peer of peers[index]) {
				if (!strip(peer)) return false;
			}
			if (left[value] === 0) {
				for (let cell = 0; cell < dom.length; cell++) {
					if (!strip(cell)) return false;
				}
			}

			for (const pair of cluePairs) {
				if (pair.i !== index && pair.j !== index) continue;
				const other = pair.i === index ? pair.j : pair.i;
				const need = pair.sum - value;
				if (need < 1 || need > size) return false;
				const needBit = 1 << need;
				if (placed[other]) {
					if (dom[other] !== needBit) return false;
					continue;
				}
				dom[other] &= needBit;
				if (dom[other] === 0) return false;
				if (bitCount(dom[other]) === 1) queue.push(other);
			}
		}

		return left.every((count, n) => n === 0 || count >= 0);
	}

	function search(dom: number[], left: number[], placed: boolean[]): boolean {
		if (found >= limit) return true;
		if (!propagate(dom, left, placed)) return false;

		let pick = -1;
		let best = 99;
		for (let i = 0; i < dom.length; i++) {
			if (placed[i]) continue;
			const size = bitCount(dom[i]);
			if (size < best) {
				best = size;
				pick = i;
			}
		}

		if (pick === -1) {
			found++;
			return found >= limit;
		}

		let mask = dom[pick];
		while (mask) {
			const bit = lowestBit(mask);
			mask ^= bit;
			const nextDom = dom.slice();
			const nextLeft = left.slice();
			const nextPlaced = placed.slice();
			nextDom[pick] = bit;
			if (search(nextDom, nextLeft, nextPlaced)) return true;
		}
		return false;
	}

	search(
		domain,
		counts.slice(),
		cells.map(() => false)
	);
	return found;
}

function displacedCount(start: number[][], solution: number[][]) {
	const size = start.length;
	let wrong = 0;
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (isTile(row, col, size) && start[row][col] !== solution[row][col]) wrong++;
		}
	}
	return wrong;
}

export function generatePuzzle(size: BoardSize = 7, difficulty: Difficulty = 'medium'): GeneratedPuzzle {
	const rules = rulesFor(size, difficulty);
	for (let attempt = 0; attempt < 40; attempt++) {
		const solution = generateSolution(size);
		const start = scramble(solution, rules.minSwaps);

		for (let clueTry = 0; clueTry < 5; clueTry++) {
			const clueStyle = attempt > 8 && difficulty === 'hard' ? 'medium' : difficulty;
			const clues = randomClues(solution, clueStyle);
			if (countSolutions(start, solution, clues, 2) === 1) {
				return { ...rules, solution, start, clues };
			}
		}
	}

	throw new Error('Could not deal a unique waffle');
}

export function boardsMatch(a: number[][], b: number[][]) {
	const size = a.length;
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (isTile(row, col, size) && a[row][col] !== b[row][col]) return false;
		}
	}
	return true;
}

export function starsFor(swapsUsed: number, solved: boolean, swapLimit = 20, minSwaps = 15) {
	if (!solved) return 0;
	const span = Math.max(1, swapLimit - minSwaps);
	const spare = Math.max(0, Math.min(span, swapLimit - swapsUsed));
	return Math.round((spare / span) * 5);
}

export function clueTargets(clue: Clue) {
	const [dr1, dc1] = DELTA[clue.a];
	const [dr2, dc2] = DELTA[clue.b];
	return [
		{ row: clue.row + dr1, col: clue.col + dc1 },
		{ row: clue.row + dr2, col: clue.col + dc2 }
	];
}
