import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { VaultProps } from "../types/App.type";

const Vault: React.FC<VaultProps> = ({
	credentials,
	searchQuery,
	onSearchQueryChange,
	onCredentialSaved,
}): React.JSX.Element => {
	const [name, setName] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	async function handleSaveVault(e: React.FormEvent) {
		e.preventDefault();
		try {
			await invoke("save_credential", { name, username, password });
			setName("");
			setUsername("");
			setPassword("");
			await onCredentialSaved();
		} catch (error) {
			alert("Lỗi khi lưu: " + error);
		}
	}

	return (
		<div className="vault-view">
			<h2>Thêm Server / Password mới</h2>
			<p>
				Mật khẩu sẽ được mã hóa bởi Windows DPAPI (Hệ điều hành quản
				lý).
			</p>
			<form onSubmit={handleSaveVault} className="vault-form">
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Tên Server (vd: Prod DB)"
					required
				/>
				<input
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					placeholder="Tài khoản"
					required
				/>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder="Mật khẩu"
					required
				/>
				<button type="submit" className="btn-primary">
					Lưu bảo mật
				</button>
			</form>
			<section style={{ marginTop: "20px" }}>
				<input
					type="search"
					placeholder="🔍 Tìm Server, Tài khoản..."
					value={searchQuery}
					onChange={(event) => onSearchQueryChange(event.target.value)}
				/>
				<ul className="cred-list">
					{credentials.map((credential) => (
						<li key={credential.id}>
							<strong>{credential.name}</strong>
							<span>{credential.username}</span>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
};

export default Vault;
