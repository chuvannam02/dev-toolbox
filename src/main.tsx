import ReactDOM from "react-dom/client";
import App from "./App";

// StrictMode intentionally mounts effects twice in development. This desktop app
// opens local DB/API-backed tools, so avoiding that duplicate work improves dev startup.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<App />,
);
