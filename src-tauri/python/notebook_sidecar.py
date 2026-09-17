import argparse
import asyncio
import json
import os
import queue
import sys
import websockets
from jupyter_client.manager import AsyncKernelManager

# =========================================================================
# FIX: Chặn Jupyter Client tự động tìm kiếm Global Kernel trên máy tính
# =========================================================================
class BundledKernelManager(AsyncKernelManager):
    """
    Ghi đè hoàn toàn cơ chế tạo command của Jupyter.
    Ép buộc Kernel phải chạy đúng file python.exe nhúng của Tauri,
    bỏ qua mọi KernelSpec 'python3' đang cài sẵn trên Windows.
    """
    def __init__(self, python_exe, **kwargs):
        super().__init__(**kwargs)
        self.python_exe = python_exe

    def format_kernel_cmd(self, extra_arguments=None):
        cmd = [
            self.python_exe,
            "-m",
            "ipykernel_launcher",
            "-f",
            "{connection_file}"
        ]
        if extra_arguments:
            cmd.extend(extra_arguments)
        return [c.format(connection_file=self.connection_file) for c in cmd]
# =========================================================================

class KernelSession:
    """
    Giữ 1 kernel Python sống suốt vòng đời sidecar.
    """
    def __init__(self, python_exe: str):
        self.python_exe = python_exe
        self.km: AsyncKernelManager | None = None
        self.client = None
        self.ready = asyncio.Event()
        self.lock = asyncio.Lock()

    async def start(self):
        self.ready.clear()
        print(f"[Kernel] Starting with Python: {self.python_exe}", flush=True)

        env = os.environ.copy()
        env.pop("PYTHONHOME", None)
        env.pop("PYTHONPATH", None) 
        
        python_dir = os.path.dirname(self.python_exe)
        site_packages = os.path.join(python_dir, "Lib", "site-packages")
        env["PYTHONPATH"] = site_packages

        # Dùng Class Custom vừa tạo thay vì AsyncKernelManager mặc định
        self.km = BundledKernelManager(python_exe=self.python_exe)

        await self.km.start_kernel(env=env)
        self.client = self.km.client()
        self.client.start_channels()

        print("[Kernel] Waiting for kernel ready...", flush=True)
        await self.client.wait_for_ready(timeout=60)
        self.ready.set()
        print("[Kernel] Ready", flush=True)

    async def restart(self):
        print("[Kernel] Restarting...", flush=True)
        self.ready.clear()

        if self.client:
            try:
                self.client.stop_channels()
            except Exception:
                pass
        if self.km:
            try:
                await self.km.shutdown_kernel(now=True)
            except Exception:
                pass

        self.client = None
        self.km = None
        await self.start()
        print("[Kernel] Restarted", flush=True)

    async def execute(self, code: str, cell_id: str, send):
        try:
            await asyncio.wait_for(self.ready.wait(), timeout=15.0)
        except asyncio.TimeoutError:
            await send(
                cell_id, 
                "error", 
                "❌ LỖI: Kernel không phản hồi. Vui lòng xem màn hình Terminal để biết chi tiết.\n", 
                done=True, 
                ok=False
            )
            return

        async with self.lock:
            if not self.client:
                raise RuntimeError("Kernel client chưa sẵn sàng")

            msg_id = self.client.execute(code)
            
            got_reply = False
            got_idle = False
            execution_count = None
            is_ok = True

            print(f"[Kernel] Bắt đầu execute (msg_id: {msg_id})", flush=True)

            while not (got_reply and got_idle):
                try:
                    msg = await self.client.get_iopub_msg(timeout=0.05)
                    parent_id = msg.get("parent_header", {}).get("msg_id")
                    
                    if parent_id == msg_id:
                        msg_type = msg["header"]["msg_type"]
                        content = msg.get("content", {})

                        if msg_type == "stream":
                            await send(cell_id, "stream", content.get("text", ""))

                        elif msg_type in ("execute_result", "display_data"):
                            text = content.get("data", {}).get("text/plain", "")
                            if text:
                                await send(cell_id, "result", text + "\n")

                        elif msg_type == "error":
                            traceback = "\n".join(content.get("traceback", []))
                            await send(cell_id, "error", traceback + "\n")

                        elif msg_type == "status" and content.get("execution_state") == "idle":
                            got_idle = True
                except queue.Empty:
                    pass
                except Exception as e:
                    pass 

                try:
                    reply = await self.client.get_shell_msg(timeout=0.05)
                    if reply.get("parent_header", {}).get("msg_id") == msg_id:
                        content = reply.get("content", {})
                        execution_count = content.get("execution_count")
                        is_ok = (content.get("status") == "ok")
                        got_reply = True
                except queue.Empty:
                    pass
                except Exception as e:
                    pass 
                    
                await asyncio.sleep(0.01)

            print(f"[Kernel] Execute xong (msg_id: {msg_id})", flush=True)
            
            await send(
                cell_id,
                "status",
                "",
                done=True,
                ok=is_ok,
                execution_count=execution_count,
            )


async def main(port: int, python_exe: str):
    session = KernelSession(python_exe)

    async def handler(websocket):
        async def send(cell_id, kind, text, done=False, ok=True, execution_count=None):
            payload = {
                "type": kind,
                "cell_id": cell_id,
                "text": text,
                "done": done,
                "ok": ok,
                "execution_count": execution_count,
            }
            try:
                await websocket.send(json.dumps(payload))
            except websockets.exceptions.ConnectionClosed:
                pass 

        # Đã bọc Try-Catch ở đây để ẩn lỗi rác "connection handler failed" khi F5 lại giao diện Tauri
        try:
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                msg_type = msg.get("type")
                cell_id = msg.get("cell_id", "")

                if msg_type == "execute":
                    try:
                        await session.execute(msg.get("code", ""), cell_id, send)
                    except Exception as exc:
                        print(f"[Kernel] Execute error: {exc}", flush=True)
                        await send(cell_id, "error", f"Kernel error: {exc}\n", done=True, ok=False)

                elif msg_type == "restart":
                    try:
                        await session.restart()
                        await send(cell_id, "status", "Kernel restarted\n", done=True, ok=True)
                    except Exception as exc:
                        print(f"[Kernel] Restart error: {exc}", flush=True)
                        await send(cell_id, "error", f"Restart error: {exc}\n", done=True, ok=False)
        except websockets.exceptions.ConnectionClosed:
            print("[Sidecar] UI Client disconnected.", flush=True)

    kernel_task = asyncio.create_task(session.start())

    def kernel_done(task):
        try:
            task.result()
        except Exception as exc:
            print(f"[Kernel] Startup failed: {exc}", flush=True)

    kernel_task.add_done_callback(kernel_done)

    async with websockets.serve(handler, "127.0.0.1", port):
        print(f"[Sidecar] Listening on ws://127.0.0.1:{port}", flush=True)
        await asyncio.Future()


if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--python", required=True)
    args = parser.parse_args()

    asyncio.run(main(args.port, args.python))