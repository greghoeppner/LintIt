import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as process from 'process';
import * as path from 'path';
import { Mutex } from 'async-mutex';

export default class pcLintProvider implements vscode.CodeActionProvider {
	private static commandId: string = 'pcLintProvider.runCodeAction';
	private command: vscode.Disposable;
	private diagnosticCollection: vscode.DiagnosticCollection;
	private workspaceFolder: string;
	private mutex = new Mutex();

	constructor() {
		this.command = vscode.commands.registerCommand(pcLintProvider.commandId, this.runCodeAction, this);
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection();
		this.workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : "";
	}

	public dispose(): void {
		this.diagnosticCollection.clear();
		this.diagnosticCollection.dispose();
		this.command.dispose();
	}

	public activate(subscriptions: vscode.Disposable[]) {
		subscriptions.push(this);
		var settings = vscode.workspace.getConfiguration("lintit");

		if (settings.aggressiveMode) {
			vscode.workspace.onDidOpenTextDocument(this.lintAllOpenFiles, this, subscriptions);
			vscode.workspace.onDidCloseTextDocument(this.lintAllOpenFiles, this, subscriptions);
			vscode.workspace.onDidSaveTextDocument(this.lintAllOpenFiles, this);

			// Lint all the open documents.
			this.lintAllOpenFiles(undefined);
		} else {
			if (settings.legacyMode) {
				vscode.workspace.onDidOpenTextDocument(this.doLintLegacy, this, subscriptions);
				vscode.workspace.onDidCloseTextDocument((textDocument) => {
					this.diagnosticCollection.delete(textDocument.uri);
				}, null, subscriptions);

				vscode.workspace.onDidSaveTextDocument(this.doLintLegacy, this);

				// Lint all the open documents.
				vscode.workspace.textDocuments.forEach(this.doLintLegacy, this);
			} else {
				vscode.workspace.onDidOpenTextDocument(this.doLint, this, subscriptions);
				vscode.workspace.onDidCloseTextDocument((textDocument) => {
					this.diagnosticCollection.delete(textDocument.uri);
				}, null, subscriptions);

				vscode.workspace.onDidSaveTextDocument(this.doLint, this);

				// Lint all the open documents.
				vscode.workspace.textDocuments.forEach(this.doLint, this);
			}
		}
	}

	private async lintAllOpenFiles(document: vscode.TextDocument | undefined) {
		this.mutex.acquire().then(async (release) => {
			var promises = vscode.workspace.textDocuments
				.filter(function (document) { return document?.languageId === 'c'; })
				.map(document => this.lintDocumentLegacy(document));

			Promise.all(promises).then((results) => {
				let diagnostics = new Map<string, vscode.Diagnostic[]>();

				results.forEach(result => {
					for (const [key, value] of result.entries()) {
						if (diagnostics.has(key)) {
							diagnostics.get(key)?.concat(value);
						} else {
							diagnostics.set(key, value);
						}
					}
				});

				this.diagnosticCollection.clear();
				for (const [key, value] of diagnostics.entries()) {
					this.diagnosticCollection.set(vscode.Uri.file(key), value);
				}
			}).catch((reason) => {
				console.log(reason);
				vscode.window.showInformationMessage(`Cannot Lint the c file.`);
			}).finally(() => {
				release();
			});
		}).catch((reason) => console.log('mutex problem: ' + reason));
	}

