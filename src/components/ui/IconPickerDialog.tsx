import {
	lazy,
	Suspense,
	useEffect,
	useMemo,
	useRef,
	useState,
	type LazyExoticComponent,
	type ComponentType,
} from "react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { Search, X } from "lucide-react";
import { Button } from "./button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./dialog";
import { Input } from "./input";
import "./IconPickerDialog.css";

// The full, up-to-date list of every icon lucide-react ships.
export type IconName = keyof typeof dynamicIconImports;
export const ALL_ICON_NAMES = Object.keys(
	dynamicIconImports,
) as IconName[];

// --- Lazy loading -----------------------------------------------------
// Each icon is code-split individually via lucide-react's own
// dynamicIconImports map, and only actually import()-ed the first time
// it needs to render (i.e. the first time it scrolls into view).
const lazyIconCache = new Map<IconName, LazyExoticComponent<ComponentType<any>>>();
function getLazyIcon(name: IconName) {
	let Comp = lazyIconCache.get(name);
	if (!Comp) {
		Comp = lazy(dynamicIconImports[name]);
		lazyIconCache.set(name, Comp);
	}
	return Comp;
}

export const AppIcon = ({
	name,
	size = 16,
	className,
}: {
	name: IconName;
	size?: number;
	className?: string;
}) => {
	const Comp = getLazyIcon(name);
	return (
		<Suspense fallback={<span className="icon-fallback" style={{ width: size, height: size }} />}>
			<Comp size={size} className={className} />
		</Suspense>
	);
};

// --- Debounce hook ------------------------------------------------------
function useDebouncedValue<T>(value: T, delayMs: number) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(value), delayMs);
		return () => window.clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

// --- Virtualized grid ----------------------------------------------------
// Manual windowing (no extra dependency): only the rows currently
// scrolled into view (+ overscan) are mounted, everything else is
// represented by empty spacer height so the scrollbar stays accurate.
const COLUMNS = 6;
const CELL_SIZE = 56; // px, square cells
const OVERSCAN_ROWS = 3;
const VIEWPORT_HEIGHT = 320; // px

function VirtualIconGrid({
	names,
	selected,
	onSelect,
}: {
	names: IconName[];
	selected: IconName;
	onSelect: (name: IconName) => void;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);

	const rowCount = Math.ceil(names.length / COLUMNS);
	const totalHeight = rowCount * CELL_SIZE;

	const startRow = Math.max(
		0,
		Math.floor(scrollTop / CELL_SIZE) - OVERSCAN_ROWS,
	);
	const visibleRows =
		Math.ceil(VIEWPORT_HEIGHT / CELL_SIZE) + OVERSCAN_ROWS * 2;
	const endRow = Math.min(rowCount, startRow + visibleRows);

	// Reset scroll position whenever the (filtered) list changes.
	useEffect(() => {
		scrollRef.current?.scrollTo({ top: 0 });
		setScrollTop(0);
	}, [names]);

	const items: { name: IconName; row: number; col: number }[] = [];
	for (let row = startRow; row < endRow; row++) {
		for (let col = 0; col < COLUMNS; col++) {
			const index = row * COLUMNS + col;
			if (index >= names.length) break;
			items.push({ name: names[index], row, col });
		}
	}

	return (
		<div
			ref={scrollRef}
			className="icon-grid-viewport"
			style={{ height: VIEWPORT_HEIGHT }}
			onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
		>
			<div className="icon-grid-spacer" style={{ height: totalHeight }}>
				{items.map(({ name, row, col }) => (
					<button
						key={name}
						type="button"
						title={name}
						aria-label={name}
						className={
							"icon-grid-cell" +
							(name === selected ? " selected" : "")
						}
						style={{
							transform: `translate(${col * CELL_SIZE}px, ${row * CELL_SIZE}px)`,
						}}
						onClick={() => onSelect(name)}
					>
						<AppIcon name={name} size={18} />
					</button>
				))}
			</div>
			{names.length === 0 && (
				<div className="icon-grid-empty">Không tìm thấy biểu tượng.</div>
			)}
		</div>
	);
}

// --- Public dialog --------------------------------------------------------
export function IconPickerDialog({
	value,
	onChange,
	triggerLabel,
}: {
	value: IconName;
	onChange: (icon: IconName) => void;
	triggerLabel?: string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebouncedValue(query, 250);

	const filteredNames = useMemo(() => {
		const needle = debouncedQuery.trim().toLowerCase();
		if (!needle) return ALL_ICON_NAMES;
		return ALL_ICON_NAMES.filter((name) => name.includes(needle));
	}, [debouncedQuery]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger>
				<Button
					type="button"
					variant="default"
					className="icon-picker-trigger"
				>
					<AppIcon name={value} size={16} />
					{triggerLabel ?? "Chọn biểu tượng"}
				</Button>
			</DialogTrigger>
			<DialogContent className="icon-picker-dialog">
				<DialogHeader>
					<DialogTitle>Chọn biểu tượng</DialogTitle>
				</DialogHeader>
				<div className="icon-picker-search">
					<Search size={16} />
					<Input
						autoFocus
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Tìm biểu tượng (vd: database, git, cloud)..."
					/>
					{query && (
						<button
							type="button"
							className="icon-picker-clear"
							onClick={() => setQuery("")}
							aria-label="Xoá tìm kiếm"
						>
							<X size={14} />
						</button>
					)}
				</div>
				<div className="icon-picker-count">
					{filteredNames.length.toLocaleString("vi-VN")} biểu tượng
				</div>
				<VirtualIconGrid
					names={filteredNames}
					selected={value}
					onSelect={(name) => {
						onChange(name);
						setOpen(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}