<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{@render children()}

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html),
	:global(body) {
		margin: 0;
		min-height: 100%;
	}

	:global(body) {
		overscroll-behavior: none;
		background:
			radial-gradient(circle at 12% -10%, oklch(0.78 0.006 260 / 0.4), transparent 36%),
			oklch(0.84 0.004 260);
		color: oklch(0.28 0.03 70);
		font-family: Outfit, sans-serif;
	}

	:global(button),
	:global(input) {
		font: inherit;
	}
</style>
