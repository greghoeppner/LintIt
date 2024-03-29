import * as vscode from 'vscode';
import * as ch from 'child_process';
import * as config from './configuration';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as pathExtension from './pathExtension';
import pcLintProvider from './pcLintProvider';

let numberOfIssues = 0;

export function activate(context: vscode.ExtensionContext) {
	console.log('Lint It is now active!');

	let linter = new pcLintProvider();	
	linter.activate(context.subscriptions);
	vscode.languages.registerCodeActionsProvider(["c","cpp"], linter);

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

	if (settings.configurations.length === 0) {
		lintConfiguration(settings, workspaceFolder, promises);
	} else {
		for (const configuration of settings.configurations) {
			lintConfiguration(configuration, workspaceFolder, promises);
		}	
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
			vscode.window.showInformationMessage(reason, {modal: true});
		});
}

function lintConfiguration(configuration: any, workspaceFolder: string, promises: Promise<string[]>[]) {
	for (const sourceFolder of configuration.sourceFolders) {
		lintFolder(sourceFolder, configuration, workspaceFolder, promises);
	}
}

function lintFolder(folder: string, configuration: any, workspaceFolder: string, promises: Promise<string[]>[]) {
	let absolutePath = pathExtension.normalizePath(folder);

	let files = fs.readdirSync(absolutePath, { withFileTypes: true });

	for (const file of files) {
		if (file.isDirectory()) {
			lintFolder(path.join(absolutePath, file.name), configuration, workspaceFolder, promises);
		} else if (isFileLintable(configuration, file.name)) {
			promises.push(executeLint(path.join(absolutePath, file.name), configuration));
		}
	}
}

function isFileLintable(configuration: any, filename: string): boolean {
	if (configuration.hasOwnProperty('extensions')) {
		for (const extension of configuration.extensions) {
			if (path.extname(filename).toUpperCase() === extension.toUpperCase()) {
				return true;
			}
		}

		return false;
	}

	return (path.extname(filename).toUpperCase() === '.c'.toUpperCase());
}

async function executeLint(documentName: string, configuration: any): Promise<string[]> {
	return new Promise((resolve, reject) => {
		let options = { cwd: path.dirname(documentName) };
		let args = getLintArgs(documentName, configuration);
		let output: string[] = [];
		output.push('Linting file ' + documentName + ':');
		let decoded = '';
		let childProcess = ch.spawn(config.getPcLintPath(), args, options);
	
		childProcess.on('error', (error: Error) => {
			console.log(error);
			reject(`Cannot Lint the file ` + documentName + os.EOL + error);
		});
		if (childProcess.pid) {
			childProcess.stdout.on('data', (data: Buffer) => {
				decoded += data;
			});
			childProcess.stdout.on('end', () => {
				var lines = decoded.split(os.EOL);
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

function getLintArgs(documentName: string, configuration: any) {
	let args = ['-elib(0)', '+ffn', '-width(0)', '-hf1', '-u', '-"format=%f(%l): %t %n: %m"'];
	configuration.includeFolders.forEach((folder: string) => {
		args.push('-i"' + pathExtension.normalizePath(folder) + '"');
	});
	if (configuration.hasOwnProperty('libraryIncludeFolders')) {
		configuration.libraryIncludeFolders.forEach((folder: string) => {
			args.push('+libdir("' + pathExtension.normalizePath(folder) + '")');
		});
	}
	configuration.lintFiles.forEach((lntFile: string) => {
		args.push('"' + pathExtension.normalizePath(lntFile) + '"');
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
		var lines = decoded.split(os.EOL);
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

