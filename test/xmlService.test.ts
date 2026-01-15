import * as assert from 'assert';
import { XmlService } from '../src/xmlService';

suite('XmlService Test Suite', () => {
    let xmlService: XmlService;

    setup(() => {
        xmlService = new XmlService();
    });

    test('parsePropsContent should extract package versions', () => {
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

        const result = xmlService.parsePropsContent(xmlContent);

        assert.ok(result, 'Should return a result');
        assert.strictEqual(result!.itemGroups.length, 2, 'Should have 2 item groups');
        assert.strictEqual(result!.itemGroups[0].label, 'Test Framework');
        assert.strictEqual(result!.itemGroups[0].packages.length, 2, 'First group should have 2 packages');
        assert.strictEqual(result!.itemGroups[1].label, 'Utilities');
        assert.strictEqual(result!.itemGroups[1].packages.length, 1, 'Second group should have 1 package');

        // Verify package details
        const nunit = result!.itemGroups[0].packages.find((p: any) => p.name === 'NUnit');
        assert.ok(nunit, 'NUnit package should exist');
        assert.strictEqual(nunit?.version, '4.0.0');
    });

    test('parsePropsContent should handle single ItemGroup', () => {
        const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<Project>
  <ItemGroup>
    <PackageVersion Include="NUnit" Version="4.0.0" />
  </ItemGroup>
</Project>`;

        const result = xmlService.parsePropsContent(xmlContent);

        assert.ok(result, 'Should return a result');
        assert.strictEqual(result!.itemGroups.length, 1, 'Should have 1 item group');
        assert.strictEqual(result!.itemGroups[0].label, undefined, 'Label should be undefined for unlabeled group');
        assert.strictEqual(result!.itemGroups[0].packages.length, 1);
    });

    test('parsePropsContent should handle empty ItemGroup', () => {
        const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<Project>
  <ItemGroup Label="Empty">
  </ItemGroup>
</Project>`;

        const result = xmlService.parsePropsContent(xmlContent);

        // Empty groups should be filtered out
        assert.ok(result, 'Should return a result');
        assert.strictEqual(result!.itemGroups.length, 0, 'Should have 0 item groups (empty ones are filtered)');
    });

    test('parsePropsContent should handle PropertyGroup', () => {
        const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup Label="Packages">
    <PackageVersion Include="NUnit" Version="4.0.0" />
  </ItemGroup>
</Project>`;

        const result = xmlService.parsePropsContent(xmlContent);

        assert.ok(result, 'Should return a result');
        assert.strictEqual(result!.managePackageVersionsCentrally, true, 'Should parse PropertyGroup');
        assert.strictEqual(result!.itemGroups.length, 1, 'Should have 1 ItemGroup');
        assert.strictEqual(result!.itemGroups[0].packages.length, 1);
    });

    test('parsePropsContent should return null for invalid XML', () => {
        const xmlContent = 'invalid xml content';

        const result = xmlService.parsePropsContent(xmlContent);

        assert.strictEqual(result, null, 'Should return null for invalid XML');
    });

    test('parsePropsContent should handle multiple packages in one group', () => {
        const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<Project>
  <ItemGroup Label="Test">
    <PackageVersion Include="Package1" Version="1.0.0" />
    <PackageVersion Include="Package2" Version="2.0.0" />
    <PackageVersion Include="Package3" Version="3.0.0" />
  </ItemGroup>
</Project>`;

        const result = xmlService.parsePropsContent(xmlContent);

        assert.ok(result, 'Should return a result');
        assert.strictEqual(result!.itemGroups.length, 1);
        assert.strictEqual(result!.itemGroups[0].packages.length, 3, 'Should have 3 packages');
    });
});
