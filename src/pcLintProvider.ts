import * as vscode from 'vscode';
import * as cp from 'child_process';

export default class PcLintProvider implements vscode.CodeActionProvider {
    private static commandId: string = 'pcLintProvider.runCodeAction';
	private command: vscode.Disposable;
	private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.command = vscode.commands.registerCommand(PcLintProvider.commandId, this.runCodeAction, this);
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection();
    }

    public activate(subscriptions: vscode.Disposable[]) {
		subscriptions.push(this);

		vscode.workspace.onDidOpenTextDocument(this.doLint, this, subscriptions);
		vscode.workspace.onDidCloseTextDocument((textDocument)=> {
			this.diagnosticCollection.delete(textDocument.uri);
		}, null, subscriptions);

		// Lint document on save
		vscode.workspace.onDidSaveTextDocument(this.doLint, this);

		// Lint all the open documents.
		vscode.workspace.textDocuments.forEach(this.doLint, this);
	}

	public dispose(): void {
		this.diagnosticCollection.clear();
		this.diagnosticCollection.dispose();
		this.command.dispose();
    }
    
    private doLint(textDocument: vscode.TextDocument) {
		if (textDocument.languageId !== 'c') {
			return;
		}
		
		let decoded = '';
		let diagnostics = new Map<string, vscode.Diagnostic[]>();
		diagnostics.set(textDocument.uri.fsPath, []);

        var workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : "";
		let options = workspaceFolder ? { cwd: workspaceFolder } : undefined;
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
						let diagnostic = new vscode.Diagnostic(range,message,severity);
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
		let diagnostic:vscode.Diagnostic = context.diagnostics[0];
		return [{
			title: "Accept PC-lint suggestion",
			command: PcLintProvider.commandId,
			arguments: [document, diagnostic.range, diagnostic.message]
		}];
	}
	
	private runCodeAction(document: vscode.TextDocument, range: vscode.Range, message:string): any {
	}
}