<script lang="ts">
	import { DIFFICULTIES, SIZES, type BoardSize, type Difficulty } from '$lib/puzzle';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let stats = $state(data.stats);
	let catalog = $state(data.catalog);
	let dialog = $state<'help' | 'stats' | 'reset' | null>(null);

	$effect(() => {
		catalog = data.catalog;
		stats = data.stats;
	});
	let busy = $state(false);
	let resetSizes = $state<BoardSize[]>([data.size]);
	let resetLevels = $state<Difficulty[]>([data.difficulty]);

	let solvedCount = $derived(catalog.filter((slot) => slot.solved).length);

	function setHref(size: BoardSize, difficulty: Difficulty) {
		return `/?size=${size}&difficulty=${difficulty}`;
	}

	function playHref(sequence: number) {
		return `/play/${data.size}/${data.difficulty}/${sequence}`;
	}

	function toggleResetSize(size: BoardSize) {
		resetSizes = resetSizes.includes(size) ? resetSizes.filter((item) => item !== size) : [...resetSizes, size];
	}

	function toggleResetLevel(level: Difficulty) {
		resetLevels = resetLevels.includes(level)
			? resetLevels.filter((item) => item !== level)
			: [...resetLevels, level];
	}

	async function resetSelected() {
		if (busy || resetSizes.length === 0 || resetLevels.length === 0) return;
		busy = true;
		try {
			const response = await fetch('/api/progress', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					sizes: resetSizes,
					difficulties: resetLevels,
					catalogSize: data.size,
					catalogDifficulty: data.difficulty
				})
			});
			if (!response.ok) return;
			const payload = await response.json();
			stats = payload.stats;
			catalog = payload.catalog;
			dialog = null;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Myable</title>
</svelte:head>

