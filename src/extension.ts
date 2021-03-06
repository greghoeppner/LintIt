import * as vscode from 'vscode';
import * as ch from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import pcLintProvider from './pcLintProvider';

let numberOfIssues = 0;

export function activate(context: vscode.ExtensionContext) {
	console.log('Lint It is now active!');

	let linter = new pcLintProvider();	
	linter.activate(context.subscriptions);
	vscode.languages.registerCodeActionsProvider('c', linter);

	var channel = vscode.window.createOutputChannel('Lint It');

	let disposable = vscode.commands.registerCommand('lintIt.execute', () => {
		channel.show();
		channel.clear();
		vscode.workspace.saveAll();

		var workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : "";

		if (vscode.workspace.getConfiguration("lintit").legacyMode) {
			lintFilesLegacy(workspaceFolder, channel);
		} else {
			numberOfIssues = 0;
			lintFiles(workspaceFolder, channel);
		}
	});

	context.subscriptions.push(disposable);
}

function lintFiles(workspaceFolder: string, channel: vscode.OutputChannel) {
	var settings = vscode.workspace.getConfiguration("lintit");
	let promises = new Array<Promise<string[]>>();

	for (const sourceFolder of settings.sourceFolders) {
		lintFolder(sourceFolder, workspaceFolder, promises);
	}

	Promise.all(promises)
		.then(lintResults => {
			for (let index = 0; index < lintResults.length; index++) {
				const lines = lintResults[index];
				for (const line of lines) {
					channel.appendLine(line);
				}
			}
			channel.appendLine('Total PC-Lint Warnings: ' + numberOfIssues);
		})
		.catch(reason => {
			vscode.window.showInformationMessage(reason);
		});
}

function lintFolder(folder: string, workspaceFolder: string, promises: Promise<string[]>[]) {
	let absolutePath = normalizePath(folder);

	let files = fs.readdirSync(absolutePath, { withFileTypes: true });

	for (const file of files) {
		if (file.isDirectory()) {
			lintFolder(path.join(absolutePath, file.name), workspaceFolder, promises);
		} else if (path.extname(file.name).toUpperCase() === '.c'.toUpperCase()) {
			promises.push(executeLint(path.join(absolutePath, file.name)));
		}
	}
}

function normalizePath(pathText: string): string {
	let workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : "";
	if (pathText.startsWith('${workspaceFolder')) {
		let absolutePath = pathText.replace('${workspaceFolder}', workspaceFolder);
		return absolutePath.replace('/', '\\');
	} else {
		return pathText.replace('/', '\\');
	}
}

async function executeLint(documentName: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		let options = { cwd: path.dirname(documentName) };
		let args = getLintArgs(documentName);
		let output: string[] = [];
		output.push('Linting file ' + documentName + ':');
		let decoded = '';
		let childProcess = ch.spawn(vscode.workspace.getConfiguration("lintit").pcLintLocation, args, options);
	
		childProcess.on('error', (error: Error) => {
			console.log(error);
			reject(`Cannot Lint the c file ` + documentName);
		});
		if (childProcess.pid) {
			childProcess.stdout.on('data', (data: Buffer) => {
				decoded += data;
			});
			childProcess.stdout.on('end', () => {
				var lines = decoded.split("\r\n");
				for (let index = 0; index < lines.length; index++) {
					const line = lines[index];

					if ((line.trim() === "") || (line.startsWith('---'))) {
						continue;
					}
		
					numberOfIssues++;
					output.push('  ' + line);
				}

				output.push('');
				resolve(output);
			});
		}
	});
}

function getLintArgs(documentName: string) {
	let args = ['-elib(0)', '+ffn', '-width(0)', '-hf1', '-u', '-"format=%f(%l): %t %n: %m"'];
	var settings = vscode.workspace.getConfiguration("lintit");
	settings.includeFolders.forEach((folder: string) => {
		args.push('-i"' + normalizePath(folder) + '"');
	});
	settings.lintFiles.forEach((lntFile: string) => {
		args.push('"' + normalizePath(lntFile) + '"');
	});
	args.push(documentName);

	return args;
}

function lintFilesLegacy(workspaceFolder: string, channel: vscode.OutputChannel) {
	var process = ch.spawn("lint.bat", undefined, { cwd: workspaceFolder });
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
}

export function deactivate() {}

