// CoffeInjector — utilitários de workspace (acesso ao contexto VS Code + validações).

const vscode = require('vscode');
const path = require('path');
const { detectIndentUnit: formatDetectIndentUnit } = require('./format');

/**
 * Retorna o workspace root (primeira pasta do workspace).
 * @returns {string|null}
 */
function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    return folders[0].uri.fsPath;
}

/**
 * Valida o contexto de execução (workspace + editor Java).
 * @returns {{ok: true, editor: vscode.TextEditor, doc: vscode.TextDocument}
 *          | {ok: false, message: string}}
 */
function validateEnvironment() {
    if (!getWorkspaceRoot()) {
        return { ok: false, message: 'No workspace is currently open.' };
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return { ok: false, message: 'Open a Java class first.' };
    }
    const doc = editor.document;
    if (doc.languageId !== 'java') {
        return { ok: false, message: 'This command can only be used inside Java files.' };
    }
    return { ok: true, editor, doc };
}

/**
 * Detecta a unidade de indentação do arquivo (espaços ou tab).
 * Reexporta a versão pura (format.js) para quem já importava de workspace.
 * @param {string} text
 * @returns {string}
 */
function detectIndentUnit(text) {
    return formatDetectIndentUnit(text);
}

module.exports = {
    getWorkspaceRoot,
    validateEnvironment,
    detectIndentUnit,
    relativePath,
};
