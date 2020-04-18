import * as vscode from 'vscode';
import * as ch from 'child_process';
import PcLintProvider from './pcLintProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('Lint It is now active!');

	let linter = new PcLintProvider();	
	linter.activate(context.subscriptions);
	vscode.languages.registerCodeActionsProvider('c', linter);

	let disposable = vscode.commands.registerCommand('lintIt.execute', () => {
		var channel = vscode.window.createOutputChannel('Lint It');
		channel.show();
		channel.clear();
		vscode.workspace.saveAll();

		var workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : "";

		var process = ch.spawn("lint.bat", undefined, {cwd: workspaceFolder});
		process.on('error', (error: Error) => {
			console.log(error);
			vscode.window.showInformationMessage(`Cannot Lint the c file.`);
		});

		let decoded = '';
		process.stdout.on('data', (data: Buffer) => {
			decoded += data;
		});
		process.stdout.on('end', () => {
			var lines = decoded.split("\r\n");
			lines.forEach(line => {
				if ((line.trim() === "") || (line.startsWith('---'))) {
					return;
				}

				channel.appendLine(line);
			});
		});
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
