import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { Calendar } from "./calendar";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./dialog";

export function DatePicker({
	value,
	onChange,
	label,
}: {
	value: string;
	onChange: (value: string) => void;
	label: string;
}) {
	const [open, setOpen] = useState(false);
	const selected = value ? new Date(`${value}T00:00:00`) : undefined;
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="flex h-9 w-[170px] items-center justify-start rounded-md border bg-background px-3 text-sm font-normal hover:bg-muted">
				<CalendarIcon className="mr-2 size-4" />
				{selected ? format(selected, "dd/MM/yyyy") : label}
			</DialogTrigger>
			<DialogContent className="w-auto max-w-sm">
				<DialogHeader>
					<DialogTitle>{label}</DialogTitle>
				</DialogHeader>
				<Calendar
					mode="single"
					selected={selected}
					onSelect={(date) => {
						if (date) {
							onChange(format(date, "yyyy-MM-dd"));
							setOpen(false);
						}
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
