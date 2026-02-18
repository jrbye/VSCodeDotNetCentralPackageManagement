import * as assert from 'assert';
import { NuGetService } from '../src/nugetService';

suite('NuGetService Test Suite', () => {
    let nugetService: NuGetService;

    setup(() => {
        nugetService = new NuGetService();
    });

    test('searchPackages should return results for valid query', async function() {
        this.timeout(10000); // NuGet API can be slow

        const results = await nugetService.searchPackages('Newtonsoft.Json', false, 5);

        assert.ok(results.length > 0, 'Should return at least one result');
        const newtonsoftJson = results.find(r => r.id === 'Newtonsoft.Json');
        assert.ok(newtonsoftJson, 'Should find Newtonsoft.Json package');
        assert.ok(newtonsoftJson.description, 'Package should have description');
    });

    test('searchPackages should limit results based on take parameter', async function() {
        this.timeout(10000);

        const results = await nugetService.searchPackages('Microsoft', false, 3);

        assert.ok(results.length <= 3, 'Should return at most 3 results');
    });

    test('getPackageVersions should return versions for valid package', async function() {
        this.timeout(10000);

        const versions = await nugetService.getPackageVersions('Newtonsoft.Json');

        assert.ok(versions.length > 0, 'Should return at least one version');
        assert.ok(versions.includes('13.0.3'), 'Should include version 13.0.3');
        assert.ok(versions.includes('13.0.2'), 'Should include version 13.0.2');
    });

    test('getPackageVersions should return empty array for non-existent package', async function() {
        this.timeout(10000);

        const versions = await nugetService.getPackageVersions('NonExistentPackageXYZ123');

        assert.strictEqual(versions.length, 0, 'Should return empty array for non-existent package');
    });

    test('getPackageInfo should return detailed info for valid package', async function() {
        this.timeout(10000);

        const info = await nugetService.getPackageInfo('Newtonsoft.Json', '13.0.3');

        assert.ok(info, 'Should return package info');
        assert.ok(info.description, 'Should have description');
        assert.ok(info.authors && info.authors.length > 0, 'Should have authors');
        assert.ok(info.downloads !== undefined, 'Should have download count');
    });

    test('isPackageOutdated should detect outdated package', async function() {
        this.timeout(10000);

        const result = await nugetService.isPackageOutdated('Newtonsoft.Json', '12.0.0');

        assert.strictEqual(result.isOutdated, true, 'Version 12.0.0 should be outdated');
        assert.ok(result.latestVersion, 'Should return latest version');
        assert.ok(result.latestVersion > '12.0.0', 'Latest version should be higher than 12.0.0');
    });

    test('isPackageOutdated should not flag latest version as outdated', async function() {
        this.timeout(10000);

        // First get the actual latest stable version (excluding prerelease)
        const latestVersion = await nugetService.getLatestVersion('Newtonsoft.Json', false);

        assert.ok(latestVersion, 'Should get latest version');

        const result = await nugetService.isPackageOutdated('Newtonsoft.Json', latestVersion!);

        assert.strictEqual(result.isOutdated, false, 'Latest version should not be outdated');
        assert.strictEqual(result.latestVersion, latestVersion);
    });

    test('compareVersions should correctly compare semantic versions', () => {
        // Accessing private method through any cast for testing
        const service: any = nugetService;

        if (service.compareVersions) {
            assert.strictEqual(service.compareVersions('1.0.0', '1.0.0'), 0, '1.0.0 should equal 1.0.0');
            assert.strictEqual(service.compareVersions('1.0.0', '2.0.0'), -1, '1.0.0 should be less than 2.0.0');
            assert.strictEqual(service.compareVersions('2.0.0', '1.0.0'), 1, '2.0.0 should be greater than 1.0.0');
            assert.strictEqual(service.compareVersions('1.2.3', '1.2.4'), -1, '1.2.3 should be less than 1.2.4');
            assert.strictEqual(service.compareVersions('1.10.0', '1.9.0'), 1, '1.10.0 should be greater than 1.9.0');
        }
    });

    // --- Vulnerability Database Tests ---

    test('severityToString should map severity numbers to labels', () => {
        const service: any = nugetService;

        assert.strictEqual(service.severityToString(0), 'Low');
        assert.strictEqual(service.severityToString(1), 'Moderate');
        assert.strictEqual(service.severityToString(2), 'High');
        assert.strictEqual(service.severityToString(3), 'Critical');
        assert.strictEqual(service.severityToString(99), 'Unknown');
    });

    test('versionInRange should handle open upper bound: (, 2.0.0)', () => {
        const service: any = nugetService;

        assert.strictEqual(service.versionInRange('1.0.0', '(, 2.0.0)'), true, '1.0.0 is < 2.0.0');
        assert.strictEqual(service.versionInRange('1.9.9', '(, 2.0.0)'), true, '1.9.9 is < 2.0.0');
        assert.strictEqual(service.versionInRange('2.0.0', '(, 2.0.0)'), false, '2.0.0 is NOT < 2.0.0');
        assert.strictEqual(service.versionInRange('3.0.0', '(, 2.0.0)'), false, '3.0.0 is NOT < 2.0.0');
    });

    test('versionInRange should handle inclusive range: [1.0.0, 2.0.0]', () => {
        const service: any = nugetService;

        assert.strictEqual(service.versionInRange('1.0.0', '[1.0.0, 2.0.0]'), true, '1.0.0 is >= 1.0.0 and <= 2.0.0');
        assert.strictEqual(service.versionInRange('1.5.0', '[1.0.0, 2.0.0]'), true, '1.5.0 is in range');
        assert.strictEqual(service.versionInRange('2.0.0', '[1.0.0, 2.0.0]'), true, '2.0.0 is <= 2.0.0 (inclusive)');
        assert.strictEqual(service.versionInRange('0.9.0', '[1.0.0, 2.0.0]'), false, '0.9.0 is < 1.0.0');
        assert.strictEqual(service.versionInRange('2.0.1', '[1.0.0, 2.0.0]'), false, '2.0.1 is > 2.0.0');
    });

    test('versionInRange should handle half-open range: [1.0.0, 2.0.0)', () => {
        const service: any = nugetService;

        assert.strictEqual(service.versionInRange('1.0.0', '[1.0.0, 2.0.0)'), true, '1.0.0 is >= 1.0.0');
        assert.strictEqual(service.versionInRange('1.9.9', '[1.0.0, 2.0.0)'), true, '1.9.9 is < 2.0.0');
        assert.strictEqual(service.versionInRange('2.0.0', '[1.0.0, 2.0.0)'), false, '2.0.0 is NOT < 2.0.0 (exclusive)');
    });

    test('versionInRange should handle exclusive lower bound: (1.0.0, 2.0.0)', () => {
        const service: any = nugetService;

        assert.strictEqual(service.versionInRange('1.0.0', '(1.0.0, 2.0.0)'), false, '1.0.0 is NOT > 1.0.0 (exclusive)');
        assert.strictEqual(service.versionInRange('1.0.1', '(1.0.0, 2.0.0)'), true, '1.0.1 is > 1.0.0');
        assert.strictEqual(service.versionInRange('1.9.9', '(1.0.0, 2.0.0)'), true, '1.9.9 is in range');
    });

    test('versionInRange should handle open lower bound: (1.0.0, )', () => {
        const service: any = nugetService;

        assert.strictEqual(service.versionInRange('1.0.0', '(1.0.0, )'), false, '1.0.0 is NOT > 1.0.0');
        assert.strictEqual(service.versionInRange('1.0.1', '(1.0.0, )'), true, '1.0.1 is > 1.0.0');
        assert.strictEqual(service.versionInRange('99.0.0', '(1.0.0, )'), true, '99.0.0 is > 1.0.0');
    });

    test('versionInRange should return false for invalid range format', () => {
        const service: any = nugetService;

        assert.strictEqual(service.versionInRange('1.0.0', '1.0.0'), false, 'Bare version is not a valid range');
        assert.strictEqual(service.versionInRange('1.0.0', ''), false, 'Empty string is not valid');
        assert.strictEqual(service.versionInRange('1.0.0', 'invalid'), false, 'Invalid format');
    });

    test('checkVulnerabilities should return matches from pre-loaded DB', async function() {
        this.timeout(5000);

        const service: any = nugetService;

        // Manually inject a vulnerability database
        service.vulnDb = new Map([
            ['test.package', [
                { severity: 2, url: 'https://example.com/advisory1', versions: '(, 2.0.0)' },
                { severity: 3, url: 'https://example.com/advisory2', versions: '[1.0.0, 1.5.0]' }
            ]]
        ]);
        service.vulnDbTimestamp = Date.now();

        const vulns = await nugetService.checkVulnerabilities('Test.Package', '1.2.0');

        assert.strictEqual(vulns.length, 2, 'Version 1.2.0 should match both ranges');
        assert.strictEqual(vulns[0].severity, 'High');
        assert.strictEqual(vulns[1].severity, 'Critical');
    });

    test('checkVulnerabilities should not match versions outside range', async function() {
        this.timeout(5000);

        const service: any = nugetService;

        service.vulnDb = new Map([
            ['test.package', [
                { severity: 1, url: 'https://example.com/advisory1', versions: '(, 2.0.0)' }
            ]]
        ]);
        service.vulnDbTimestamp = Date.now();

        const vulns = await nugetService.checkVulnerabilities('Test.Package', '3.0.0');

        assert.strictEqual(vulns.length, 0, 'Version 3.0.0 should not match (, 2.0.0)');
    });

    test('checkVulnerabilities should be case-insensitive for package ID', async function() {
        this.timeout(5000);

        const service: any = nugetService;

        service.vulnDb = new Map([
            ['my.package', [
                { severity: 0, url: 'https://example.com/adv', versions: '(, 5.0.0)' }
            ]]
        ]);
        service.vulnDbTimestamp = Date.now();

        const vulns = await nugetService.checkVulnerabilities('My.Package', '1.0.0');

        assert.strictEqual(vulns.length, 1, 'Should find vulnerability with case-insensitive lookup');
        assert.strictEqual(vulns[0].severity, 'Low');
    });

    test('getVersionVulnerabilities should return vulnerability data for known vulnerable package', async function() {
        this.timeout(15000);

        const vulns = await nugetService.getVersionVulnerabilities('System.Data.SqlClient');

        // System.Data.SqlClient has known vulnerabilities on all versions
        const keys = Object.keys(vulns);
        assert.ok(keys.length > 0, 'Should return vulnerability data for at least some versions');

        // Check a specific version we know is vulnerable
        const v490 = vulns['4.9.0'];
        if (v490) {
            assert.ok(v490.length > 0, 'Version 4.9.0 should have vulnerabilities');
            assert.ok(v490[0].severity, 'Should have severity');
            assert.ok(v490[0].advisoryUrl, 'Should have advisory URL');
        }
    });

    test('getVersionVulnerabilities should return empty object for non-existent package', async function() {
        this.timeout(10000);

        const vulns = await nugetService.getVersionVulnerabilities('NonExistentPackageXYZ123456');

        assert.deepStrictEqual(vulns, {}, 'Should return empty object for non-existent package');
    });

    test('getVersionVulnerabilities should store versions with lowercase keys', async function() {
        this.timeout(15000);

        const vulns = await nugetService.getVersionVulnerabilities('System.Data.SqlClient');

        const keys = Object.keys(vulns);
        for (const key of keys) {
            assert.strictEqual(key, key.toLowerCase(), `Version key "${key}" should be lowercase`);
        }
    });
});
