"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const nugetService_1 = require("../src/nugetService");
suite('NuGetService Test Suite', () => {
    let nugetService;
    setup(() => {
        nugetService = new nugetService_1.NuGetService();
    });
    test('searchPackages should return results for valid query', async function () {
        this.timeout(10000); // NuGet API can be slow
        const results = await nugetService.searchPackages('Newtonsoft.Json', false, 5);
        assert.ok(results.length > 0, 'Should return at least one result');
        const newtonsoftJson = results.find(r => r.id === 'Newtonsoft.Json');
        assert.ok(newtonsoftJson, 'Should find Newtonsoft.Json package');
        assert.ok(newtonsoftJson.description, 'Package should have description');
    });
    test('searchPackages should limit results based on take parameter', async function () {
        this.timeout(10000);
        const results = await nugetService.searchPackages('Microsoft', false, 3);
        assert.ok(results.length <= 3, 'Should return at most 3 results');
    });
    test('getPackageVersions should return versions for valid package', async function () {
        this.timeout(10000);
        const versions = await nugetService.getPackageVersions('Newtonsoft.Json');
        assert.ok(versions.length > 0, 'Should return at least one version');
        assert.ok(versions.includes('13.0.3'), 'Should include version 13.0.3');
        assert.ok(versions.includes('13.0.2'), 'Should include version 13.0.2');
    });
    test('getPackageVersions should return empty array for non-existent package', async function () {
        this.timeout(10000);
        const versions = await nugetService.getPackageVersions('NonExistentPackageXYZ123');
        assert.strictEqual(versions.length, 0, 'Should return empty array for non-existent package');
    });
    test('getPackageInfo should return detailed info for valid package', async function () {
        this.timeout(10000);
        const info = await nugetService.getPackageInfo('Newtonsoft.Json', '13.0.3');
        assert.ok(info, 'Should return package info');
        assert.ok(info.description, 'Should have description');
        assert.ok(info.authors && info.authors.length > 0, 'Should have authors');
        assert.ok(info.downloads !== undefined, 'Should have download count');
    });
    test('isPackageOutdated should detect outdated package', async function () {
        this.timeout(10000);
        const result = await nugetService.isPackageOutdated('Newtonsoft.Json', '12.0.0');
        assert.strictEqual(result.isOutdated, true, 'Version 12.0.0 should be outdated');
        assert.ok(result.latestVersion, 'Should return latest version');
        assert.ok(result.latestVersion > '12.0.0', 'Latest version should be higher than 12.0.0');
    });
    test('isPackageOutdated should not flag latest version as outdated', async function () {
        this.timeout(10000);
        // First get the actual latest stable version (excluding prerelease)
        const latestVersion = await nugetService.getLatestVersion('Newtonsoft.Json', false);
        assert.ok(latestVersion, 'Should get latest version');
        const result = await nugetService.isPackageOutdated('Newtonsoft.Json', latestVersion);
        assert.strictEqual(result.isOutdated, false, 'Latest version should not be outdated');
        assert.strictEqual(result.latestVersion, latestVersion);
    });
    test('compareVersions should correctly compare semantic versions', () => {
        // Accessing private method through any cast for testing
        const service = nugetService;
        if (service.compareVersions) {
            assert.strictEqual(service.compareVersions('1.0.0', '1.0.0'), 0, '1.0.0 should equal 1.0.0');
            assert.strictEqual(service.compareVersions('1.0.0', '2.0.0'), -1, '1.0.0 should be less than 2.0.0');
            assert.strictEqual(service.compareVersions('2.0.0', '1.0.0'), 1, '2.0.0 should be greater than 1.0.0');
            assert.strictEqual(service.compareVersions('1.2.3', '1.2.4'), -1, '1.2.3 should be less than 1.2.4');
            assert.strictEqual(service.compareVersions('1.10.0', '1.9.0'), 1, '1.10.0 should be greater than 1.9.0');
        }
    });
});
//# sourceMappingURL=nugetService.test.js.map