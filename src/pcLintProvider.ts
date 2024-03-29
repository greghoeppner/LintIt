import * as vscode from 'vscode';
import * as config from './configuration';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as pathExtension from './pathExtension';
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
				.filter((d) => { 
					let fileName = this.getActualFileName(d);
					return this.isFileLintable(fileName) && this.isDocumentInSource(fileName);
				 })
				.map(d => this.lintDocument(d));

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
				vscode.window.showInformationMessage(`Cannot Lint the file.`);
			}).finally(() => {
				release();
			});
		}).catch((reason) => console.log('mutex problem: ' + reason));
	}

	private isDocumentC(document: vscode.TextDocument) {
		// Allow the detection of c++ files so that header files are also detected.
		return (document?.languageId === 'c') || (document?.languageId === 'cpp');
	}

	private isFileLintable(filename: string): boolean {
		var settings = vscode.workspace.getConfiguration("lintit");

		if (settings.configurations.length > 0) {
			for (const configuration of settings.configurations) {
				if (configuration.hasOwnProperty('extensions')) {
					for (const extension of configuration.extensions) {
						if (path.extname(filename).toUpperCase() === extension.toUpperCase()) {
							return true;
						}
					}
				}
			}

			return false;
		}
	
		return (path.extname(filename).toUpperCase() === '.c'.toUpperCase());
	}
	
	private lintDocument(textDocument: vscode.TextDocument): Promise<Map<string, vscode.Diagnostic[]>> {
		return new Promise((resolve, reject) => {
			let fileName = this.getActualFileName(textDocument);
				console.log('lintDocument: ' + fileName);
			let decoded = '';
			let diagnostics = new Map<string, vscode.Diagnostic[]>();
			diagnostics.set(textDocument.uri.fsPath, []);
	
			let options = { cwd: path.dirname(fileName) };
			let args = this.getLintArgs(textDocument);
	
			let childProcess = cp.spawn(config.getPcLintPath(), args, options);
			childProcess.on('error', (error: Error) => {
				reject(error);
			});
			if (childProcess.pid) {
				childProcess.stdout.on('data', (data: Buffer) => {
					decoded += data;
				});
				childProcess.stdout.on('end', () => {
					var lines = decoded.split(os.EOL);
					lines.forEach(line => {
						if (line.trim() === "") {
							return;
						}

						var re = /^(.*)\(([0-9]*)\):.(Error|Warning|Notice|Note|Info|Supplemental).([0-9]*):.(.*)/igm;
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
		let fileName = this.getActualFileName(textDocument);
		if (!this.isFileLintable(fileName)) {
			return;
		}

		if (!this.isDocumentInSource(fileName)) {
			return;
		}
		console.log('doLint: ' + fileName);

		let decoded = '';
		let diagnostics = new Map<string, vscode.Diagnostic[]>();
		diagnostics.set(textDocument.uri.fsPath, []);

		let options = { cwd: path.dirname(fileName) };
		let args = this.getLintArgs(textDocument);

		let childProcess = cp.spawn(config.getPcLintPath(), args, options);
		childProcess.on('error', (error: Error) => {
			console.log(error);
			vscode.window.showInformationMessage(`Cannot Lint the c file.`);
		});
		if (childProcess.pid) {
			childProcess.stdout.on('data', (data: Buffer) => {
				decoded += data;
			});
			childProcess.stdout.on('end', () => {
				var lines = decoded.split(os.EOL);
				lines.forEach(line => {
					if (line.trim() === "") {
						return;
					}

					var re = /^(.*)\(([0-9]*)\):.(Error|Warning|Notice|Note|Info|Supplemental).([0-9]*):.(.*)/igm;
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
	
	private getActualFileName(textDocument: vscode.TextDocument): string {
		let fileName = textDocument.fileName;
		if (fileName.endsWith('.git')) {
			fileName = fileName.substr(0, fileName.length - 4);
		}
		return fileName;
	}

	private isDocumentInSource(fileName: string): boolean {
		let result = false;
		var settings = vscode.workspace.getConfiguration("lintit");

		if (settings.configurations.length === 0) {
			result = this.isFileInFolders(fileName, settings.sourceFolders);
		} else {
			for (const configuration of settings.configurations) {
				if (this.isFileInFolders(fileName, configuration.sourceFolders)) {
					result = true;
					break;
				}
			}
		}

		return result;
	}

	private isFileInFolders(fileName: string, sourceFolders: any): boolean {
		for (const folder of sourceFolders) {
			let normalizedPath = pathExtension.normalizePath(folder);
			if (fileName.toUpperCase().startsWith(normalizedPath.toUpperCase())) {
				return true;
			}
		}

		return false;
	}
	
	private getLintArgs(textDocument: vscode.TextDocument) {
		let args = ['-elib(0)', '+ffn', '-width(0)', '-hf1', '-u', '-"format=%f(%l): %t %n: %m"'];
		var settings = this.getConfiguration(textDocument);
		settings.includeFolders.forEach((folder: string) => {
			args.push('-i"' + pathExtension.normalizePath(folder) + '"');
		});
		if (settings.hasOwnProperty('libraryIncludeFolders')) {
			settings.libraryIncludeFolders.forEach((folder: string) => {
				args.push('+libdir("' + pathExtension.normalizePath(folder) + '")');
			});
		}
		settings.lintFiles.forEach((lntFile: string) => {
			args.push('"' + pathExtension.normalizePath(lntFile) + '"');
		});
		args.push(this.getActualFileName(textDocument));

		return args;
	}

	private getConfiguration(textDocument: vscode.TextDocument): any {
		var settings = vscode.workspace.getConfiguration("lintit");

		if (settings.configurations.length === 0) {
			return settings;
		}

		for (const configuration of settings.configurations) {
			if (this.isFileInFolders(this.getActualFileName(textDocument), configuration.sourceFolders)) {
				return configuration;
			}
		}
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
					var lines = decoded.split(os.EOL);
					lines.forEach(line => {
						if (line.trim() === "") {
							return;
						}

						var re = /^(.*)\(([0-9]*)\):.(Error|Warning|Notice|Note|Info|Supplemental).([0-9]*):.(.*)/igm;
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
				var lines = decoded.split(os.EOL);
				lines.forEach(line => {
					if (line.trim() === "") {
						return;
					}

					var re = /^(.*)\(([0-9]*)\):.(Error|Warning|Notice|Note|Info|Supplemental).([0-9]*):.(.*)/igm;
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