<main>
	<header>
		<button class="icon" type="button" aria-label="How to play" onclick={() => (dialog = 'help')}>?</button>
		<div class="brand">
			<p class="eyebrow">Number waffle</p>
			<h1>Myable</h1>
			<p class="number">{solvedCount} of 50 solved</p>
		</div>
		<button class="icon" type="button" aria-label="Statistics" onclick={() => (dialog = 'stats')}>★</button>
	</header>

	<div class="options">
		<div class="choice">
			<span>Size</span>
			<div class="picks">
				{#each SIZES as size}
					<a class:on={data.size === size} href={setHref(size, data.difficulty)}>
						{size === 5 ? 'Small' : size === 9 ? 'Large' : 'Classic'}
					</a>
				{/each}
			</div>
		</div>
		<div class="choice">
			<span>Difficulty</span>
			<div class="picks">
				{#each DIFFICULTIES as level}
					<a class:on={data.difficulty === level} href={setHref(data.size, level)}>
						{level === 'medium' ? 'Normal' : level}
					</a>
				{/each}
			</div>
		</div>
	</div>

	<div class="progress" aria-label="Puzzle set">
		{#each catalog as slot}
			<a
				class="slot"
				class:solved={slot.solved}
				class:attempted={slot.attempted && !slot.solved}
				href={playHref(slot.sequence)}
				aria-label="Puzzle {slot.sequence}{slot.solved ? `, ${slot.stars} stars` : slot.attempted ? ', attempted' : ''}"
			>
				<span>{slot.sequence}</span>
				{#if slot.solved}<small>{slot.stars}★</small>{/if}
			</a>
		{/each}
	</div>

	<div class="actions">
		<button type="button" class="texty" onclick={() => (dialog = 'reset')}>Reset scores</button>
	</div>
</main>

{#if dialog === 'reset'}
	<div class="scrim" role="presentation" onclick={() => (dialog = null)}></div>
	<div class="sheet" role="dialog" aria-labelledby="reset-title">
		<h2 id="reset-title">Reset scores</h2>
		<p>Clear the ticks and stars for any mix of sizes and difficulties. The puzzles stay.</p>
		<p class="choice">
			<span>Size</span>
			{#each SIZES as size}
				<button type="button" class:on={resetSizes.includes(size)} onclick={() => toggleResetSize(size)}>
					{size === 5 ? 'Small' : size === 9 ? 'Large' : 'Classic'}
				</button>
			{/each}
		</p>
		<p class="choice">
			<span>Difficulty</span>
			{#each DIFFICULTIES as level}
				<button type="button" class:on={resetLevels.includes(level)} onclick={() => toggleResetLevel(level)}>
					{level === 'medium' ? 'Normal' : level}
				</button>
			{/each}
		</p>
		<button type="button" class="solid" disabled={busy || resetSizes.length === 0 || resetLevels.length === 0} onclick={resetSelected}>
			Reset selected
		</button>
	</div>
{/if}

{#if dialog === 'help'}
	<div class="scrim" role="presentation" onclick={() => (dialog = null)}></div>
	<div class="sheet" role="dialog" aria-labelledby="help-title">
		<h2 id="help-title">How to play</h2>
		<p>Pick a number to open that waffle. Swap tiles until every full row and every full column holds 1 to {data.size}, once each.</p>
		<p>Green means that number is already home. Each black clue is the sum of the two squares its arrows point at.</p>
		<p>There are 50 puzzles in each size and difficulty. A green number is solved, and the stars are the score you earned.</p>
		<button type="button" class="solid" onclick={() => (dialog = null)}>Back to the set</button>
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
		<button type="button" class="solid" onclick={() => (dialog = null)}>Close</button>
	</div>
{/if}

<style>
	main {
		width: min(720px, 100%);
		margin: 0 auto;
		padding:
			max(0.6rem, env(safe-area-inset-top))
			max(0.75rem, env(safe-area-inset-right))
			max(0.75rem, env(safe-area-inset-bottom))
			max(0.75rem, env(safe-area-inset-left));
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
		background: oklch(0.93 0.005 260);
		color: oklch(0.3 0.03 60);
		font-size: 1.15rem;
		cursor: pointer;
	}

	.options {
		display: grid;
		gap: 0.55rem;
		margin-bottom: 0.85rem;
	}

	.options .choice {
		display: grid;
		grid-template-columns: 7.4rem minmax(0, 1fr);
		align-items: center;
		column-gap: 1.15rem;
	}

	.choice {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem;
	}

	.choice span {
		width: 7.4rem;
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: oklch(0.45 0.03 70);
		font-weight: 800;
	}

	.picks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.choice a,
	.choice button {
		border: 0;
		border-radius: 0.25rem;
		min-height: 2.75rem;
		padding: 0.35rem 0.75rem;
		background: oklch(0.95 0.01 90);
		color: oklch(0.4 0.03 60);
		font-weight: 800;
		text-transform: capitalize;
		text-decoration: none;
		cursor: pointer;
	}

	.choice a.on,
	.choice button.on {
		background: oklch(0.32 0.04 55);
		color: oklch(0.97 0.01 90);
	}

	.progress {
		display: grid;
		grid-template-columns: repeat(10, minmax(0, 1fr));
		gap: 0.28rem;
	}

	.slot {
		display: grid;
		place-items: center;
		min-height: 2.6rem;
		border-radius: 0.25rem;
		background: oklch(0.95 0.01 90);
		color: oklch(0.4 0.03 60);
		font-weight: 800;
		font-size: 0.78rem;
		line-height: 1;
		text-decoration: none;
	}

	.slot small {
		font-size: 0.62rem;
	}

	.slot.solved {
		background: oklch(0.64 0.15 145);
		color: oklch(0.98 0.01 145);
	}

	.slot.attempted {
		background: oklch(0.9 0.03 70);
	}

	.actions {
		display: flex;
		justify-content: center;
		margin-top: 1rem;
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

	.scrim {
		position: fixed;
		inset: 0;
		background: oklch(0.25 0.02 60 / 0.35);
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
		border-radius: 0.4rem;
		padding: 1.3rem 1.25rem 1.15rem;
	}

	.sheet h2 {
		font-family: Outfit, sans-serif;
		font-size: 2rem;
		margin: 0.15rem 0 0.6rem;
	}

	.statgrid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.7rem 0.4rem;
		text-align: center;
	}

	.statgrid dt {
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.statgrid dd {
		margin: 0.15rem 0 0;
		font-size: 1.7rem;
		font-weight: 800;
	}
</style>
