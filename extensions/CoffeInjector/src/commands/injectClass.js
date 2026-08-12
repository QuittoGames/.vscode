// CoffeInjector — orquestrador do comando "Inject Class".
// Único módulo que chama a API de edição do VS Code; tudo abaixo dele é puro.

const vscode = require('vscode');
const path = require('path');
const { parseFile, findPrimaryDeclaration } = require('../java/JavaClassParser');
const ImportManager = require('../java/ImportManager');
const FieldManager = require('../java/FieldManager');
const ConstructorManager = require('../java/ConstructorManager');
const naming = require('../utils/naming');
const workspace = require('../utils/workspace');

/**
 * Cria o item do Quick Pick para uma classe do índice.
 * @param {import('../models/JavaClass').JavaClass} c
 * @returns {vscode.QuickPickItem & {javaClass: import('../models/JavaClass').JavaClass}}
 */
function toQuickPickItem(c) {
    const annotations = c.annotations.length > 0 ? c.annotations.join(', ') : c.kind;
    const detail = c.packageName ? `${c.packageName}  —  ${workspace.relativePath(c.filePath)}` : workspace.relativePath(c.filePath);
    return {
        label: c.name,
        description: annotations,
        detail,
        javaClass: c,
    };
}

/**
 * Executa o fluxo completo de injeção.
 * @param {import('../java/JavaClassScanner').JavaClassScanner} scanner
 * @returns {Promise<void>}
 */
async function runInjectClass(scanner) {
    const env = workspace.validateEnvironment();
    if (!env.ok) {
        vscode.window.showInformationMessage(env.message);
        return;
    }
    const { editor, doc } = env;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'CoffeInjector: Indexando classes Java…' },
        () => scanner.ensureIndex()
    );

    const docText = doc.getText();
    const parsed = parseFile(docText);
    const fileName = path.basename(doc.uri.fsPath);
    const classDecl = findPrimaryDeclaration(parsed, fileName);
    if (!classDecl || classDecl.kind !== 'class') {
        vscode.window.showErrorMessage('Could not find a Java class in the active file.');
        return;
    }

    const candidates = scanner
        .listInjectableClasses()
        .filter((c) => c.filePath !== doc.uri.fsPath);

    if (candidates.length === 0) {
        vscode.window.showInformationMessage('No injectable Java classes found in the workspace.');
        return;
    }

    const items = candidates.map(toQuickPickItem);
    const picked = await vscode.window.showQuickPick(items, {
        title: 'Inject Spring Class',
        placeHolder: 'Search by class name, package, annotation or path…',
        matchOnDescription: true,
        matchOnDetail: true,
    });
    if (!picked) return;

    const dep = picked.javaClass;

    // Nomes já em uso na classe (campos + parâmetros de construtores) para evitar conflito.
    const usedNames = collectUsedNames(docText, classDecl);
    const config = vscode.workspace.getConfiguration('coffeInjector');
    const fieldName = naming.computeFieldName(dep.name, usedNames, {
        stripSuffix: config.get('stripSuffix', true),
    });

    const indent = workspace.detectIndentUnit(docText);

    const importPlan = ImportManager.planImport(docText, dep, parsed.packageName, parsed.imports);
    if (importPlan.skip === 'ambiguous') {
        vscode.window.showErrorMessage(
            `Cannot inject ${dep.name}: a class with the same simple name is already imported.`
        );
        return;
    }

    const fieldPlan = FieldManager.planField(docText, classDecl, dep, fieldName, indent);
    const ctorPlan = ConstructorManager.planConstructor(docText, classDecl, dep, fieldName, indent);

    if (fieldPlan.alreadyInjected || ctorPlan.alreadyInjected) {
        vscode.window.showInformationMessage(`${dep.name} is already injected.`);
        return;
    }

    /** @type {import('../java/ImportManager').EditSpec[]} */
    const edits = [];
    edits.push(...(importPlan.edits || []));

    if (ctorPlan.mode === 'lombok') {
        // Lombok gera o construtor em tempo de compilação: apenas o campo é necessário.
        edits.push(...fieldPlan.edits);
    } else if (ctorPlan.mode === 'create') {
        // Sem construtor: insere campo + construtor num único edit no mesmo offset (atômico).
        edits.push({ offset: classDecl.bodyStart + 1, text: `\n\n${fieldPlan.fieldLine}\n\n${ctorPlan.ctorBlock}` });
    } else {
        // 'extend': campo separado + parâmetro + atribuição no construtor existente.
        edits.push(...fieldPlan.edits);
        edits.push(...ctorPlan.edits);
    }

    if (!(await applyEdits(editor, docText, edits))) {
        vscode.window.showErrorMessage('Failed to modify the file. No changes were applied.');
        return;
    }

    vscode.window.showInformationMessage(`Injected ${dep.name} into ${classDecl.name}.`);
}

/**
 * Coleta nomes já em uso (campos + parâmetros de construtores) para nomeação segura.
 * @param {string} docText
 * @param {object} classDecl
 * @returns {Set<string>}
 */
function collectUsedNames(docText, classDecl) {
    const names = new Set();
    const body = docText.slice(classDecl.bodyStart + 1, classDecl.bodyEnd);
    for (const f of FieldManager.extractFields(body)) names.add(f.name);
    for (const c of classDecl.constructors || []) {
        for (const p of c.params) names.add(p.name);
    }
    return names;
}

/**
 * Aplica os edits de forma atômica (uma única chamada TextEditor.edit).
 * Valida offsets antes; se qualquer validação falhar, nada é aplicado.
 * @param {vscode.TextEditor} editor
 * @param {string} originalText
 * @param {import('../java/ImportManager').EditSpec[]} edits
 * @returns {Promise<boolean>}
 */
async function applyEdits(editor, originalText, edits) {
    const doc = editor.document;

    for (const e of edits) {
        if (e.offset < 0 || e.offset > originalText.length || !Number.isInteger(e.offset)) {
            return false;
        }
    }

    const sorted = [...edits].sort((a, b) => b.offset - a.offset);
    return editor.edit((builder) => {
        for (const e of sorted) {
            builder.insert(doc.positionAt(e.offset), e.text);
        }
    });
}

module.exports = { runInjectClass, toQuickPickItem, applyEdits };
