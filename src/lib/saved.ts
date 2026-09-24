const KEY = 'numble-progress';
const LEGACY = 'numble-active';

export type SavedPlay = {
	board: number[][];
	swapsLeft: number;
	phase: 'play' | 'won' | 'lost';
	recorded: boolean;
	revealed: boolean;
	history: { board: number[][]; swapsLeft: number; phase: 'play' | 'won' | 'lost'; recorded: boolean }[];
	savedStars: number | null;
};

function readMap(): Record<string, SavedPlay> {
	const map: Record<string, SavedPlay> = {};
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) Object.assign(map, JSON.parse(raw));
	} catch {
		localStorage.removeItem(KEY);
	}
	try {
		const legacy = localStorage.getItem(LEGACY);
		if (legacy) {
			const saved = JSON.parse(legacy);
			if (saved?.id != null && Array.isArray(saved.board) && map[String(saved.id)] == null) {
				map[String(saved.id)] = saved;
			}
			localStorage.removeItem(LEGACY);
			localStorage.setItem(KEY, JSON.stringify(map));
		}
	} catch {
		localStorage.removeItem(LEGACY);
	}
	return map;
}

function writeMap(map: Record<string, SavedPlay>) {
	localStorage.setItem(KEY, JSON.stringify(map));
}

export function savedIds(): number[] {
	return Object.keys(readMap())
		.map(Number)
		.filter((id) => Number.isInteger(id));
}

export function loadSaved(id: number): SavedPlay | null {
	const saved = readMap()[String(id)];
	if (!saved || !Array.isArray(saved.board)) return null;
	return saved;
}

export function saveProgress(id: number, play: SavedPlay) {
	const map = readMap();
	map[String(id)] = play;
	writeMap(map);
}

export function clearSaved(id: number) {
	const map = readMap();
	delete map[String(id)];
	writeMap(map);
}

export function clearSavedIds(ids: number[]) {
	const map = readMap();
	for (const id of ids) delete map[String(id)];
	writeMap(map);
}
