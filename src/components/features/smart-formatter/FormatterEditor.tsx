import Editor, { type OnMount } from "@monaco-editor/react";
import { memo } from "react";

type FormatterEditorProps = {
	language: string;
	onMount: OnMount;
	onChange: (value: string | undefined) => void;
};

const FormatterEditor = memo(
	({
		language,
		onMount,
		onChange,
	}: FormatterEditorProps): React.JSX.Element => {
		const monacoLanguage =
			language === "curl" || language === "unknown"
				? "plaintext"
				: language;

		return (
			<Editor
				height="100%"
				theme="vs-dark"
				defaultLanguage="plaintext"
				language={monacoLanguage}
				defaultValue=""
				onMount={onMount}
				onChange={onChange}
				options={{
					minimap: {
						enabled: false,
					},

					fontSize: 14,
					lineHeight: 22,

					wordWrap: "on",

					automaticLayout: true,

					scrollBeyondLastLine: false,

					smoothScrolling: true,

					folding: true,

					bracketPairColorization: {
						enabled: true,
					},

					renderWhitespace: "selection",

					padding: {
						top: 16,
						bottom: 16,
					},

					overviewRulerBorder: false,

					stickyScroll: {
						enabled: false,
					},
				}}
			/>
		);
	},
);

FormatterEditor.displayName = "FormatterEditor";

export default FormatterEditor;
