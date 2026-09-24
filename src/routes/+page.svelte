<script lang="ts">
	import { browser } from '$app/environment';
	import {
		DIFFICULTIES,
		SIZES,
		boardsMatch,
		clueTargets,
		isHole,
		starsFor,
		type BoardSize,
		type Clue,
		type Difficulty
	} from '$lib/puzzle';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const SAVE_KEY = 'numble-active';

	let puzzle = $state(data.puzzle);
	let stats = $state(data.stats);
	let board = $state(data.puzzle.start.map((row) => row.slice()));
	let swapsLeft = $state(data.puzzle.swapLimit);
	let sizeChoice = $state<BoardSize>(data.puzzle.size ?? 7);
	let difficultyChoice = $state<Difficulty>(data.puzzle.difficulty ?? 'medium');
	let phase = $state<'play' | 'won' | 'lost'>('play');
	let recorded = $state(false);
	let revealed = $state(false);
	let selected = $state<{ row: number; col: number } | null>(null);
	let dialog = $state<'help' | 'stats' | null>(null);
	let busy = $state(false);
	let ready = $state(false);

	let stars = $derived(starsFor(puzzle.swapLimit - swapsLeft, phase === 'won', puzzle.swapLimit, puzzle.minSwaps));
	let solution = $derived(puzzle.solution);
	let lines = $derived(puzzle.solution.map((_, index) => index));

	$effect(() => {
		if (!browser || !ready) return;
		localStorage.setItem(
			SAVE_KEY,
			JSON.stringify({
				id: puzzle.id,
				board,
				swapsLeft,
				phase,
				recorded,
				revealed
			})
		);
	});

	$effect(() => {
		if (!browser) return;
		const seenHelp = localStorage.getItem('numble-help-seen') === '1';
		dialog = seenHelp ? null : 'help';
		const raw = localStorage.getItem(SAVE_KEY);
		if (raw) {
			try {
				const saved = JSON.parse(raw);
				if (saved.id === data.puzzle.id && Array.isArray(saved.board)) {
					board = saved.board;
					swapsLeft = saved.swapsLeft;
					phase = saved.phase;
					recorded = saved.recorded;
					revealed = saved.revealed;
				}
			} catch {
				localStorage.removeItem(SAVE_KEY);
			}
		}
		ready = true;
	});

	function correct(row: number, col: number) {
		return board[row][col] === solution[row][col];
	}

	function clueDone(clue: Clue) {
		return clueTargets(clue).every((cell) => correct(cell.row, cell.col));
	}

	function clueAt(row: number, col: number) {
		return puzzle.clues.find((clue) => clue.row === row && clue.col === col);
	}

	async function record(finalBoard: number[][], used: number) {
		if (recorded) return;
		recorded = true;
		const response = await fetch('/api/plays', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ puzzleId: puzzle.id, board: finalBoard, swapsUsed: used })
		});
		if (!response.ok) {
			recorded = false;
			return;
		}
		const result = await response.json();
		stats = result.stats;
	}

	function swap(r1: number, c1: number, r2: number, c2: number) {
		if (phase !== 'play' || busy) return;
		if (r1 === r2 && c1 === c2) return;
		const next = board.map((row) => row.slice());
		[next[r1][c1], next[r2][c2]] = [next[r2][c2], next[r1][c1]];
		board = next;
		swapsLeft -= 1;
		selected = null;
		const used = puzzle.swapLimit - swapsLeft;
		if (boardsMatch(board, solution)) {
			phase = 'won';
			record(board, used);
		} else if (swapsLeft === 0) {
			phase = 'lost';
			record(board, used);
		}
	}

	let dragFrom = $state<{ row: number; col: number } | null>(null);
	let dragMoved = false;
	let ignoreClick = false;

	function choose(row: number, col: number) {
		if (ignoreClick) {
			ignoreClick = false;
			return;
		}
		if (phase !== 'play') return;
		if (!selected) {
			selected = { row, col };
			return;
		}
		if (selected.row === row && selected.col === col) {
			selected = null;
			return;
		}
		swap(selected.row, selected.col, row, col);
	}

	function onPointerDown(event: PointerEvent, row: number, col: number) {
		if (phase !== 'play' || !event.isPrimary) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		dragFrom = { row, col };
		dragMoved = false;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragFrom) return;
		if (Math.hypot(event.movementX, event.movementY) > 8) dragMoved = true;
	}

	function onPointerUp(event: PointerEvent) {
		if (!dragFrom) return;
		const from = dragFrom;
		const moved = dragMoved;
		dragFrom = null;
		dragMoved = false;
		if (!moved) return;
		ignoreClick = true;
		const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-row]');
		if (!hit) {
			selected = null;
			return;
		}
		swap(from.row, from.col, Number(hit.dataset.row), Number(hit.dataset.col));
	}

	function onDragStart(event: DragEvent, row: number, col: number) {
		if (phase !== 'play') {
			event.preventDefault();
			return;
		}
		event.dataTransfer?.setData('text/plain', `${row},${col}`);
		selected = { row, col };
	}

	function onDrop(event: DragEvent, row: number, col: number) {
		event.preventDefault();
		const raw = event.dataTransfer?.getData('text/plain') ?? '';
		const [r, c] = raw.split(',').map(Number);
		if (Number.isInteger(r) && Number.isInteger(c)) swap(r, c, row, col);
	}

	async function newWaffle(size = sizeChoice, difficulty = difficultyChoice) {
		if (busy) return;
		sizeChoice = size;
		difficultyChoice = difficulty;
		busy = true;
		dialog = null;
		try {
			const response = await fetch('/api/puzzles', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ size, difficulty })
			});
			const payload = await response.json();
			puzzle = payload.puzzle;
			stats = payload.stats;
			board = payload.puzzle.start.map((row: number[]) => row.slice());
			swapsLeft = payload.puzzle.swapLimit;
			phase = 'play';
			recorded = false;
			revealed = false;
			selected = null;
		} finally {
			busy = false;
		}
	}

	function showSolution() {
		board = solution.map((row) => row.slice());
		revealed = true;
		if (phase === 'play') {
			phase = 'lost';
			record(puzzle.start, puzzle.swapLimit);
		}
	}

	function closeHelp() {
		dialog = null;
		if (browser) localStorage.setItem('numble-help-seen', '1');
	}

	function swapLabel() {
		const word = swapsLeft === 1 ? 'swap' : 'swaps';
		return `${swapsLeft} ${word} remaining`;
	}
