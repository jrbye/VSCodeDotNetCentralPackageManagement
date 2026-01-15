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
const xmlService_1 = require("../src/xmlService");
suite('XmlService Test Suite', () => {
    let xmlService;
    setup(() => {
        xmlService = new xmlService_1.XmlService();
    });
    test('parseXml should parse valid XML', () => {
        const xmlContent = '<?xml version="1.0" encoding="utf-8"?><Project><ItemGroup><PackageVersion Include="NUnit" Version="4.0.0" /></ItemGroup></Project>';
        const parsed = xmlService.parseXml(xmlContent);
        assert.ok(parsed.Project);
        assert.ok(parsed.Project.ItemGroup);
    });
    test('parsePropsFile should extract package versions', async () => {
        const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<Project>
  <ItemGroup Label="Test Framework">
    <PackageVersion Include="NUnit" Version="4.0.0" />
    <PackageVersion Include="xUnit" Version="2.4.2" />
  </ItemGroup>
  <ItemGroup Label="Utilities">
    <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>`;
        const result = xmlService.parsePropsFileContent(xmlContent);
        assert.strictEqual(result.length, 2, 'Should have 2 item groups');
        assert.strictEqual(result[0].label, 'Test Framework');
        assert.strictEqual(result[0].packages.length, 2, 'First group should have 2 packages');
        assert.strictEqual(result[1].label, 'Utilities');
        assert.strictEqual(result[1].packages.length, 1, 'Second group should have 1 package');
        // Verify package details
        const nunit = result[0].packages.find(p => p.name === 'NUnit');
        assert.ok(nunit, 'NUnit package should exist');
        assert.strictEqual(nunit?.version, '4.0.0');
    });
    test('parsePropsFile should handle single ItemGroup', async () => {
        const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<Project>
  <ItemGroup>
    <PackageVersion Include="NUnit" Version="4.0.0" />
  </ItemGroup>
</Project>`;
        const result = xmlService.parsePropsFileContent(xmlContent);
        assert.strictEqual(result.length, 1, 'Should have 1 item group');
        assert.strictEqual(result[0].label, '', 'Label should be empty for unlabeled group');
        assert.strictEqual(result[0].packages.length, 1);
    });
    test('parsePropsFile should handle empty ItemGroup', async () => {
        const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<Project>
  <ItemGroup Label="Empty">
  </ItemGroup>
</Project>`;
        const result = xmlService.parsePropsFileContent(xmlContent);
        // Empty groups should be skipped
        assert.strictEqual(result.length, 0, 'Should have 0 item groups (empty ones are filtered)');
    });
    test('parsePropsFile should handle PropertyGroup', async () => {
        const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup Label="Packages">
    <PackageVersion Include="NUnit" Version="4.0.0" />
  </ItemGroup>
</Project>`;
        const result = xmlService.parsePropsFileContent(xmlContent);
        assert.strictEqual(result.length, 1, 'Should ignore PropertyGroup');
        assert.strictEqual(result[0].packages.length, 1);
    });
    test('readCsprojFileContent should extract package references', () => {
        const csprojContent = `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="NUnit" />
    <PackageReference Include="Newtonsoft.Json" />
  </ItemGroup>
</Project>`;
        const packages = xmlService.readCsprojFileContent(csprojContent);
        assert.strictEqual(packages.length, 2);
        assert.ok(packages.includes('NUnit'));
        assert.ok(packages.includes('Newtonsoft.Json'));
    });
    test('readCsprojFileContent should handle PackageReference with Version (version conflict)', () => {
        const csprojContent = `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="NUnit" Version="4.0.0" />
  </ItemGroup>
</Project>`;
        const packages = xmlService.readCsprojFileContent(csprojContent);
        assert.strictEqual(packages.length, 1);
        assert.ok(packages.includes('NUnit'));
    });
    test('getPackageReferencesWithVersions should detect version conflicts', () => {
        const csprojContent = `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="NUnit" Version="4.0.0" />
    <PackageReference Include="xUnit" />
  </ItemGroup>
</Project>`;
        const versionedPackages = xmlService.getPackageReferencesWithVersions(csprojContent);
        assert.strictEqual(versionedPackages.size, 1, 'Should only find packages with Version attribute');
        assert.strictEqual(versionedPackages.get('NUnit'), '4.0.0');
        assert.ok(!versionedPackages.has('xUnit'), 'xUnit should not be in versioned packages');
    });
});
//# sourceMappingURL=xmlService.test.js.map