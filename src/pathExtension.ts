import * as os from 'os';
import * as vscode from 'vscode';

export function normalizePath(pathText: string): string {
	if (os.platform() === 'win32') {
		return normalizePathWindows(pathText);
	} else {
		return normalizePathLinux(pathText);
	}
}

function normalizePathWindows(pathText: string): string {
	let workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : "";
	if (pathText.startsWith('${workspaceFolder')) {
		let absolutePath = pathText.replace('${workspaceFolder}', workspaceFolder);
		return absolutePath.replace('/', '\\');
	} else {
		return pathText.replace('/', '\\');
	}
}

function normalizePathLinux(pathText: string): string {
	let workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : "";
	if (pathText.startsWith('${workspaceFolder')) {
		return pathText.replace('${workspaceFolder}', workspaceFolder);
	} else {
		return pathText;
	}
}
