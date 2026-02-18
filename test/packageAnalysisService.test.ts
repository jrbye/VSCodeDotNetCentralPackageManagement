import * as assert from 'assert';
import { PackageAnalysisService, TransitiveConflict } from '../src/packageAnalysisService';
import { DotnetCliService, DotnetListOutput, RestoreWarning } from '../src/dotnetCliService';
import { CpmManager } from '../src/cpmManager';
import { XmlService } from '../src/xmlService';
import { NuGetService } from '../src/nugetService';

suite('PackageAnalysisService Test Suite', () => {
    let analysisService: PackageAnalysisService;
    let dotnetCli: DotnetCliService;
    let cpmManager: CpmManager;

    setup(() => {
        dotnetCli = new DotnetCliService();
        const xmlService = new XmlService();
        const nugetService = new NuGetService();
        cpmManager = new CpmManager(xmlService, nugetService);
        analysisService = new PackageAnalysisService(dotnetCli, cpmManager);
    });

    teardown(() => {
        analysisService.dispose();
        cpmManager.dispose();
        dotnetCli.dispose();
    });

    // --- parseVersionRange tests ---

    test('parseVersionRange should parse exact version [X.Y.Z]', () => {
        const service: any = analysisService;
        const result = service.parseVersionRange('[2.14.1]');

        assert.strictEqual(result.version, '2.14.1');
        assert.strictEqual(result.isExact, true);
    });

    test('parseVersionRange should parse exact range [X.Y.Z, X.Y.Z]', () => {
        const service: any = analysisService;
        const result = service.parseVersionRange('[2.14.1, 2.14.1]');

        assert.strictEqual(result.version, '2.14.1');
        assert.strictEqual(result.isExact, true);
    });

    test('parseVersionRange should parse minimum version (bare version)', () => {
        const service: any = analysisService;
        const result = service.parseVersionRange('2.14.1');

        assert.strictEqual(result.version, '2.14.1');
        assert.strictEqual(result.isExact, false);
    });

    test('parseVersionRange should parse range [X.Y.Z, A.B.C)', () => {
        const service: any = analysisService;
        const result = service.parseVersionRange('[2.0.0, 3.0.0)');

        assert.strictEqual(result.version, '2.0.0');
        assert.strictEqual(result.isExact, false);
    });

    test('parseVersionRange should handle version with prerelease suffix', () => {
        const service: any = analysisService;
        const result = service.parseVersionRange('[1.0.0-beta1]');

        assert.strictEqual(result.version, '1.0.0-beta1');
        assert.strictEqual(result.isExact, true);
    });

    test('parseVersionRange should handle whitespace in range', () => {
        const service: any = analysisService;
        const result = service.parseVersionRange('  [ 2.14.1 ]  ');

        assert.strictEqual(result.version, '2.14.1');
        assert.strictEqual(result.isExact, true);
    });

    // --- detectConflicts tests ---

    test('detectConflicts should flag when central version is LOWER than transitive', () => {
        const service: any = analysisService;

        // Central at 1.0.0, transitive resolved to 2.0.0 → real conflict (need upgrade)
        (cpmManager as any).itemGroups = [
            {
                label: 'Dependencies',
                packages: [
                    { name: 'SomePackage', version: '1.0.0', label: 'Dependencies' }
                ]
            }
        ];

        const output: DotnetListOutput = {
            version: 1,
            parameters: '',
            projects: [{
                path: '/path/to/MyProject.csproj',
                frameworks: [{
                    framework: 'net8.0',
                    topLevelPackages: [
                        { id: 'ParentPackage', resolvedVersion: '3.0.0' }
                    ],
                    transitivePackages: [
                        { id: 'SomePackage', resolvedVersion: '2.0.0' }
                    ]
                }]
            }]
        };

        const conflicts = service.detectConflicts(output);

        assert.strictEqual(conflicts.length, 1, 'Should detect 1 conflict');
        assert.strictEqual(conflicts[0].packageId, 'SomePackage');
        assert.strictEqual(conflicts[0].centralVersion, '1.0.0');
        assert.strictEqual(conflicts[0].transitiveVersion, '2.0.0');
        assert.ok(conflicts[0].projects.includes('MyProject'));
        assert.strictEqual(conflicts[0].framework, 'net8.0');
    });

    test('detectConflicts should NOT flag when central version is HIGHER than transitive', () => {
        const service: any = analysisService;

        // Central at 10.0.2, transitive resolved to 9.0.10 → not a conflict
        // (central satisfies >= minimum constraints; exact-constraint violations
        // are caught by NU1608 warnings from dotnet restore)
        (cpmManager as any).itemGroups = [
            {
                label: 'Dependencies',
                packages: [
                    { name: 'System.Drawing.Common', version: '10.0.2', label: 'Dependencies' }
                ]
            }
        ];

        const output: DotnetListOutput = {
            version: 1,
            parameters: '',
            projects: [{
                path: '/path/to/MyProject.csproj',
                frameworks: [{
                    framework: 'net8.0',
                    topLevelPackages: [
                        { id: 'Azure.Identity', resolvedVersion: '1.12.0' }
                    ],
                    transitivePackages: [
                        { id: 'System.Drawing.Common', resolvedVersion: '9.0.10' }
                    ]
                }]
            }]
        };

        const conflicts = service.detectConflicts(output);

        assert.strictEqual(conflicts.length, 0, 'Should NOT flag when central >= transitive');
    });

    test('detectConflicts should not flag matching versions', () => {
        const service: any = analysisService;

        (cpmManager as any).itemGroups = [
            {
                label: 'Dependencies',
                packages: [
                    { name: 'Humanizer.Core', version: '2.14.1', label: 'Dependencies' }
                ]
            }
        ];

        const output: DotnetListOutput = {
            version: 1,
            parameters: '',
            projects: [{
                path: '/path/to/MyProject.csproj',
                frameworks: [{
                    framework: 'net8.0',
                    topLevelPackages: [],
                    transitivePackages: [
                        { id: 'Humanizer.Core', resolvedVersion: '2.14.1' }
                    ]
                }]
            }]
        };

        const conflicts = service.detectConflicts(output);

        assert.strictEqual(conflicts.length, 0, 'Should not detect conflicts for matching versions');
    });

    test('detectConflicts should merge projects for same conflict', () => {
        const service: any = analysisService;

        // Central at 1.0.0, transitive at 2.0.0 across two projects
        (cpmManager as any).itemGroups = [
            {
                label: 'Dependencies',
                packages: [
                    { name: 'SomePackage', version: '1.0.0', label: 'Dependencies' }
                ]
            }
        ];

        const output: DotnetListOutput = {
            version: 1,
            parameters: '',
            projects: [
                {
                    path: '/path/to/ProjectA.csproj',
                    frameworks: [{
                        framework: 'net8.0',
                        topLevelPackages: [],
                        transitivePackages: [
                            { id: 'SomePackage', resolvedVersion: '2.0.0' }
                        ]
                    }]
                },
                {
                    path: '/path/to/ProjectB.csproj',
                    frameworks: [{
                        framework: 'net8.0',
                        topLevelPackages: [],
                        transitivePackages: [
                            { id: 'SomePackage', resolvedVersion: '2.0.0' }
                        ]
                    }]
                }
            ]
        };

        const conflicts = service.detectConflicts(output);

        assert.strictEqual(conflicts.length, 1, 'Should produce 1 merged conflict');
        assert.strictEqual(conflicts[0].projects.length, 2, 'Should include both projects');
        assert.ok(conflicts[0].projects.includes('ProjectA'));
        assert.ok(conflicts[0].projects.includes('ProjectB'));
    });

    // --- parseNu1608Warnings tests ---

    test('parseNu1608Warnings should parse standard NU1608 message', () => {
        const service: any = analysisService;
        const warnings: RestoreWarning[] = [{
            code: 'NU1608',
            message: 'Detected package version outside of dependency constraint: Humanizer.Core.af 2.14.1 requires Humanizer.Core (= 2.14.1) but version Humanizer.Core 3.0.1 was resolved.',
            project: '/path/to/MyProject.csproj'
        }];

        const conflicts = service.parseNu1608Warnings(warnings);

        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].packageId, 'Humanizer.Core');
        assert.strictEqual(conflicts[0].centralVersion, '3.0.1');
        assert.strictEqual(conflicts[0].transitiveVersion, '2.14.1');
        assert.ok(conflicts[0].transitiveParents.includes('Humanizer.Core.af'));
        assert.ok(conflicts[0].projects.includes('MyProject'));
    });

    test('parseNu1608Warnings should ignore non-NU1608 warnings', () => {
        const service: any = analysisService;
        const warnings: RestoreWarning[] = [{
            code: 'NU1603',
            message: 'Some other warning',
            project: '/path/to/MyProject.csproj'
        }];

        const conflicts = service.parseNu1608Warnings(warnings);

        assert.strictEqual(conflicts.length, 0, 'Should ignore non-NU1608 warnings');
    });

    test('parseNu1608Warnings should merge multiple warnings for same package', () => {
        const service: any = analysisService;
        const warnings: RestoreWarning[] = [
            {
                code: 'NU1608',
                message: 'Detected package version outside of dependency constraint: Humanizer.Core.af 2.14.1 requires Humanizer.Core (= 2.14.1) but version Humanizer.Core 3.0.1 was resolved.',
                project: '/path/to/ProjectA.csproj'
            },
            {
                code: 'NU1608',
                message: 'Detected package version outside of dependency constraint: Humanizer.Core.de 2.14.1 requires Humanizer.Core (= 2.14.1) but version Humanizer.Core 3.0.1 was resolved.',
                project: '/path/to/ProjectB.csproj'
            }
        ];

        const conflicts = service.parseNu1608Warnings(warnings);

        assert.strictEqual(conflicts.length, 1, 'Should merge into 1 conflict');
        assert.ok(conflicts[0].transitiveParents.includes('Humanizer.Core.af'));
        assert.ok(conflicts[0].transitiveParents.includes('Humanizer.Core.de'));
        assert.ok(conflicts[0].projects.includes('ProjectA'));
        assert.ok(conflicts[0].projects.includes('ProjectB'));
    });

    test('parseNu1608Warnings should limit transitiveParents to avoid noise', () => {
        const service: any = analysisService;
        const warnings: RestoreWarning[] = [];

        // Create 8 warnings from different satellite packages
        for (let i = 0; i < 8; i++) {
            warnings.push({
                code: 'NU1608',
                message: `Detected package version outside of dependency constraint: Humanizer.Core.lang${i} 2.14.1 requires Humanizer.Core (= 2.14.1) but version Humanizer.Core 3.0.1 was resolved.`,
                project: '/path/to/MyProject.csproj'
            });
        }

        const conflicts = service.parseNu1608Warnings(warnings);

        assert.strictEqual(conflicts.length, 1);
        // Should be truncated: 3 named + "and X more"
        assert.strictEqual(conflicts[0].transitiveParents.length, 4);
        assert.ok(conflicts[0].transitiveParents[3].startsWith('and '));
    });

    // --- mergeConflicts tests ---

    test('mergeConflicts should keep primary and add unique secondary conflicts', () => {
        const service: any = analysisService;

        const primary: TransitiveConflict[] = [{
            packageId: 'Humanizer.Core',
            centralVersion: '3.0.1',
            transitiveVersion: '2.14.1',
            transitiveParents: ['Humanizer.Core.af'],
            projects: ['ProjectA'],
            framework: ''
        }];

        const secondary: TransitiveConflict[] = [
            {
                packageId: 'Humanizer.Core',
                centralVersion: '3.0.1',
                transitiveVersion: '2.14.1',
                transitiveParents: [],
                projects: ['ProjectA'],
                framework: 'net8.0'
            },
            {
                packageId: 'SomeOther.Package',
                centralVersion: '2.0.0',
                transitiveVersion: '1.5.0',
                transitiveParents: [],
                projects: ['ProjectA'],
                framework: 'net8.0'
            }
        ];

        const merged = service.mergeConflicts(primary, secondary);

        assert.strictEqual(merged.length, 2, 'Should have primary + 1 unique secondary');
        assert.strictEqual(merged[0].packageId, 'Humanizer.Core', 'Primary should come first');
        assert.strictEqual(merged[0].transitiveParents[0], 'Humanizer.Core.af', 'Primary data preserved');
        assert.strictEqual(merged[1].packageId, 'SomeOther.Package');
    });

    test('mergeConflicts should not duplicate packages already in primary', () => {
        const service: any = analysisService;

        const primary: TransitiveConflict[] = [{
            packageId: 'Humanizer.Core',
            centralVersion: '3.0.1',
            transitiveVersion: '2.14.1',
            transitiveParents: ['Humanizer.Core.af'],
            projects: ['ProjectA'],
            framework: ''
        }];

        const secondary: TransitiveConflict[] = [{
            packageId: 'humanizer.core',
            centralVersion: '3.0.1',
            transitiveVersion: '2.14.1',
            transitiveParents: [],
            projects: ['ProjectB'],
            framework: 'net8.0'
        }];

        const merged = service.mergeConflicts(primary, secondary);

        assert.strictEqual(merged.length, 1, 'Should not duplicate (case-insensitive)');
    });

    // --- extractVulnerabilities tests ---

    test('extractVulnerabilities should extract vulnerable top-level packages', () => {
        const service: any = analysisService;

        const output: DotnetListOutput = {
            version: 1,
            parameters: '',
            projects: [{
                path: '/path/to/MyProject.csproj',
                frameworks: [{
                    framework: 'net8.0',
                    topLevelPackages: [{
                        id: 'System.Data.SqlClient',
                        resolvedVersion: '4.8.5',
                        vulnerabilities: [
                            { severity: 'High', advisoryurl: 'https://example.com/advisory1' },
                            { severity: 'Critical', advisoryurl: 'https://example.com/advisory2' }
                        ]
                    }],
                    transitivePackages: []
                }]
            }]
        };

        const vulns = service.extractVulnerabilities(output);

        assert.strictEqual(vulns.length, 1, 'Should find 1 vulnerable package');
        assert.strictEqual(vulns[0].packageId, 'System.Data.SqlClient');
        assert.strictEqual(vulns[0].resolvedVersion, '4.8.5');
        assert.strictEqual(vulns[0].isTransitive, false, 'Top-level should not be transitive');
        assert.strictEqual(vulns[0].vulnerabilities.length, 2);
        assert.strictEqual(vulns[0].vulnerabilities[0].severity, 'High');
        assert.strictEqual(vulns[0].vulnerabilities[1].advisoryUrl, 'https://example.com/advisory2');
        assert.ok(vulns[0].projects.includes('MyProject'));
    });

    test('extractVulnerabilities should extract vulnerable transitive packages', () => {
        const service: any = analysisService;

        const output: DotnetListOutput = {
            version: 1,
            parameters: '',
            projects: [{
                path: '/path/to/MyProject.csproj',
                frameworks: [{
                    framework: 'net8.0',
                    topLevelPackages: [],
                    transitivePackages: [{
                        id: 'System.Text.Json',
                        resolvedVersion: '6.0.0',
                        vulnerabilities: [
                            { severity: 'Moderate', advisoryurl: 'https://example.com/advisory3' }
                        ]
                    }]
                }]
            }]
        };

        const vulns = service.extractVulnerabilities(output);

        assert.strictEqual(vulns.length, 1);
        assert.strictEqual(vulns[0].isTransitive, true, 'Should be marked as transitive');
    });

    test('extractVulnerabilities should skip packages without vulnerabilities', () => {
        const service: any = analysisService;

        const output: DotnetListOutput = {
            version: 1,
            parameters: '',
            projects: [{
                path: '/path/to/MyProject.csproj',
                frameworks: [{
                    framework: 'net8.0',
                    topLevelPackages: [
                        { id: 'Newtonsoft.Json', resolvedVersion: '13.0.3' },
                        { id: 'System.Data.SqlClient', resolvedVersion: '4.8.5', vulnerabilities: [
                            { severity: 'High', advisoryurl: 'https://example.com/adv' }
                        ]}
                    ],
                    transitivePackages: []
                }]
            }]
        };

        const vulns = service.extractVulnerabilities(output);

        assert.strictEqual(vulns.length, 1);
        assert.strictEqual(vulns[0].packageId, 'System.Data.SqlClient');
    });

    test('extractVulnerabilities should merge projects for same package+version', () => {
        const service: any = analysisService;

        const output: DotnetListOutput = {
            version: 1,
            parameters: '',
            projects: [
                {
                    path: '/path/to/ProjectA.csproj',
                    frameworks: [{
                        framework: 'net8.0',
                        topLevelPackages: [{
                            id: 'System.Data.SqlClient',
                            resolvedVersion: '4.8.5',
                            vulnerabilities: [
                                { severity: 'High', advisoryurl: 'https://example.com/adv' }
                            ]
                        }],
                        transitivePackages: []
                    }]
                },
                {
                    path: '/path/to/ProjectB.csproj',
                    frameworks: [{
                        framework: 'net8.0',
                        topLevelPackages: [{
                            id: 'System.Data.SqlClient',
                            resolvedVersion: '4.8.5',
                            vulnerabilities: [
                                { severity: 'High', advisoryurl: 'https://example.com/adv' }
                            ]
                        }],
                        transitivePackages: []
                    }]
                }
            ]
        };

        const vulns = service.extractVulnerabilities(output);

        assert.strictEqual(vulns.length, 1, 'Should merge into 1 entry');
        assert.strictEqual(vulns[0].projects.length, 2);
        assert.ok(vulns[0].projects.includes('ProjectA'));
        assert.ok(vulns[0].projects.includes('ProjectB'));
    });

    // --- getConflictsForPackage / getVulnerabilitiesForPackage tests ---

    test('getConflictsForPackage should filter by package name (case-insensitive)', () => {
        const service: any = analysisService;

        service._analysisResult.transitiveConflicts = [
            {
                packageId: 'Humanizer.Core',
                centralVersion: '3.0.1',
                transitiveVersion: '2.14.1',
                transitiveParents: ['Humanizer.Core.af'],
                projects: ['ProjectA'],
                framework: 'net8.0'
            },
            {
                packageId: 'SomeOther.Package',
                centralVersion: '2.0.0',
                transitiveVersion: '1.5.0',
                transitiveParents: [],
                projects: ['ProjectA'],
                framework: 'net8.0'
            }
        ];

        const conflicts = analysisService.getConflictsForPackage('humanizer.core');

        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].packageId, 'Humanizer.Core');
    });

    test('getVulnerabilitiesForPackage should filter by package name (case-insensitive)', () => {
        const service: any = analysisService;

        service._analysisResult.vulnerablePackages = [
            {
                packageId: 'System.Data.SqlClient',
                resolvedVersion: '4.8.5',
                isTransitive: false,
                vulnerabilities: [{ severity: 'High', advisoryUrl: 'https://example.com/adv' }],
                projects: ['ProjectA'],
                framework: 'net8.0'
            },
            {
                packageId: 'Newtonsoft.Json',
                resolvedVersion: '9.0.0',
                isTransitive: false,
                vulnerabilities: [{ severity: 'Critical', advisoryUrl: 'https://example.com/adv2' }],
                projects: ['ProjectB'],
                framework: 'net8.0'
            }
        ];

        const vulns = analysisService.getVulnerabilitiesForPackage('SYSTEM.DATA.SQLCLIENT');

        assert.strictEqual(vulns.length, 1);
        assert.strictEqual(vulns[0].packageId, 'System.Data.SqlClient');
    });

    // --- getConstraintsForPackage tests ---

    test('getConstraintsForPackage should return undefined for unknown package', () => {
        const constraint = analysisService.getConstraintsForPackage('NonExistent.Package');

        assert.strictEqual(constraint, undefined);
    });

    test('getConstraintsForPackage should return stored constraint (case-insensitive)', () => {
        const service: any = analysisService;

        service._transitiveConstraints.set('humanizer.core', {
            packageId: 'Humanizer.Core',
            requiredVersion: '2.14.1',
            versionRange: '[2.14.1]',
            isExact: true,
            requiredBy: ['Humanizer.Core.af']
        });

        const constraint = analysisService.getConstraintsForPackage('Humanizer.Core');

        assert.ok(constraint, 'Should find constraint');
        assert.strictEqual(constraint!.requiredVersion, '2.14.1');
        assert.strictEqual(constraint!.isExact, true);
        assert.ok(constraint!.requiredBy.includes('Humanizer.Core.af'));
    });

    // --- clearCache tests ---

    test('clearCache should reset all analysis state', () => {
        const service: any = analysisService;

        // Set up some state
        service._analysisResult.transitiveConflicts = [{ packageId: 'Test' }];
        service._analysisResult.vulnerablePackages = [{ packageId: 'Test' }];
        service._analysisResult.lastUpdated = new Date();
        service._transitiveConstraints.set('test', { packageId: 'Test' });

        analysisService.clearCache();

        const result = analysisService.getAnalysisResult();
        assert.strictEqual(result.transitiveConflicts.length, 0, 'Conflicts should be cleared');
        assert.strictEqual(result.vulnerablePackages.length, 0, 'Vulnerabilities should be cleared');
        assert.strictEqual(result.lastUpdated, null, 'Last updated should be null');
        assert.strictEqual(result.isRunning, false, 'Should not be running');
        assert.strictEqual(result.error, null, 'Error should be null');
        assert.strictEqual(analysisService.getConstraintsForPackage('test'), undefined, 'Constraints should be cleared');
    });

    // --- getAnalysisResult tests ---

    test('getAnalysisResult should return initial empty state', () => {
        const result = analysisService.getAnalysisResult();

        assert.strictEqual(result.transitiveConflicts.length, 0);
        assert.strictEqual(result.vulnerablePackages.length, 0);
        assert.strictEqual(result.lastUpdated, null);
        assert.strictEqual(result.isRunning, false);
        assert.strictEqual(result.error, null);
    });
});
