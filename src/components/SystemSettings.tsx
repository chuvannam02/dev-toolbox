import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
	DatabaseZap,
	HardDrive,
	RotateCcw,
	Rocket,
	ShieldCheck,
} from "lucide-react";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import "./SystemSettings.css";

const SETTINGS_KEYS = [
	"darkMode",
	"dev-toolbox:favorites",
	"dev-toolbox:collapsed-groups",
	"dev-toolbox:sidebar-collapsed",
];

export default function SystemSettings() {
	const [launchAtLogin, setLaunchAtLogin] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		void invoke<boolean>("get_launch_at_login")
			.then(setLaunchAtLogin)
			.catch(() =>
				setStatus("Không thể đọc trạng thái khởi động cùng hệ thống."),
			);
	}, []);

	const updateLaunchAtLogin = async (enabled: boolean) => {
		setBusy(true);
		setStatus(null);
		try {
			await invoke("set_launch_at_login", { enabled });
			setLaunchAtLogin(enabled);
			setStatus(
				enabled
					? "Đã bật khởi động cùng hệ thống."
					: "Đã tắt khởi động cùng hệ thống.",
			);
		} catch (error) {
			setStatus(`Không thể cập nhật: ${String(error)}`);
		} finally {
			setBusy(false);
		}
	};

	const clearTemporaryData = async () => {
		if (
			!window.confirm(
				"Xóa cache và dữ liệu tạm của ứng dụng? Secure Vault và thiết lập giao diện sẽ được giữ nguyên.",
			)
		)
			return;
		setBusy(true);
		setStatus(null);
		try {
			const retained = new Map(
				SETTINGS_KEYS.map((key) => [key, localStorage.getItem(key)]),
			);
			localStorage.clear();
			retained.forEach((value, key) =>
				value === null
					? localStorage.removeItem(key)
					: localStorage.setItem(key, value),
			);
			sessionStorage.clear();
			await invoke("clear_app_cache");
			setStatus(
				"Đã dọn cache và dữ liệu tạm. Các thay đổi sẽ áp dụng đầy đủ khi khởi động lại ứng dụng.",
			);
		} catch (error) {
			setStatus(`Dọn dẹp chưa hoàn tất: ${String(error)}`);
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="system-settings">
			<div className="settings-heading">
				<div className="settings-heading-icon">
					<ShieldCheck size={22} />
				</div>
				<div>
					<h2>Cài đặt hệ thống</h2>
					<p>
						Quản lý cách Dev Toolbox chạy và lưu dữ liệu trên máy.
					</p>
				</div>
			</div>
			<div className="settings-card">
				<div className="setting-icon">
					<Rocket size={20} />
				</div>
				<div className="setting-copy">
					<h3>Khởi động cùng hệ thống</h3>
					<p>Tự mở Dev Toolbox sau khi bạn đăng nhập Windows.</p>
				</div>
				<Switch
					checked={launchAtLogin}
					disabled={busy}
					onCheckedChange={updateLaunchAtLogin}
					aria-label="Khởi động cùng hệ thống"
				/>
			</div>
			<div className="settings-card">
				<div className="setting-icon">
					<DatabaseZap size={20} />
				</div>
				<div className="setting-copy">
					<h3>Dọn dữ liệu rác</h3>
					<p>
						Xóa cache, phiên làm việc và dữ liệu tạm. Không xóa
						Secure Vault, cài đặt giao diện hoặc cơ sở dữ liệu của
						bạn.
					</p>
				</div>
				<Button
					variant="outline"
					disabled={busy}
					onClick={() => void clearTemporaryData()}
				>
					<HardDrive size={16} /> Dọn dẹp
				</Button>
			</div>
			<div className="settings-card refresh-card">
				<div className="setting-icon">
					<RotateCcw size={20} />
				</div>
				<div className="setting-copy">
					<h3>Làm mới dữ liệu đang lưu ngầm</h3>
					<p>
						Sau khi dọn dẹp, hãy khởi động lại ứng dụng để các công
						cụ tải lại trạng thái sạch.
					</p>
				</div>
				<Button
					variant="outline"
					disabled={busy}
					onClick={() => window.location.reload()}
				>
					<RotateCcw size={16} /> Làm mới
				</Button>
			</div>
			{status && (
				<p className="settings-status" role="status">
					{status}
				</p>
			)}
		</section>
	);
}
