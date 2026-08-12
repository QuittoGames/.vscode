// CoffeInjector — varre o workspace por classes Java e mantém um índice incremental.
// Usa findFiles + FileSystemWatcher; invalida o cache quando arquivos Java mudam.

const vscode = require('vscode');
const path = require('path');
const { parseFile } = require('./JavaClassParser');
const { toJavaClass } = require('../models/JavaClass');

const EXCLUDED_DIRS = [
    'target',
    'build',
    'out',
    '.gradle',
    'node_modules',
    '.git',
    'bin',
    '.idea',
    '.vscode',
];

const EXCLUDE_GLOB = `**/{${EXCLUDED_DIRS.join(',')}}/**`;

const DEBOUNCE_MS = 300;

class JavaClassScanner {
    constructor(context) {
        this.context = context;
        /** @type {Map<string, import('../models/JavaClass').JavaClass[]>} key: uri.toString() */
        this.index = new Map();
        this.indexPromise = null;
        this.debouncers = new Map();

        const watcher = vscode.workspace.createFileSystemWatcher('**/*.java');
        watcher.onDidCreate((uri) => this.scheduleRefresh(uri));
        watcher.onDidChange((uri) => this.scheduleRefresh(uri));
        watcher.onDidDelete((uri) => this.handleDelete(uri));
        context.subscriptions.push(watcher);
    }

    isExcluded(uri) {
        const parts = uri.fsPath.split(path.sep);
        return parts.some((p) => EXCLUDED_DIRS.includes(p));
    }

    scheduleRefresh(uri) {
        if (this.isExcluded(uri)) return;
        const key = uri.toString();
        const existing = this.debouncers.get(key);
        if (existing) clearTimeout(existing);
        this.debouncers.set(
            key,
            setTimeout(() => {
                this.debouncers.delete(key);
                this.refreshFile(uri);
            }, DEBOUNCE_MS)
        );
    }

    handleDelete(uri) {
        this.index.delete(uri.toString());
    }

    /**
     * Garante que o índice esteja construído (lazy, uma única vez).
     * @returns {Promise<void>}
     */
    async ensureIndex() {
        if (!this.indexPromise) {
            this.indexPromise = this.buildIndex();
        }
        return this.indexPromise;
    }

    async buildIndex() {
        const files = await vscode.workspace.findFiles('**/*.java', EXCLUDE_GLOB, 20000);
        const index = new Map();
        for (const uri of files) {
            if (this.isExcluded(uri)) continue;
            const classes = await this.parseFile(uri);
            if (classes.length > 0) {
                index.set(uri.toString(), classes);
            }
        }
        this.index = index;
    }

    async parseFile(uri) {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const parsed = parseFile(doc.getText());
            return parsed.declarations
                .filter((d) => d.isTopLevel)
                .map((d) => toJavaClass(d, parsed, uri.fsPath));
        } catch {
            return [];
        }
    }

    /**
     * Re-parseia um único arquivo afetado (create/change).
     * @param {vscode.Uri} uri
     * @returns {Promise<void>}
     */
    async refreshFile(uri) {
        const classes = await this.parseFile(uri);
        if (classes.length > 0) {
            this.index.set(uri.toString(), classes);
        } else {
            this.index.delete(uri.toString());
        }
    }

    /**
     * Lista as classes injetáveis (classes concretas top-level, sem interface/enum/annotation).
     * @returns {import('../models/JavaClass').JavaClass[]}
     */
    listInjectableClasses() {
        const out = [];
        for (const classes of this.index.values()) {
            for (const c of classes) {
                if (c.kind === 'class') out.push(c);
            }
        }
        return out.sort((a, b) => {
            const aAnn = a.annotations.length;
            const bAnn = b.annotations.length;
            if (aAnn !== bAnn) return bAnn - aAnn;
            return a.name.localeCompare(b.name);
        });
    }
}

module.exports = { JavaClassScanner, EXCLUDED_DIRS, EXCLUDE_GLOB };
