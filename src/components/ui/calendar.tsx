import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import { cn } from "../../lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, ...props }: CalendarProps) {
	return (
		<DayPicker
			className={cn("rounded-md border bg-background p-3", className)}
			classNames={{
				months: "flex flex-col",
				month: "space-y-3",
				month_caption: "flex justify-center pt-1 text-sm font-medium",
				nav: "flex items-center justify-between",
				month_grid: "w-full border-collapse",
				weekdays: "flex",
				weekday: "w-9 text-center text-xs font-normal text-muted-foreground",
				week: "mt-1 flex w-full",
				day: "relative h-9 w-9 p-0 text-center",
				day_button: "h-9 w-9 rounded-md text-sm hover:bg-muted",
				selected: "bg-primary text-primary-foreground hover:bg-primary",
				today: "font-bold text-primary",
				outside: "text-muted-foreground opacity-50",
				...classNames,
			}}
			{...props}
		/>
	);
}
