import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
	CheckCircle2,
	CircleAlert,
	Clipboard,
	Clock3,
	KeyRound,
	ShieldCheck,
	Trash2,
} from "lucide-react";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";

import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

type JsonObject = Record<string, unknown>;

type ParsedJwt = {
	header: JsonObject;
	payload: JsonObject;
	signature: string;
	headerEncoded: string;
	payloadEncoded: string;
};

type VerifyResult = {
	valid: boolean;
	algorithm: string;
	claims: JsonObject;
};

function decodeBase64Url(value: string): string {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/");

	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

	const binary = atob(padded);

	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

	return new TextDecoder().decode(bytes);
}

function parseJwt(token: string): ParsedJwt {
	const parts = token.trim().split(".");

	if (parts.length !== 3) {
		throw new Error(
			"Invalid JWT format. JWT must contain 3 parts: header.payload.signature",
		);
	}

	const [headerEncoded, payloadEncoded, signature] = parts;

	const header = JSON.parse(decodeBase64Url(headerEncoded)) as JsonObject;

	const payload = JSON.parse(decodeBase64Url(payloadEncoded)) as JsonObject;

	return {
		header,
		payload,
		signature,
		headerEncoded,
		payloadEncoded,
	};
}

function prettyJson(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

function unixTimeToString(value: unknown): string | null {
	if (typeof value !== "number") {
		return null;
	}

	return new Date(value * 1000).toLocaleString();
}

function ClaimTime({ name, value }: { name: string; value: unknown }) {
	const formatted = unixTimeToString(value);

	if (!formatted) {
		return null;
	}

	return (
		<div className="flex items-start justify-between gap-4 rounded-md border p-3">
			<div>
				<div className="text-xs text-muted-foreground">{name}</div>

				<div className="font-mono text-sm">{String(value)}</div>
			</div>

			<div className="text-right text-sm">{formatted}</div>
		</div>
	);
}

export default function JWTInspector() {
	const [token, setToken] = useState("");
	const [secret, setSecret] = useState("");

	const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

	const [verifyError, setVerifyError] = useState<string | null>(null);

	const parsed = useMemo(() => {
		if (!token.trim()) {
			return {
				data: null,
				error: null,
			};
		}

		try {
			return {
				data: parseJwt(token),
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error: error instanceof Error ? error.message : "Invalid JWT",
			};
		}
	}, [token]);

	const algorithm =
		typeof parsed.data?.header.alg === "string"
			? parsed.data.header.alg
			: null;

	const isHmac =
		algorithm === "HS256" || algorithm === "HS384" || algorithm === "HS512";

	const expirationStatus = useMemo(() => {
		const exp = parsed.data?.payload.exp;

		if (typeof exp !== "number") {
			return null;
		}

		const now = Math.floor(Date.now() / 1000);

		if (now >= exp) {
			return "expired";
		}

		return "valid";
	}, [parsed.data]);

	async function copy(value: string) {
		await navigator.clipboard.writeText(value);
	}

	function clear() {
		setToken("");
		setSecret("");
		setVerifyResult(null);
		setVerifyError(null);
	}

	async function verifySignature() {
		if (!parsed.data) {
			return;
		}

		if (!secret) {
			setVerifyError("Enter the HMAC secret first.");
			return;
		}

		setVerifyError(null);
		setVerifyResult(null);

		try {
			const result = await invoke<VerifyResult>("verify_jwt_hmac", {
				token: token.trim(),
				secret,
			});

			setVerifyResult(result);
		} catch (error) {
			setVerifyError(String(error));
		}
	}

	return (
		<div className="flex h-full flex-col gap-4 p-4">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div>
					<h1 className="flex items-center gap-2 text-2xl font-semibold">
						<ShieldCheck className="h-6 w-6" />
						JWT Inspector
					</h1>

					<p className="mt-1 text-sm text-muted-foreground">
						Decode, inspect and verify JSON Web Tokens locally.
					</p>
				</div>

				<Button
					variant="outline"
					size="sm"
					onClick={clear}
					disabled={!token}
				>
					<Trash2 className="mr-2 h-4 w-4" />
					Clear
				</Button>
			</div>

			{/* Token Input */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Encoded JWT</CardTitle>

					<CardDescription>
						Paste your JWT. The token is decoded locally and is not
						sent anywhere.
					</CardDescription>
				</CardHeader>

				<CardContent>
					<Textarea
						value={token}
						onChange={(event) => {
							setToken(event.target.value);
							setVerifyResult(null);
							setVerifyError(null);
						}}
						placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
						className="min-h-28 resize-y font-mono text-sm"
						spellCheck={false}
					/>

					{parsed.error && (
						<div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
							<CircleAlert className="h-4 w-4 shrink-0" />
							{parsed.error}
						</div>
					)}
				</CardContent>
			</Card>

			{parsed.data && (
				<div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
					{/* LEFT */}
					<Card className="min-w-0">
						<CardHeader>
							<div className="flex items-center justify-between">
								<div>
									<CardTitle className="text-base">
										Decoded Token
									</CardTitle>

									<CardDescription>
										JWT contains header, payload and
										signature.
									</CardDescription>
								</div>

								<div className="flex items-center gap-2">
									{algorithm && (
										<Badge variant="secondary">
											{algorithm}
										</Badge>
									)}

									{expirationStatus === "valid" && (
										<Badge
											variant="outline"
											className="gap-1"
										>
											<CheckCircle2 className="h-3 w-3" />
											Not expired
										</Badge>
									)}

									{expirationStatus === "expired" && (
										<Badge variant="destructive">
											Expired
										</Badge>
									)}
								</div>
							</div>
						</CardHeader>

						<CardContent>
							<Tabs defaultValue="payload">
								<TabsList>
									<TabsTrigger value="header">
										Header
									</TabsTrigger>

									<TabsTrigger value="payload">
										Payload
									</TabsTrigger>

									<TabsTrigger value="signature">
										Signature
									</TabsTrigger>
								</TabsList>

								<TabsContent value="header" className="mt-4">
									<JsonViewer
										value={parsed.data.header}
										onCopy={() =>
											copy(
												prettyJson(parsed.data?.header),
											)
										}
									/>
								</TabsContent>

								<TabsContent value="payload" className="mt-4">
									<JsonViewer
										value={parsed.data.payload}
										onCopy={() =>
											copy(
												prettyJson(
													parsed.data?.payload,
												),
											)
										}
									/>
								</TabsContent>

								<TabsContent value="signature" className="mt-4">
									<div className="relative rounded-lg border bg-muted/30 p-4">
										<Button
											variant="ghost"
											size="icon"
											className="absolute right-2 top-2"
											onClick={() =>
												copy(
													parsed.data?.signature ??
														"",
												)
											}
										>
											<Clipboard className="h-4 w-4" />
										</Button>

										<div className="break-all pr-10 font-mono text-sm">
											{parsed.data.signature}
										</div>
									</div>
								</TabsContent>
							</Tabs>
						</CardContent>
					</Card>

					{/* RIGHT */}
					<div className="space-y-4">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Clock3 className="h-4 w-4" />
									Registered Claims
								</CardTitle>
							</CardHeader>

							<CardContent className="space-y-2">
								<ClaimTime
									name="Issued At (iat)"
									value={parsed.data.payload.iat}
								/>

								<ClaimTime
									name="Not Before (nbf)"
									value={parsed.data.payload.nbf}
								/>

								<ClaimTime
									name="Expires At (exp)"
									value={parsed.data.payload.exp}
								/>

								<SimpleClaim
									name="Subject"
									claim="sub"
									payload={parsed.data.payload}
								/>

								<SimpleClaim
									name="Issuer"
									claim="iss"
									payload={parsed.data.payload}
								/>

								<SimpleClaim
									name="Audience"
									claim="aud"
									payload={parsed.data.payload}
								/>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<KeyRound className="h-4 w-4" />
									Verify Signature
								</CardTitle>

								<CardDescription>
									Verification is different from decoding.
								</CardDescription>
							</CardHeader>

							<CardContent className="space-y-3">
								{!isHmac && (
									<div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
										Algorithm{" "}
										<strong>
											{algorithm ?? "unknown"}
										</strong>{" "}
										requires a public key/JWK verifier. This
										version currently verifies HMAC
										HS256/384/512.
									</div>
								)}

								{isHmac && (
									<>
										<Input
											type="password"
											value={secret}
											onChange={(event) =>
												setSecret(event.target.value)
											}
											placeholder="HMAC secret"
											autoComplete="off"
										/>

										<Button
											className="w-full"
											onClick={verifySignature}
										>
											<ShieldCheck className="mr-2 h-4 w-4" />
											Verify {algorithm}
										</Button>
									</>
								)}

								{verifyResult?.valid && (
									<div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm">
										<CheckCircle2 className="h-4 w-4" />
										Signature is valid
									</div>
								)}

								{verifyError && (
									<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
										<CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
										<span>{verifyError}</span>
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			)}
		</div>
	);
}

function JsonViewer({ value, onCopy }: { value: unknown; onCopy: () => void }) {
	return (
		<div className="relative max-h-[520px] overflow-auto rounded-lg border bg-muted/30 p-4">
			<Button
				variant="ghost"
				size="icon"
				className="absolute right-2 top-2"
				onClick={onCopy}
			>
				<Clipboard className="h-4 w-4" />
			</Button>

			<pre className="overflow-x-auto pr-10 font-mono text-sm leading-6">
				{prettyJson(value)}
			</pre>
		</div>
	);
}

function SimpleClaim({
	name,
	claim,
	payload,
}: {
	name: string;
	claim: string;
	payload: JsonObject;
}) {
	const value = payload[claim];

	if (value === undefined) {
		return null;
	}

	return (
		<div className="rounded-md border p-3">
			<div className="text-xs text-muted-foreground">
				{name} ({claim})
			</div>

			<div className="mt-1 break-all font-mono text-sm">
				{typeof value === "string" ? value : JSON.stringify(value)}
			</div>
		</div>
	);
}