	private lintDocumentLegacy(textDocument: vscode.TextDocument): Promise<Map<string, vscode.Diagnostic[]>> {
		return new Promise((resolve, reject) => {
			let decoded = '';
			let diagnostics = new Map<string, vscode.Diagnostic[]>();
			diagnostics.set(textDocument.uri.fsPath, []);

			let options = this.workspaceFolder ? { cwd: this.workspaceFolder } : undefined;
			let args = [textDocument.fileName];

			let childProcess = cp.spawn('lint.bat', args, options);
			childProcess.on('error', (error: Error) => {
				reject(error);
			});
			if (childProcess.pid) {
				childProcess.stdout.on('data', (data: Buffer) => {
					decoded += data;
				});
				childProcess.stdout.on('end', () => {
					var lines = decoded.split("\r\n");
					lines.forEach(line => {
						if (line.trim() === "") {
							return;
						}

						var re = /^(.*)\(([0-9]*)\):.(Error|Warning|Notice|Note|Info).([0-9]*):.(.*)/gm;
						var result = re.exec(line);
						if (result !== null && result.length > 5) {
							let uri = vscode.Uri.file(result[1]).fsPath;
							if (uri === "\\") {
								uri = textDocument.uri.fsPath;
							}
							let lineNumber = Number.parseInt(result[2]);
							let errorType = result[3];
							let errorCode = result[4];
							let message = result[3] + " " + result[4] + ": " + result[5];

							var severity = vscode.DiagnosticSeverity.Information;
							switch (errorType.toLowerCase()) {
								case "error":
									severity = vscode.DiagnosticSeverity.Error;
									break;
								case "warning":
									severity = vscode.DiagnosticSeverity.Warning;
									break;
							}
							let range = lineNumber <= 0 ? new vscode.Range(0, 0, 1, 0) : new vscode.Range(lineNumber - 1, 0, lineNumber, 0);
							let diagnostic = new vscode.Diagnostic(range, message, severity);
							if (diagnostics.has(uri)) {
								diagnostics.get(uri)?.push(diagnostic);
							} else {
								diagnostics.set(uri, [diagnostic]);
							}
						}
					});
					resolve(diagnostics);
				});
			}
		});
	}

	private doLint(textDocument: vscode.TextDocument) {
		if (textDocument.languageId !== 'c') {
			return;
		}

		if (!this.isDocumentInSource(textDocument)) {
			return;
		}

		let decoded = '';
		let diagnostics = new Map<string, vscode.Diagnostic[]>();
		diagnostics.set(textDocument.uri.fsPath, []);

		let options = { cwd: path.dirname(textDocument.fileName) };
		let args = this.getLintArgs(textDocument);

		let childProcess = cp.spawn(vscode.workspace.getConfiguration("lintit").pcLintLocation, args, options);
		childProcess.on('error', (error: Error) => {
			console.log(error);
			vscode.window.showInformationMessage(`Cannot Lint the c file.`);
		});
		if (childProcess.pid) {
			childProcess.stdout.on('data', (data: Buffer) => {
				decoded += data;
			});
			childProcess.stdout.on('end', () => {
				var lines = decoded.split("\r\n");
				lines.forEach(line => {
					if (line.trim() === "") {
						return;
					}

					var re = /^(.*)\(([0-9]*)\):.(Error|Warning|Notice|Note|Info).([0-9]*):.(.*)/gm;
					var result = re.exec(line);
					if (result !== null && result.length > 5) {
						let uri = vscode.Uri.file(result[1]).fsPath;
						if (uri === "\\") {
							uri = textDocument.uri.fsPath;
						}
						let lineNumber = Number.parseInt(result[2]);
						let errorType = result[3];
						let errorCode = result[4];
						let message = result[3] + " " + result[4] + ": " + result[5];

						var severity = vscode.DiagnosticSeverity.Information;
						switch (errorType.toLowerCase()) {
							case "error":
								severity = vscode.DiagnosticSeverity.Error;
								break;
							case "warning":
								severity = vscode.DiagnosticSeverity.Warning;
								break;
						}
						let range = lineNumber <= 0 ? new vscode.Range(0, 0, 1, 0) : new vscode.Range(lineNumber - 1, 0, lineNumber, 0);
						let diagnostic = new vscode.Diagnostic(range, message, severity);
						if (diagnostics.has(uri)) {
							diagnostics.get(uri)?.push(diagnostic);
						} else {
							diagnostics.set(uri, [diagnostic]);
						}
					}
				});
				for (const [key, value] of diagnostics.entries()) {
					this.diagnosticCollection.set(vscode.Uri.file(key), value);
				}
			});
		}
	}
	
