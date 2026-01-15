import * as path from 'path';
import Mocha = require('mocha');
import { glob } from 'glob';

export function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 15000
    });

    const testsRoot = path.resolve(__dirname);

    return new Promise<void>((resolve, reject) => {
        // Find all test files
        glob('**/**.test.js', { cwd: testsRoot }).then((files: string[]) => {
            if (files.length === 0) {
                console.warn('No test files found');
                return resolve();
            }

            console.log(`Found ${files.length} test file(s):`);

            // Add files to the test suite
            files.forEach((f: string) => {
                const testFile = path.resolve(testsRoot, f);
                console.log(`  - ${f}`);
                mocha.addFile(testFile);
            });

            // Run the mocha test
            try {
                mocha.run((failures: number) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`));
                    } else {
                        console.log('All tests passed!');
                        resolve();
                    }
                });
            } catch (err: any) {
                console.error('Error running tests:', err);
                reject(err);
            }
        }).catch((err: any) => {
            console.error('Error finding test files:', err);
            reject(err);
        });
    });
}
