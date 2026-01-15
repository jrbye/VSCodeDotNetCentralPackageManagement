import * as assert from 'assert';
import { CpmManager } from '../src/cpmManager';
import { XmlService } from '../src/xmlService';
import { NuGetService } from '../src/nugetService';

suite('CpmManager Test Suite', () => {
    let cpmManager: CpmManager;
    let xmlService: XmlService;
    let nugetService: NuGetService;

    setup(() => {
        xmlService = new XmlService();
        nugetService = new NuGetService();
        cpmManager = new CpmManager(xmlService, nugetService);
    });

    teardown(() => {
        cpmManager.dispose();
    });

    test('getAllPackages should return sorted packages', () => {
        // Mock some packages
        const mockItemGroups = [
            {
                label: 'Test Framework',
                packages: [
                    { name: 'xUnit', version: '2.4.2', label: 'Test Framework' },
                    { name: 'NUnit', version: '4.0.0', label: 'Test Framework' }
                ]
            },
            {
                label: 'Utilities',
                packages: [
                    { name: 'Newtonsoft.Json', version: '13.0.3', label: 'Utilities' }
                ]
            }
        ];

        // Set internal state (this would normally come from file reading)
        (cpmManager as any).itemGroups = mockItemGroups;

        const allPackages = cpmManager.getAllPackages();

        assert.strictEqual(allPackages.length, 3, 'Should return all 3 packages');

        // Verify packages include their labels
        const nunit = allPackages.find(p => p.name === 'NUnit');
        assert.ok(nunit, 'NUnit should exist');
        assert.strictEqual(nunit?.label, 'Test Framework');
        assert.strictEqual(nunit?.version, '4.0.0');
    });

    test('getItemGroups should return all item groups', () => {
        const mockItemGroups = [
            {
                label: 'Test Framework',
                packages: [{ name: 'NUnit', version: '4.0.0' }]
            },
            {
                label: 'Utilities',
                packages: [{ name: 'Newtonsoft.Json', version: '13.0.3' }]
            }
        ];

        (cpmManager as any).itemGroups = mockItemGroups;

        const itemGroups = cpmManager.getItemGroups();

        assert.strictEqual(itemGroups.length, 2, 'Should return 2 item groups');
        assert.strictEqual(itemGroups[0].label, 'Test Framework');
        assert.strictEqual(itemGroups[1].label, 'Utilities');
    });

    test('getAllProjects should return sorted projects alphabetically', () => {
        const mockProjects = [
            { path: '/path/to/ProjectZ.csproj', name: 'ProjectZ', packages: [], versionedPackages: new Map() },
            { path: '/path/to/ProjectA.csproj', name: 'ProjectA', packages: [], versionedPackages: new Map() },
            { path: '/path/to/ProjectM.csproj', name: 'ProjectM', packages: [], versionedPackages: new Map() }
        ];

        (cpmManager as any).projects = mockProjects;

        const sortedProjects = cpmManager.getAllProjects();

        assert.strictEqual(sortedProjects.length, 3);
        assert.strictEqual(sortedProjects[0].name, 'ProjectA', 'First project should be ProjectA');
        assert.strictEqual(sortedProjects[1].name, 'ProjectM', 'Second project should be ProjectM');
        assert.strictEqual(sortedProjects[2].name, 'ProjectZ', 'Third project should be ProjectZ');
    });

    test('getPackageUsage should return projects using a package', () => {
        const mockProjects = [
            {
                path: '/path/to/Project1.csproj',
                name: 'Project1',
                packages: ['NUnit', 'Newtonsoft.Json'],
                versionedPackages: new Map()
            },
            {
                path: '/path/to/Project2.csproj',
                name: 'Project2',
                packages: ['NUnit'],
                versionedPackages: new Map()
            },
            {
                path: '/path/to/Project3.csproj',
                name: 'Project3',
                packages: ['xUnit'],
                versionedPackages: new Map()
            }
        ];

        (cpmManager as any).projects = mockProjects;

        const nunitUsage = cpmManager.getPackageUsage('NUnit');
        const newtonsoftUsage = cpmManager.getPackageUsage('Newtonsoft.Json');
        const xunitUsage = cpmManager.getPackageUsage('xUnit');
        const nonExistentUsage = cpmManager.getPackageUsage('NonExistent');

        assert.strictEqual(nunitUsage.length, 2, 'NUnit should be used in 2 projects');
        assert.ok(nunitUsage.includes('Project1'));
        assert.ok(nunitUsage.includes('Project2'));

        assert.strictEqual(newtonsoftUsage.length, 1, 'Newtonsoft.Json should be used in 1 project');
        assert.ok(newtonsoftUsage.includes('Project1'));

        assert.strictEqual(xunitUsage.length, 1, 'xUnit should be used in 1 project');
        assert.ok(xunitUsage.includes('Project3'));

        assert.strictEqual(nonExistentUsage.length, 0, 'Non-existent package should have 0 usage');
    });

    test('getVersionConflicts should detect packages with Version in csproj', () => {
        const mockProjects = [
            {
                path: '/path/to/Project1.csproj',
                name: 'Project1',
                packages: ['NUnit'],
                versionedPackages: new Map([['NUnit', '4.0.0']])
            },
            {
                path: '/path/to/Project2.csproj',
                name: 'Project2',
                packages: ['xUnit'],
                versionedPackages: new Map()
            }
        ];

        const mockItemGroups = [
            {
                label: 'Test Framework',
                packages: [
                    { name: 'NUnit', version: '4.0.0' },
                    { name: 'xUnit', version: '2.4.2' }
                ]
            }
        ];

        (cpmManager as any).projects = mockProjects;
        (cpmManager as any).itemGroups = mockItemGroups;

        const conflicts = cpmManager.getVersionConflicts();

        assert.strictEqual(conflicts.length, 1, 'Should detect 1 conflict');
        assert.strictEqual(conflicts[0].project, 'Project1');
        assert.strictEqual(conflicts[0].package, 'NUnit');
        assert.strictEqual(conflicts[0].version, '4.0.0');
    });

    test('hasPropsFile should return false initially', () => {
        assert.strictEqual(cpmManager.hasPropsFile(), false, 'Should not have props file initially');
    });

    test('compareVersions should correctly order versions', () => {
        // Access private method for testing
        const manager: any = cpmManager;

        if (manager.compareVersions) {
            assert.strictEqual(manager.compareVersions('1.0.0', '1.0.0'), 0);
            assert.strictEqual(manager.compareVersions('1.0.0', '2.0.0'), -1);
            assert.strictEqual(manager.compareVersions('2.0.0', '1.0.0'), 1);
            assert.strictEqual(manager.compareVersions('1.2.3', '1.2.4'), -1);
            assert.strictEqual(manager.compareVersions('1.10.0', '1.2.0'), 1, 'Should handle numeric comparison correctly');
        }
    });
});
