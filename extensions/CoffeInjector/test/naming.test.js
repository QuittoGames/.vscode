// CoffeInjector — test/naming.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { toCamelCase, stripKnownSuffix, computeFieldName } = require('../src/utils/naming');

test('toCamelCase lowercases the first letter', () => {
    assert.equal(toCamelCase('CoffeAgentService'), 'coffeAgentService');
    assert.equal(toCamelCase('RedisService'), 'redisService');
    assert.equal(toCamelCase(''), '');
});

test('stripKnownSuffix removes known suffixes', () => {
    assert.equal(stripKnownSuffix('CoffeAgentService'), 'CoffeAgent');
    assert.equal(stripKnownSuffix('UserRepository'), 'User');
    assert.equal(stripKnownSuffix('User'), 'User');
    assert.equal(stripKnownSuffix('Service'), 'Service');
});

test('computeFieldName strips suffix by default and avoids conflicts', () => {
    assert.equal(computeFieldName('CoffeAgentService', new Set()), 'coffeAgent');
    assert.equal(computeFieldName('CoffeAgentService', new Set(['coffeAgent'])), 'coffeAgentService');
    assert.equal(computeFieldName('CoffeAgentService', new Set(['coffeAgent', 'coffeAgentService'])), 'coffeAgent2');
});

test('computeFieldName keeps full camelCase when stripSuffix is false', () => {
    assert.equal(computeFieldName('CoffeAgentService', new Set(), { stripSuffix: false }), 'coffeAgentService');
});
