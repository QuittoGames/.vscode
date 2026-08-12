// CoffeInjector — test/parser.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    cleanSource,
    parseFile,
    findPrimaryDeclaration,
    splitTopLevel,
    extractParams,
} = require('../src/java/JavaClassParser');

test('cleanSource preserves newlines and offsets', () => {
    const src = '// comment\nString s = "a//b"; /* block */ int x;';
    const clean = cleanSource(src);
    assert.equal(clean.length, src.length);
    assert.equal(clean.slice(0, 10), '          ');
    assert.equal(clean[10], '\n');
    assert.equal(clean.slice(11, 22), 'String s = ');
    assert.equal(clean.slice(22, 28), '      ');
    assert.equal(clean.slice(30, 42), '            ');
    assert.equal(clean.indexOf('int x'), src.indexOf('int x'));
});

test('parseFile extracts package, imports and top-level class', () => {
    const src = `package com.example.app;

import java.util.List;
import com.example.app.service.CoffeService;

@Service
public class CoffeApp {
    private final CoffeService service;

    public CoffeApp(CoffeService service) {
        this.service = service;
    }
}
`;
    const parsed = parseFile(src);
    assert.equal(parsed.packageName, 'com.example.app');
    assert.equal(parsed.imports.length, 2);
    assert.equal(parsed.imports[0].fqcn, 'java.util.List');
    assert.equal(parsed.declarations.length, 1);
    const decl = parsed.declarations[0];
    assert.equal(decl.name, 'CoffeApp');
    assert.equal(decl.kind, 'class');
    assert.equal(decl.isTopLevel, true);
    assert.deepEqual(decl.annotations, ['Service']);
});

test('findPrimaryDeclaration prefers file-matching class', () => {
    const src = `class Main {}\nclass Helper {}\n`;
    const parsed = parseFile(src);
    const primary = findPrimaryDeclaration(parsed, 'Main.java');
    assert.equal(primary.name, 'Main');
    const fallback = findPrimaryDeclaration(parsed, 'Unknown.java');
    assert.equal(fallback.name, 'Main');
});

test('extractParams handles annotations, final, generics and varargs', () => {
    assert.deepEqual(extractParams('SomeService someService'), [{ type: 'SomeService', name: 'someService' }]);
    assert.deepEqual(extractParams('final String name'), [{ type: 'String', name: 'name' }]);
    assert.deepEqual(extractParams('@Qualifier("x") CoffeService service'), [{ type: 'CoffeService', name: 'service' }]);
    assert.deepEqual(extractParams('Map<String, List<Foo>> map'), [{ type: 'Map<String, List<Foo>>', name: 'map' }]);
    assert.deepEqual(extractParams('String... parts'), [{ type: 'String...', name: 'parts' }]);
});

test('extractConstructors finds public constructor with params', () => {
    const src = `public class X {
    private final A a;
    private final B b;

    public X(A a, B b) {
        this.a = a;
        this.b = b;
    }
}
`;
    const parsed = parseFile(src);
    const decl = parsed.declarations[0];
    assert.equal(decl.constructors.length, 1);
    const ctor = decl.constructors[0];
    assert.equal(ctor.params.length, 2);
    assert.equal(ctor.params[0].name, 'a');
    assert.equal(ctor.params[1].type, 'B');
    assert.equal(ctor.paramListStart < ctor.paramListEnd, true);
    assert.equal(ctor.bodyStart < ctor.bodyEnd, true);
});

test('splitTopLevel respects generics and parens', () => {
    assert.deepEqual(splitTopLevel('A a, Map<B, C> m, D d'), ['A a', ' Map<B, C> m', ' D d']);
    assert.deepEqual(splitTopLevel('f(a, b), g(c, d)'), ['f(a, b)', ' g(c, d)']);
});
