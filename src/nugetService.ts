import axios, { AxiosInstance } from 'axios';
import { compareVersions } from './versionUtils';

export interface NuGetSearchResult {
    id: string;
    version: string;
    description: string;
    totalDownloads: number;
    verified: boolean;
    authors: string[];
    iconUrl?: string;
}

export interface NuGetPackageVersion {
    version: string;
    downloads: number;
    published: string;
}

export interface VulnerabilityEntry {
    severity: number;   // 0=Low, 1=Moderate, 2=High, 3=Critical
    url: string;
    versions: string;   // NuGet version range
}

export interface VulnerabilityInfo {
    severity: string;
    advisoryUrl: string;
    affectedVersions: string;
}

export class NuGetService {
    private axiosInstance: AxiosInstance;
    private searchBaseUrl = 'https://azuresearch-usnc.nuget.org';
    private apiBaseUrl = 'https://api.nuget.org';
    private cache: Map<string, { data: any; timestamp: number }>;
    private cacheTimeout = 5 * 60 * 1000; // 5 minutes
    private cacheMaxSize = 200;

    constructor() {
        this.axiosInstance = axios.create({
            timeout: 10000,
            headers: {
                'Accept': 'application/json'
            }
        });
        this.cache = new Map();
    }

    private getCachedData<T>(key: string): T | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data as T;
        }
        return null;
    }

    private setCachedData(key: string, data: any): void {
        // Evict oldest entries when cache exceeds max size
        if (this.cache.size >= this.cacheMaxSize) {
            let oldestKey: string | null = null;
            let oldestTime = Infinity;
            for (const [k, v] of this.cache) {
                if (v.timestamp < oldestTime) {
                    oldestTime = v.timestamp;
                    oldestKey = k;
                }
            }
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    async searchPackages(
        query: string,
        includePrerelease: boolean = false,
        take: number = 20
    ): Promise<NuGetSearchResult[]> {
        if (!query || query.trim().length === 0) {
            return [];
        }

        const cacheKey = `search:${query}:${includePrerelease}:${take}`;
        const cached = this.getCachedData<NuGetSearchResult[]>(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            const response = await this.axiosInstance.get(`${this.searchBaseUrl}/query`, {
                params: {
                    q: query,
                    prerelease: includePrerelease,
                    take: take
                }
            });

            const results: NuGetSearchResult[] = response.data.data.map((item: any) => ({
                id: item.id,
                version: item.version,
                description: item.description || '',
                totalDownloads: item.totalDownloads || 0,
                verified: item.verified || false,
                authors: item.authors || [],
                iconUrl: item.iconUrl || item.icon || ''
            }));

            this.setCachedData(cacheKey, results);
            return results;
        } catch (error) {
            console.error('Error searching packages:', error);
            return [];
        }
    }

    async getPackageVersions(packageId: string): Promise<string[]> {
        if (!packageId) {
            return [];
        }

        const cacheKey = `versions:${packageId.toLowerCase()}`;
        const cached = this.getCachedData<string[]>(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            const url = `${this.apiBaseUrl}/v3-flatcontainer/${packageId.toLowerCase()}/index.json`;
            const response = await this.axiosInstance.get(url);

            const versions: string[] = response.data.versions || [];
            this.setCachedData(cacheKey, versions);
            return versions;
        } catch (error) {
            console.error('Error getting package versions:', error);
            return [];
        }
    }

    async getLatestVersion(packageId: string, includePrerelease: boolean = false): Promise<string | null> {
        const versions = await this.getPackageVersions(packageId);
        if (versions.length === 0) {
            return null;
        }

        if (!includePrerelease) {
            // Filter out prerelease versions (containing '-')
            const stableVersions = versions.filter(v => !v.includes('-'));
            if (stableVersions.length > 0) {
                return stableVersions[stableVersions.length - 1];
            }
        }

        return versions[versions.length - 1];
    }

    async getPackageMetadata(packageId: string): Promise<any> {
        if (!packageId) {
            return null;
        }

        const cacheKey = `metadata:${packageId.toLowerCase()}`;
        const cached = this.getCachedData<any>(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            const url = `${this.apiBaseUrl}/v3/registration5-semver1/${packageId.toLowerCase()}/index.json`;
            const response = await this.axiosInstance.get(url);

            const metadata = response.data;
            this.setCachedData(cacheKey, metadata);
            return metadata;
        } catch (error) {
            console.error('Error getting package metadata:', error);
            return null;
        }
    }

    async getPackageInfo(packageId: string, version?: string): Promise<{
        description: string;
        authors: string[];
        projectUrl: string;
        licenseUrl: string;
        published: string;
        downloads: number;
        iconUrl?: string;
    } | null> {
        try {
            // Get data from search API (more reliable for authors and downloads)
            const searchResults = await this.searchPackages(packageId, true, 1);
            const searchResult = searchResults.length > 0 && searchResults[0].id.toLowerCase() === packageId.toLowerCase()
                ? searchResults[0]
                : null;

            const totalDownloads = searchResult?.totalDownloads || 0;
            const authorsFromSearch = searchResult?.authors || [];
            const iconUrl = searchResult?.iconUrl || '';

            // Try to get detailed info from catalog
            const metadata = await this.getPackageMetadata(packageId);
            if (!metadata || !metadata.items || metadata.items.length === 0) {
                // Return basic info from search if catalog fails
                return searchResult ? {
                    description: searchResult.description || '',
                    authors: authorsFromSearch,
                    projectUrl: '',
                    licenseUrl: '',
                    published: '',
                    downloads: totalDownloads,
                    iconUrl: iconUrl
                } : null;
            }

            // Find the correct catalog page for the version
            let catalogPage = metadata.items[metadata.items.length - 1]; // Default to latest page
            if (version && metadata.items.length > 1) {
                // Find which page contains the version
                for (const page of metadata.items) {
                    const lowerVersion = page.lower || '';
                    const upperVersion = page.upper || '';
                    if (compareVersions(version, upperVersion) <= 0 &&
                        compareVersions(version, lowerVersion) >= 0) {
                        catalogPage = page;
                        break;
                    }
                }
            }

            // Check if items are already expanded inline (common for packages with few versions)
            let items = catalogPage.items || [];

            // If items not expanded, fetch the catalog page
            if (items.length === 0 && catalogPage['@id']) {
                const pageResponse = await this.axiosInstance.get(catalogPage['@id']);
                items = pageResponse.data.items || [];
            }

            const catalogEntry = version
                ? items.find((item: any) => item.catalogEntry?.version === version)?.catalogEntry
                : items[items.length - 1]?.catalogEntry;

            if (catalogEntry) {
                return {
                    description: catalogEntry.description || searchResult?.description || '',
                    authors: catalogEntry.authors?.split(',').map((a: string) => a.trim()) || authorsFromSearch,
                    projectUrl: catalogEntry.projectUrl || '',
                    licenseUrl: catalogEntry.licenseUrl || '',
                    published: catalogEntry.published || '',
                    downloads: totalDownloads,
                    iconUrl: catalogEntry.iconUrl || iconUrl
                };
            }

            // Fallback to search results if catalog page fetch fails
            return searchResult ? {
                description: searchResult.description || '',
                authors: authorsFromSearch,
                projectUrl: '',
                licenseUrl: '',
                published: '',
                downloads: totalDownloads,
                iconUrl: iconUrl
            } : null;
        } catch (error) {
            console.error('Error getting package info:', error);
            return null;
        }
    }

    async getVersionVulnerabilities(packageId: string): Promise<Record<string, Array<{ severity: string; advisoryUrl: string }>>> {
        if (!packageId) {
            return {};
        }

        const cacheKey = `version-vulns:${packageId.toLowerCase()}`;
        const cached = this.getCachedData<Record<string, Array<{ severity: string; advisoryUrl: string }>>>(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            const url = `${this.apiBaseUrl}/v3/registration5-gz-semver2/${packageId.toLowerCase()}/index.json`;
            const response = await this.axiosInstance.get(url);
            const result: Record<string, Array<{ severity: string; advisoryUrl: string }>> = {};

            for (const page of response.data.items || []) {
                let items = page.items || [];

                // If items not expanded inline, fetch the page
                if (items.length === 0 && page['@id']) {
                    try {
                        const pageResponse = await this.axiosInstance.get(page['@id']);
                        items = pageResponse.data.items || [];
                    } catch {
                        continue;
                    }
                }

                for (const item of items) {
                    const entry = item.catalogEntry;
                    if (entry?.vulnerabilities && entry.vulnerabilities.length > 0) {
                        // Store with lowercase key to match flat container version strings
                        result[entry.version.toLowerCase()] = entry.vulnerabilities.map((v: any) => ({
                            severity: this.severityToString(parseInt(v.severity) || 0),
                            advisoryUrl: v.advisoryUrl || ''
                        }));
                    }
                }
            }

            this.setCachedData(cacheKey, result);
            return result;
        } catch (error) {
            console.error('Error getting version vulnerabilities:', error);
            return {};
        }
    }

    // --- Vulnerability Database ---

    private vulnDb: Map<string, VulnerabilityEntry[]> | null = null;
    private vulnDbTimestamp: number = 0;
    private vulnDbTtl = 30 * 60 * 1000; // 30 minutes
    private vulnDbLoading: Promise<void> | null = null;

    async ensureVulnerabilityDb(): Promise<void> {
        if (this.vulnDb && Date.now() - this.vulnDbTimestamp < this.vulnDbTtl) {
            return;
        }
        if (this.vulnDbLoading) {
            return this.vulnDbLoading;
        }
        this.vulnDbLoading = this.loadVulnerabilityDb();
        try {
            await this.vulnDbLoading;
        } finally {
            this.vulnDbLoading = null;
        }
    }

    private async loadVulnerabilityDb(): Promise<void> {
        try {
            const indexUrl = 'https://api.nuget.org/v3/vulnerabilities/index.json';
            const indexResponse = await this.axiosInstance.get(indexUrl);
            const pages: Array<{ '@id': string }> = indexResponse.data;

            const db = new Map<string, VulnerabilityEntry[]>();

            for (const page of pages) {
                const pageResponse = await this.axiosInstance.get(page['@id']);
                const pageData: Record<string, VulnerabilityEntry[]> = pageResponse.data;

                for (const [packageId, entries] of Object.entries(pageData)) {
                    const key = packageId.toLowerCase();
                    const existing = db.get(key) || [];
                    existing.push(...entries);
                    db.set(key, existing);
                }
            }

            this.vulnDb = db;
            this.vulnDbTimestamp = Date.now();
            console.log(`Loaded vulnerability database: ${db.size} packages with known vulnerabilities`);
        } catch (error) {
            console.warn('Failed to load NuGet vulnerability database:', error);
            // Don't overwrite existing db on failure
            if (!this.vulnDb) {
                this.vulnDb = new Map();
                this.vulnDbTimestamp = Date.now();
            }
        }
    }

    async checkVulnerabilities(packageId: string, version: string): Promise<VulnerabilityInfo[]> {
        await this.ensureVulnerabilityDb();
        if (!this.vulnDb) {
            return [];
        }

        const entries = this.vulnDb.get(packageId.toLowerCase()) || [];
        const matches: VulnerabilityInfo[] = [];

        for (const entry of entries) {
            if (this.versionInRange(version, entry.versions)) {
                matches.push({
                    severity: this.severityToString(entry.severity),
                    advisoryUrl: entry.url,
                    affectedVersions: entry.versions
                });
            }
        }

        return matches;
    }

    private severityToString(severity: number): string {
        switch (severity) {
            case 0: return 'Low';
            case 1: return 'Moderate';
            case 2: return 'High';
            case 3: return 'Critical';
            default: return 'Unknown';
        }
    }

    private versionInRange(version: string, range: string): boolean {
        // NuGet version range syntax:
        // "(, 2.0.0)"  → < 2.0.0
        // "[1.0.0, 2.0.0)" → >= 1.0.0 and < 2.0.0
        // "[1.0.0, 2.0.0]" → >= 1.0.0 and <= 2.0.0
        // "(1.0.0, )" → > 1.0.0
        const trimmed = range.trim();
        const match = trimmed.match(/^([[(])\s*([^,]*?)\s*,\s*([^)\]]*?)\s*([\])])$/);
        if (!match) {
            return false;
        }

        const lowerInclusive = match[1] === '[';
        const lowerStr = match[2].trim();
        const upperStr = match[3].trim();
        const upperInclusive = match[4] === ']';

        // Check lower bound
        if (lowerStr) {
            const cmp = compareVersions(version, lowerStr);
            if (lowerInclusive ? cmp < 0 : cmp <= 0) {
                return false;
            }
        }

        // Check upper bound
        if (upperStr) {
            const cmp = compareVersions(version, upperStr);
            if (upperInclusive ? cmp > 0 : cmp >= 0) {
                return false;
            }
        }

        return true;
    }

    clearCache(): void {
        this.cache.clear();
    }

    async isPackageOutdated(packageId: string, currentVersion: string): Promise<{
        isOutdated: boolean;
        latestVersion: string | null;
    }> {
        const latestVersion = await this.getLatestVersion(packageId, false);

        if (!latestVersion) {
            return { isOutdated: false, latestVersion: null };
        }

        const isOutdated = currentVersion !== latestVersion &&
                          compareVersions(currentVersion, latestVersion) < 0;

        return { isOutdated, latestVersion };
    }

}
