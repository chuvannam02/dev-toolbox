import { Construction } from "lucide-react";

export default function ToolPlaceholder({ title }: { title: string }) {
	return (
		<section className="view-container">
			<h2><Construction size={24} /> {title}</h2>
			<p>Chức năng này đã có vị trí trong Dev Toolbox và đang chờ được triển khai.</p>
		</section>
	);
}
