import * as pathExtension from './pathExtension';
import * as vscode from 'vscode';

export function getPcLintPath(): string {
    return pathExtension.normalizePath(vscode.workspace.getConfiguration("lintit").pcLintLocation);
}