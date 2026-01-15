import axios, { AxiosInstance } from 'axios';

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

export class NuGetService {
    private axiosInstance: AxiosInstance;
    private searchBaseUrl = 'https://azuresearch-usnc.nuget.org';
    private apiBaseUrl = 'https://api.nuget.org';
    private cache: Map<string, { data: any; timestamp: number }>;
    private cacheTimeout = 5 * 60 * 1000; // 5 minutes

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
                    if (this.compareVersions(version, upperVersion) <= 0 &&
                        this.compareVersions(version, lowerVersion) >= 0) {
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
                          this.compareVersions(currentVersion, latestVersion) < 0;

        return { isOutdated, latestVersion };
    }

    private compareVersions(v1: string, v2: string): number {
        // Simple version comparison (doesn't handle all semver cases, but good enough)
        const parts1 = v1.split(/[.-]/).map(p => parseInt(p) || 0);
        const parts2 = v2.split(/[.-]/).map(p => parseInt(p) || 0);

        const maxLength = Math.max(parts1.length, parts2.length);

        for (let i = 0; i < maxLength; i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;

            if (p1 < p2) {
                return -1;
            }
            if (p1 > p2) {
                return 1;
            }
        }

        return 0;
    }
}
