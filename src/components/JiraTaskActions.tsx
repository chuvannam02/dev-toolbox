import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { ChevronRight, Clock3, ExternalLink, Plus, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

type Project = { key: string; name: string };
type Issue = { key: string; summary: string; issueType: string; status: string; url: string };
type Detail = Issue & { description: string; assignee: string; labels: string[] };
type User = { accountId: string; displayName: string; isCurrentUser: boolean };
const tags = ["fe", "be", "bug", "feature", "refactor", "devops", "qa"];

export default function JiraTaskActions() {
	const [mode, setMode] = useState<"create" | "log">("create");
	const [projects, setProjects] = useState<Project[]>([]); const [project, setProject] = useState("");
	const [children, setChildren] = useState<Issue[]>([]); const [path, setPath] = useState<Issue[]>([]);
	const [search, setSearch] = useState(""); const [detail, setDetail] = useState<Detail | null>(null);
	const [users, setUsers] = useState<User[]>([]); const [assignee, setAssignee] = useState("");
	const [summary, setSummary] = useState(""); const [description, setDescription] = useState(""); const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [hours, setHours] = useState("1"); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
	const selected = path[path.length - 1];
	const loadChildren = async (parentKey?: string, term = search) => { if (!project) return; setBusy(true); try { setChildren(await invoke<Issue[]>("get_jira_child_issues", { projectKey: project, parentKey: parentKey ?? null, search: term || null })); } catch (e) { setMessage(String(e)); } finally { setBusy(false); } };
	useEffect(() => { invoke<Project[]>("get_jira_projects").then(setProjects).catch((e) => setMessage(String(e))); }, []);
	useEffect(() => { if (project) { setPath([]); setDetail(null); void loadChildren(undefined, ""); } }, [project]);
	useEffect(() => { if (!selected || mode !== "create") return; invoke<User[]>("get_jira_assignable_users", { projectKey: project, issueKey: selected.key }).then((v) => { setUsers(v); setAssignee(v.find((u) => u.isCurrentUser)?.accountId ?? ""); }).catch((e) => setMessage(String(e))); }, [selected?.key, project, mode]);
	const open = (issue: Issue) => { setPath((current) => [...current, issue]); setDetail(null); void loadChildren(issue.key, ""); };
	const jump = (index: number) => { const next = path.slice(0, index + 1); setPath(next); setDetail(null); void loadChildren(next[next.length - 1]?.key, ""); };
	const showDetail = async (issue: Issue) => { setBusy(true); try { setDetail(await invoke<Detail>("get_jira_issue_detail", { issueKey: issue.key })); } catch (e) { setMessage(String(e)); } finally { setBusy(false); } };
	const create = async () => { if (!selected) return; setBusy(true); try { const issue = await invoke<Issue>("create_jira_subtask", { input: { projectKey: project, parentKey: selected.key, summary, description, assigneeAccountId: assignee || null, labels: selectedTags } }); setSummary(""); setDescription(""); setSelectedTags([]); setMessage(`Đã tạo ${issue.key}.`); void loadChildren(selected.key, ""); } catch (e) { setMessage(String(e)); } finally { setBusy(false); } };
	const log = async () => { if (!selected) return; setBusy(true); try { await invoke("add_jira_worklog", { input: { issueKey: selected.key, timeSpentSeconds: Math.round(Number(hours) * 3600), started: new Date().toISOString().replace("Z", "+0000"), comment: description } }); setDescription(""); setMessage(`Đã log ${hours}h cho ${selected.key}.`); } catch (e) { setMessage(String(e)); } finally { setBusy(false); } };
	return <div className="space-y-5">
		{message && <div className="rounded-md border p-3 text-sm">{message}</div>}
		<div className="flex gap-2"><Button variant={mode === "create" ? "default" : "outline"} onClick={() => setMode("create")}>Tạo subtask</Button><Button variant={mode === "log" ? "default" : "outline"} onClick={() => setMode("log")}>Log work</Button></div>
		<Card><CardHeader><CardTitle>Chọn task theo cấu trúc</CardTitle><CardDescription>Tree lazy loading: chỉ tải task con khi bạn mở node. Bấm mã task để xem chi tiết.</CardDescription></CardHeader><CardContent className="space-y-3">
			<select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={project} onChange={(e) => setProject(e.target.value)}><option value="">Chọn Space / project…</option>{projects.map((x) => <option value={x.key} key={x.key}>{x.key} — {x.name}</option>)}</select>
			{project && <><div className="flex gap-2"><Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void loadChildren(selected?.key)} placeholder="Tìm theo mã hoặc tên trong cấp hiện tại…" /><Button size="icon" variant="outline" onClick={() => void loadChildren(selected?.key)}><Search className="size-4" /></Button></div><div className="flex flex-wrap items-center gap-1 text-sm"><button onClick={() => { setPath([]); void loadChildren(undefined); }} className="rounded bg-muted px-2 py-1">{project}</button>{path.map((x, i) => <span className="flex items-center" key={x.key}><ChevronRight className="size-4" /><button className="rounded bg-muted px-2 py-1" onClick={() => jump(i)}>{x.key}</button></span>)}</div><div className="rounded border">{children.length ? children.map((x) => <div key={x.key} className="flex items-center justify-between border-b p-3 last:border-0 hover:bg-muted"><span><button className="font-semibold text-primary underline" onClick={() => void showDetail(x)}>{x.key}</button><button className="ml-2 text-left" onClick={() => open(x)}>{x.summary}</button></span><Button size="icon" variant="ghost" title="Mở task con" onClick={() => open(x)}><ChevronRight className="size-4" /></Button></div>) : <p className="p-3 text-sm text-muted-foreground">Không có task phù hợp.</p>}</div></>}
		</CardContent></Card>
		{detail && <Card><CardHeader><CardTitle>{detail.key} — {detail.summary}</CardTitle><CardDescription>{detail.issueType} · {detail.status} · Assignee: {detail.assignee}</CardDescription></CardHeader><CardContent className="space-y-3"><p className="whitespace-pre-wrap text-sm">{detail.description || "Không có description."}</p>{detail.labels.length > 0 && <p className="text-sm text-muted-foreground">Tags: {detail.labels.join(", ")}</p>}<a className="inline-flex items-center text-sm text-primary underline" href={detail.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 size-4" />Mở trên Jira</a></CardContent></Card>}
		<Card><CardHeader><CardTitle>{mode === "create" ? "Tạo subtask" : "Log work"}</CardTitle><CardDescription>{selected ? `${selected.key} — ${selected.summary}` : "Chọn task trước."}</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{mode === "create" ? <><div><Label>Tên task</Label><Input value={summary} onChange={(e) => setSummary(e.target.value)} /></div><div><Label>Assignee</Label><select className="mt-1 flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Chưa gán</option>{users.map((x) => <option value={x.accountId} key={x.accountId}>{x.isCurrentUser ? "Tôi — " : ""}{x.displayName}</option>)}</select></div><div className="md:col-span-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div><div className="md:col-span-2 flex flex-wrap gap-2">{tags.map((tag) => <Button type="button" size="sm" key={tag} variant={selectedTags.includes(tag) ? "default" : "outline"} onClick={() => setSelectedTags((current) => current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag])}>{tag}</Button>)}</div><Button disabled={!selected || !summary.trim() || busy} onClick={() => void create()}><Plus className="mr-2 size-4" />Tạo subtask</Button></> : <><div><Label>Số giờ</Label><Input type="number" min="0.01" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} /></div><div className="md:col-span-2"><Label>Ghi chú</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div><Button disabled={!selected || Number(hours) <= 0 || busy} onClick={() => void log()}><Clock3 className="mr-2 size-4" />Log work</Button></>}</CardContent></Card>
	</div>;
}