</script>

<svelte:head>
	<title>Myable</title>
</svelte:head>

<main>
	<header>
		<button class="icon" type="button" aria-label="How to play" onclick={() => (dialog = 'help')}>
			?
		</button>
		<div class="brand">
			<p class="eyebrow">Number waffle</p>
			<h1>Myable</h1>
			<p class="number">#{puzzle.id}</p>
		</div>
		<button class="icon" type="button" aria-label="Statistics" onclick={() => (dialog = 'stats')}>
			★
		</button>
	</header>

	<div class="options">
		<div class="choice">
			<span>Size</span>
			{#each SIZES as size}
				<button type="button" class:on={sizeChoice === size} disabled={busy} onclick={() => newWaffle(size, difficultyChoice)}>
					{size === 5 ? 'Small' : size === 9 ? 'Large' : 'Classic'}
				</button>
			{/each}
		</div>
		<div class="choice">
			<span>Difficulty</span>
			{#each DIFFICULTIES as level}
				<button
					type="button"
					class:on={difficultyChoice === level}
					disabled={busy}
					onclick={() => newWaffle(sizeChoice, level)}
				>
					{level}
				</button>
			{/each}
		</div>
	</div>

	<div class="board" class:dim={phase !== 'play' && !revealed} style:--n={puzzle.size}>
		{#each lines as row}
			{#each lines as col}
				{#if isHole(row, col)}
					{@const clue = clueAt(row, col)}
					{#if clue}
						<div
						class="clue"
						class:spent={clueDone(clue)}
						style:grid-row={row + 1}
						style:grid-column={col + 1}
						aria-hidden="true"
					>
							<span class="pointer {clue.a}"></span>
							<span class="pointer {clue.b}"></span>
							<span class="sum">{clue.sum}</span>
						</div>
					{/if}
				{:else}
					<button
						type="button"
						class="tile"
						class:green={correct(row, col)}
						class:picked={selected?.row === row && selected?.col === col}
						style:grid-row={row + 1}
						style:grid-column={col + 1}
						data-row={row}
						data-col={col}
						draggable={phase === 'play'}
						aria-label="Row {row + 1}, column {col + 1}, {board[row][col]}{correct(row, col) ? ', correct' : ''}"
						onclick={() => choose(row, col)}
						onpointerdown={(event) => onPointerDown(event, row, col)}
						onpointermove={onPointerMove}
						onpointerup={onPointerUp}
						oncontextmenu={(event) => event.preventDefault()}
						ondragstart={(event) => onDragStart(event, row, col)}
						ondragover={(event) => event.preventDefault()}
						ondrop={(event) => onDrop(event, row, col)}
					>
						{board[row][col]}
					</button>
				{/if}
			{/each}
		{/each}
	</div>

	<p class="remaining" aria-live="polite">{revealed ? 'Solution' : swapLabel()}</p>

	<div class="actions">
		<button type="button" class="texty" onclick={newWaffle} disabled={busy}>New waffle</button>
		{#if phase === 'play'}
			<button type="button" class="texty" onclick={showSolution}>Show solution</button>
		{/if}
	</div>

	{#if phase !== 'play'}
		<div class="result" role="status">
			{#if phase === 'won'}
				<p class="eyebrow">Solved</p>
				<h2>{stars === 5 ? 'Perfect waffle' : 'Well done'}</h2>
				<p class="starline" aria-label="{stars} stars">{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</p>
				<p>{stars} {stars === 1 ? 'star' : 'stars'} from the swaps you had left.</p>
			{:else if !revealed}
				<p class="eyebrow">Out of swaps</p>
				<h2>So close</h2>
				<button type="button" class="texty" onclick={showSolution}>Show solution</button>
			{:else}
				<p class="eyebrow">Solution</p>
				<p>Every full row and column is 1 to {puzzle.size}.</p>
			{/if}
		</div>
	{/if}
</main>

{#if dialog === 'help'}
	<div class="scrim" role="presentation" onclick={closeHelp}></div>
	<div class="sheet" role="dialog" aria-labelledby="help-title">
		<h2 id="help-title">How to play</h2>
		<p>Swap numbers until every full row and every full column holds 1 to {puzzle.size}, once each. Tap one tile, then the tile you want to swap it with. You can also drag a tile onto another.</p>
		<p>The solid rows and solid columns are the lines that count. The gaps stay empty.</p>
		<ul>
			<li>Green means that number is already home.</li>
			<li>A pale tile is the wrong number for that square.</li>
			<li>Each black clue is the sum of the two squares its arrows point at, in the solved grid.</li>
		</ul>
		<p>
			You have {puzzle.swapLimit} swaps. This waffle can be finished in {puzzle.minSwaps}. A perfect solve is
			five stars, and using every swap leaves you with none.
		</p>
		<p>Small is 5 across, Classic is 7, and Large is 9. Easy leaves more numbers already home. Hard moves almost everything and leaves little room for a wrong swap.</p>
		<button type="button" class="solid" onclick={closeHelp}>Start swapping</button>
	</div>
{/if}

{#if dialog === 'stats'}
	<div class="scrim" role="presentation" onclick={() => (dialog = null)}></div>
	<div class="sheet" role="dialog" aria-labelledby="stats-title">
		<h2 id="stats-title">Statistics</h2>
		<dl class="statgrid">
			<div><dt>Played</dt><dd>{stats.played}</dd></div>
			<div><dt>Solved</dt><dd>{stats.solved}</dd></div>
			<div><dt>Streak</dt><dd>{stats.currentStreak}</dd></div>
			<div><dt>Best</dt><dd>{stats.bestStreak}</dd></div>
			<div><dt>Stars</dt><dd>{stats.totalStars}</dd></div>
			<div><dt>Missed</dt><dd>{stats.failed}</dd></div>
		</dl>
		<h3>Star distribution</h3>
		<ul class="bars">
			{#each stats.distribution as count, starsEarned}
				<li>
					<span>{starsEarned}</span>
					<span class="bar"><span style:width="{stats.solved ? (count / stats.solved) * 100 : 0}%"></span></span>
					<span>{count}</span>
				</li>
			{/each}
		</ul>
		<button type="button" class="solid" onclick={() => (dialog = null)}>Close</button>
	</div>
{/if}


<style>
	main {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		width: min(860px, 100%);
		min-height: 100svh;
		margin: 0 auto;
		padding:
			max(0.6rem, env(safe-area-inset-top))
			max(0.75rem, env(safe-area-inset-right))
			max(0.75rem, env(safe-area-inset-bottom))
			max(0.75rem, env(safe-area-inset-left));
	}

	header,
	.options,
	.remaining,
	.actions,
	.result {
		width: min(440px, 100%);
		margin-inline: auto;
	}

	header {
		display: grid;
		grid-template-columns: 3rem 1fr 3rem;
		align-items: center;
		margin-bottom: 1.1rem;
	}

	.brand {
		text-align: center;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: oklch(0.48 0.04 65);
	}

	h1 {
		margin: 0;
		font-family: Outfit, sans-serif;
		font-weight: 700;
		font-size: clamp(2.4rem, 8vw, 3.3rem);
		letter-spacing: -0.04em;
		line-height: 0.9;
		color: oklch(0.27 0.04 55);
	}

	.number {
		margin: 0.2rem 0 0;
		color: oklch(0.45 0.03 70);
		font-weight: 800;
	}

	.icon {
		width: 2.7rem;
		height: 2.7rem;
		border: 0;
		border-radius: 0.25rem;
		background: oklch(0.9 0.02 80);
		color: oklch(0.3 0.03 60);
		font-size: 1.15rem;
		cursor: pointer;
	}

	.options {
		display: grid;
		gap: 0.45rem;
		margin-bottom: 0.85rem;
	}

	.choice {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
	}

	.choice span {
		width: 4.6rem;
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: oklch(0.45 0.03 70);
		font-weight: 800;
	}

	.choice button {
		border: 0;
		border-radius: 0.25rem;
		min-height: 2.75rem;
		padding: 0.35rem 0.75rem;
		background: oklch(0.95 0.01 90);
		color: oklch(0.4 0.03 60);
		font-weight: 800;
		text-transform: capitalize;
		cursor: pointer;
	}

	.choice button.on {
		background: oklch(0.32 0.04 55);
		color: oklch(0.97 0.01 90);
	}

	.board {
		display: grid;
		grid-template-columns: repeat(var(--n, 7), minmax(0, 1fr));
		gap: clamp(0.18rem, 0.9cqi, 0.35rem);
		width: 100%;
		max-width: min(100%, calc(100svh - 20rem));
		margin-inline: auto;
		padding: 0.15rem;
		container-type: inline-size;
		touch-action: none;
		user-select: none;
	}

	.board.dim {
		opacity: 0.55;
	}

	.tile,
	.clue {
		aspect-ratio: 1;
		min-width: 0;
		border-radius: 0.2rem;
		position: relative;
	}

	.tile {
		border: 0;
		background: oklch(0.99 0.004 95);
		color: oklch(0.22 0.01 70);
		font-weight: 800;
		line-height: 1;
		font-size: calc(32cqi / var(--n, 7));
		box-shadow:
			0 0 0 1px oklch(0.78 0.03 75),
			0 1px 2px oklch(0.55 0.03 70 / 0.18);
		cursor: grab;
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;
	}

	.tile.green {
		background: oklch(0.64 0.15 145);
		color: oklch(0.98 0.01 145);
	}

	.tile.picked {
		outline: 3px solid oklch(0.62 0.14 65);
		outline-offset: 2px;
	}

	.clue {
		display: grid;
		place-items: center;
		z-index: 1;
	}

	.sum {
		width: 62%;
		height: 62%;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: oklch(0.22 0.02 60);
		color: oklch(0.97 0.01 90);
		font-weight: 800;
		font-size: calc(18cqi / var(--n, 7));
		position: relative;
		z-index: 1;
	}

	.clue.spent .sum {
		background: oklch(0.72 0.02 80);
		color: oklch(0.4 0.02 70);
	}

	.pointer {
		position: absolute;
		width: 0;
		height: 0;
		z-index: 0;
	}

	.pointer.up {
		top: 8%;
		left: 50%;
		transform: translateX(-50%);
		border-left: 0.42rem solid transparent;
		border-right: 0.42rem solid transparent;
		border-bottom: 0.7rem solid oklch(0.22 0.02 60);
	}

	.pointer.down {
		bottom: 8%;
		left: 50%;
		transform: translateX(-50%);
		border-left: 0.42rem solid transparent;
		border-right: 0.42rem solid transparent;
		border-top: 0.7rem solid oklch(0.22 0.02 60);
	}

	.pointer.left {
		left: 6%;
		top: 50%;
		transform: translateY(-50%);
		border-top: 0.42rem solid transparent;
		border-bottom: 0.42rem solid transparent;
		border-right: 0.7rem solid oklch(0.22 0.02 60);
	}

	.pointer.right {
		right: 6%;
		top: 50%;
		transform: translateY(-50%);
		border-top: 0.42rem solid transparent;
		border-bottom: 0.42rem solid transparent;
		border-left: 0.7rem solid oklch(0.22 0.02 60);
	}

	.clue.spent .pointer.up {
		border-bottom-color: oklch(0.72 0.02 80);
	}
	.clue.spent .pointer.down {
		border-top-color: oklch(0.72 0.02 80);
	}
	.clue.spent .pointer.left {
		border-right-color: oklch(0.72 0.02 80);
	}
	.clue.spent .pointer.right {
		border-left-color: oklch(0.72 0.02 80);
	}

	.remaining {
		margin: 1rem auto 0.4rem;
		text-align: center;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: oklch(0.45 0.03 70);
		font-size: 0.95rem;
	}

	@media (max-height: 740px) {
		.board {
			max-width: min(100%, calc(100svh - 15rem));
		}
	}

	@media (max-width: 700px) and (max-height: 740px) {
		header {
			margin-bottom: 0.4rem;
		}

		h1 {
			font-size: 1.7rem;
		}

		.options {
			gap: 0.2rem;
			margin-bottom: 0.4rem;
		}

		.choice button {
			min-height: 2.25rem;
			padding: 0.2rem 0.6rem;
		}

		.remaining {
			margin: 0.4rem auto 0;
		}
	}

	.actions {
		display: flex;
		justify-content: center;
		gap: 0.4rem;
	}

	.texty,
	.solid {
		border: 0;
		background: transparent;
		color: oklch(0.4 0.06 55);
		font-weight: 800;
		cursor: pointer;
		padding: 0.55rem 0.8rem;
	}

	.solid {
		display: block;
		width: 100%;
		margin-top: 0.8rem;
		border-radius: 0.25rem;
		background: oklch(0.32 0.04 55);
		color: oklch(0.97 0.01 90);
	}

	.texty:disabled,
	.solid:disabled {
		opacity: 0.5;
	}

	.scrim {
		position: fixed;
		inset: 0;
		background: oklch(0.25 0.02 60 / 0.35);
	}

	.result {
		margin-top: 0.35rem;
		text-align: center;
	}

	.result h2 {
		font-family: Outfit, sans-serif;
		font-size: 1.7rem;
		margin: 0.15rem 0 0.35rem;
		letter-spacing: -0.03em;
	}

	.result p {
		margin: 0.2rem 0;
	}

	.sheet {
		position: fixed;
		z-index: 2;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(26rem, calc(100% - 1.5rem));
		max-height: min(85svh, 40rem);
		overflow: auto;
		background: oklch(0.98 0.01 90);
		color: oklch(0.28 0.03 60);
		border-radius: 1.2rem;
		padding: 1.3rem 1.25rem 1.15rem;
		box-shadow: 0 18px 50px oklch(0.3 0.03 60 / 0.18);
	}

	.sheet h2 {
		font-family: Outfit, sans-serif;
		font-size: 2rem;
		margin: 0.15rem 0 0.6rem;
		letter-spacing: -0.03em;
	}

	.sheet p,
	.sheet li {
		line-height: 1.45;
	}

	.starline {
		margin: 0.2rem 0;
		font-size: 1.7rem;
		letter-spacing: 0.12em;
		color: oklch(0.62 0.14 75);
	}

	.statgrid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.7rem 0.4rem;
		margin: 0 0 1rem;
	}

	.statgrid div {
		text-align: center;
	}

	.statgrid dt {
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: oklch(0.48 0.03 70);
	}

	.statgrid dd {
		margin: 0.15rem 0 0;
		font-family: Outfit, sans-serif;
		font-size: 1.7rem;
	}

	.sheet h3 {
		margin: 0 0 0.45rem;
		font-size: 0.78rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.28rem;
	}

	.bars li {
		display: grid;
		grid-template-columns: 1rem 1fr 1.4rem;
		gap: 0.4rem;
		align-items: center;
		font-weight: 800;
	}

	.bar {
		height: 0.7rem;
		border-radius: 0.25rem;
		background: oklch(0.92 0.015 85);
		overflow: hidden;
	}

	.bar span {
		display: block;
		height: 100%;
		background: oklch(0.62 0.13 145);
		min-width: 0;
	}

	@media (max-width: 420px) {
		.pointer.up,
		.pointer.down,
		.pointer.left,
		.pointer.right {
			border-width: 0;
		}

		.pointer.up {
			border-left-width: 0.32rem;
			border-right-width: 0.32rem;
			border-bottom-width: 0.5rem;
		}
		.pointer.down {
			border-left-width: 0.32rem;
			border-right-width: 0.32rem;
			border-top-width: 0.5rem;
		}
		.pointer.left {
			border-top-width: 0.32rem;
			border-bottom-width: 0.32rem;
			border-right-width: 0.5rem;
		}
		.pointer.right {
			border-top-width: 0.32rem;
			border-bottom-width: 0.32rem;
			border-left-width: 0.5rem;
		}
	}
</style>
