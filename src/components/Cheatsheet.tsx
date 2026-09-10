// Dữ liệu mẫu cho tính năng Quick Start / Cheat Sheet
const QUICK_COMMANDS = [
	{
		category: "Docker",
		cmd: "docker ps -a --format 'table {{.Names}}\\t{{.Status}}'",
		desc: "Xem danh sách container dạng bảng gọn gàng",
	},
	{
		category: "Docker",
		cmd: "docker system prune -a --volumes",
		desc: "Dọn dẹp triệt để image, container, volume không dùng",
	},
	{
		category: "Kubernetes",
		cmd: "kubectl get pods -A --sort-by='.status.startTime'",
		desc: "Liệt kê Pods theo thời gian tạo",
	},
	{
		category: "Kubernetes",
		cmd: "kubectl port-forward svc/my-service 8080:80",
		desc: "Port forward từ Service K8s về máy local",
	},
	{
		category: "Spring Boot",
		cmd: "mvn spring-boot:run -Dspring-boot.run.profiles=dev",
		desc: "Chạy Spring Boot với Profile 'dev'",
	},
	{
		category: "Angular",
		cmd: "ng serve --host 0.0.0.0 --port 4200",
		desc: "Chạy Angular cho phép mạng LAN truy cập (test trên mobile)",
	},
	{
		category: "Linux / Network",
		cmd: "netstat -tulpn | grep LISTEN",
		desc: "Kiểm tra các Port đang mở/bị chiếm dụng trên server",
	},
	{
		category: "Linux / Jenkins",
		cmd: "chmod +x build.sh && ./build.sh",
		desc: "Cấp quyền thực thi và chạy script bash",
	},
];

const Cheatsheet: React.FC = (): React.JSX.Element => {
	// Hàm copy vào Clipboard nhanh chóng
	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		// Có thể thêm tính năng hiện Toast Notification tại đây
	}

	return (
		<div
			className="cheatsheet-view"
			style={{ overflowY: "auto", height: "100%" }}
		>
			<h2>⚡ Developer & DevOps Cheat Sheet</h2>
			<p style={{ color: "#a9a9a9", marginBottom: "20px" }}>
				Click vào câu lệnh để copy nhanh vào Clipboard.
			</p>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
					gap: "15px",
				}}
			>
				{QUICK_COMMANDS.map((item, idx) => (
					<div
						key={idx}
						style={{
							background: "#252526",
							padding: "15px",
							borderRadius: "6px",
							border: "1px solid #333",
						}}
					>
						<span
							style={{
								fontSize: "12px",
								color: "#007acc",
								fontWeight: "bold",
								textTransform: "uppercase",
							}}
						>
							{item.category}
						</span>
						<div
							onClick={() => copyToClipboard(item.cmd)}
							style={{
								background: "#1e1e1e",
								padding: "10px",
								marginTop: "8px",
								marginBottom: "8px",
								borderRadius: "4px",
								cursor: "pointer",
								fontFamily: "monospace",
								color: "#ce9178",
								border: "1px solid #444",
							}}
							title="Click để Copy"
						>
							$ {item.cmd}
						</div>
						<div
							style={{
								fontSize: "13px",
								color: "#d4d4d4",
							}}
						>
							{item.desc}
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export default Cheatsheet;