	private isDocumentInSource(textDocument: vscode.TextDocument): boolean {
		let result = false;
		var settings = vscode.workspace.getConfiguration("lintit");
		settings.sourceFolders.forEach((folder: string) => {
			let normalizedPath = this.normalizePath(folder);
			if (textDocument.fileName.toUpperCase().startsWith(normalizedPath.toUpperCase())) {
				result = true;
			}
		});
		return result;
	}
	
	private getLintArgs(textDocument: vscode.TextDocument) {
		let args = ['-elib(0)', '+ffn', '-width(0)', '-hf1', '-u', '-"format=%f(%l): %t %n: %m"'];
		var settings = vscode.workspace.getConfiguration("lintit");
		settings.includeFolders.forEach((folder: string) => {
			args.push('-i"' + this.normalizePath(folder) + '"');
		});
		settings.lintFiles.forEach((lntFile: string) => {
			args.push('"' + this.normalizePath(lntFile) + '"');
		});
		args.push(textDocument.fileName);

		return args;
	}

	private normalizePath(pathText: string): string {
		if (pathText.startsWith('${workspaceFolder')) {
			let absolutePath = pathText.replace('${workspaceFolder}', this.workspaceFolder);
			return absolutePath.replace('/', '\\');
		} else {
			return pathText.replace('/', '\\');
		}
	}

	private doLintLegacy(textDocument: vscode.TextDocument) {
		if (textDocument.languageId !== 'c') {
			return;
		}

		let decoded = '';
		let diagnostics = new Map<string, vscode.Diagnostic[]>();
		diagnostics.set(textDocument.uri.fsPath, []);

		let options = this.workspaceFolder ? { cwd: this.workspaceFolder } : undefined;
		let args = [textDocument.fileName];

		let childProcess = cp.spawn('lint.bat', args, options);
		childProcess.on('error', (error: Error) => {
			console.log(error);
			vscode.window.showInformationMessage(`Cannot Lint the c file.`);
		});
		if (childProcess.pid) {
			childProcess.stdout.on('data', (data: Buffer) => {
				decoded += data;
			});
			childProcess.stdout.on('end', () => {
				var lines = decoded.split("\r\n");
				lines.forEach(line => {
					if (line.trim() === "") {
						return;
					}

					var re = /^(.*)\(([0-9]*)\):.(Error|Warning|Notice|Note|Info).([0-9]*):.(.*)/gm;
					var result = re.exec(line);
					if (result !== null && result.length > 5) {
						let uri = vscode.Uri.file(result[1]).fsPath;
						if (uri === "\\") {
							uri = textDocument.uri.fsPath;
						}
						let lineNumber = Number.parseInt(result[2]);
						let errorType = result[3];
						let errorCode = result[4];
						let message = result[3] + " " + result[4] + ": " + result[5];

						var severity = vscode.DiagnosticSeverity.Information;
						switch (errorType.toLowerCase()) {
							case "error":
								severity = vscode.DiagnosticSeverity.Error;
								break;
							case "warning":
								severity = vscode.DiagnosticSeverity.Warning;
								break;
						}
						let range = lineNumber <= 0 ? new vscode.Range(0, 0, 1, 0) : new vscode.Range(lineNumber - 1, 0, lineNumber, 0);
						let diagnostic = new vscode.Diagnostic(range, message, severity);
						if (diagnostics.has(uri)) {
							diagnostics.get(uri)?.push(diagnostic);
						} else {
							diagnostics.set(uri, [diagnostic]);
						}
					}
				});
				for (const [key, value] of diagnostics.entries()) {
					this.diagnosticCollection.set(vscode.Uri.file(key), value);
				}
			});
		}
	}

	public provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.Command[] {
		return [];
	}

	private runCodeAction(document: vscode.TextDocument, range: vscode.Range, message: string): any {
	}
}
