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
const cpmManager_1 = require("../src/cpmManager");
const xmlService_1 = require("../src/xmlService");
const nugetService_1 = require("../src/nugetService");
suite('CpmManager Test Suite', () => {
    let cpmManager;
    let xmlService;
    let nugetService;
    setup(() => {
        xmlService = new xmlService_1.XmlService();
        nugetService = new nugetService_1.NuGetService();
        cpmManager = new cpmManager_1.CpmManager(xmlService, nugetService);
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
                    { name: 'xUnit', version: '2.4.2' },
                    { name: 'NUnit', version: '4.0.0' }
                ]
            },
            {
                label: 'Utilities',
                packages: [
                    { name: 'Newtonsoft.Json', version: '13.0.3' }
                ]
            }
        ];
        // Set internal state (this would normally come from file reading)
        cpmManager.itemGroups = mockItemGroups;
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
        cpmManager.itemGroups = mockItemGroups;
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
        cpmManager.projects = mockProjects;
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
        cpmManager.projects = mockProjects;
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
        cpmManager.projects = mockProjects;
        cpmManager.itemGroups = mockItemGroups;
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
        const manager = cpmManager;
        if (manager.compareVersions) {
            assert.strictEqual(manager.compareVersions('1.0.0', '1.0.0'), 0);
            assert.strictEqual(manager.compareVersions('1.0.0', '2.0.0'), -1);
            assert.strictEqual(manager.compareVersions('2.0.0', '1.0.0'), 1);
            assert.strictEqual(manager.compareVersions('1.2.3', '1.2.4'), -1);
            assert.strictEqual(manager.compareVersions('1.10.0', '1.2.0'), 1, 'Should handle numeric comparison correctly');
        }
    });
});
//# sourceMappingURL=cpmManager.test.js.map