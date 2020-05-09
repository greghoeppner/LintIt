import * as vscode from 'vscode';
import * as ch from 'child_process';
import PcLintProvider from './pcLintProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('Lint It is now active!');

	let linter = new PcLintProvider();	
	linter.activate(context.subscriptions);
	vscode.languages.registerCodeActionsProvider('c', linter);

	var channel = vscode.window.createOutputChannel('Lint It');

	let disposable = vscode.commands.registerCommand('lintIt.execute', () => {
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
		process.on('close', (code: number) => {
			var lines = decoded.split("\r\n");
			var count = 0;
			lines.forEach(line => {
				if ((line.trim() === "") || (line.startsWith('---'))) {
					return;
				}

				channel.appendLine(line);
				count++;
			});
			if (count === 0) {
				channel.appendLine('No lint exceptions found');
			}
		});
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
