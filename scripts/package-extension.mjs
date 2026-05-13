// @ts-check
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_SCRIPT_ORDER } from './content-script-order.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(rootDir, 'artifacts');
const packageDir = path.join(artifactsDir, 'chrome-extension');

const localDependencyAssets = [
    {
        source: 'node_modules/katex/dist/katex.min.css',
        target: 'vendor/katex/katex.min.css',
    },
    {
        source: 'node_modules/katex/dist/fonts',
        target: 'vendor/katex/fonts',
    },
    {
        source: 'node_modules/highlight.js/styles/atom-one-dark.min.css',
        target: 'vendor/highlight.js/atom-one-dark.min.css',
    },
];

const requiredPaths = [
    'manifest.json',
    'logo.png',
    'background',
    'shared',
    'services',
    'dist/assets',
    'dist/sidepanel/index.html',
    'dist/sandbox/index.html',
];

export function getLocalDependencyAssets() {
    return localDependencyAssets.map((asset) => ({ ...asset }));
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
export function shouldExcludeFromPackage(relativePath) {
    const normalized = relativePath.split(path.sep).join('/');
    const basename = path.basename(normalized);
    return basename.endsWith('.test.js') || basename.endsWith('.test.ts');
}

/**
 * @param {{ content_scripts?: Array<Record<string, unknown> & { js?: string[] }> } & Record<string, unknown>} manifest
 */
export function createPackagedManifest(manifest) {
    return {
        ...manifest,
        content_scripts: (manifest.content_scripts ?? []).map((entry) => ({
            ...entry,
            js: ['content/index.js'],
        })),
    };
}

/**
 * @param {Array<{ relativePath: string, source: string }>} segments
 */
export function formatContentBundle(segments) {
    return (
        segments
            .map(({ relativePath, source }) =>
                [`// ----- ${relativePath} -----`, source.trimEnd()].join('\n')
            )
            .join('\n\n') + '\n'
    );
}

/**
 * @param {string} relativePath
 */
async function ensureExists(relativePath) {
    const absolutePath = path.join(rootDir, relativePath);
    try {
        await stat(absolutePath);
    } catch {
        throw new Error(`Missing required build input: ${relativePath}`);
    }
}

/**
 * @param {string} sourceRelativePath
 * @param {string} [targetRelativePath]
 */
async function copyIntoPackage(sourceRelativePath, targetRelativePath = sourceRelativePath) {
    const source = path.join(rootDir, sourceRelativePath);
    const target = path.join(packageDir, targetRelativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, {
        recursive: true,
        filter: (sourcePath) => {
            const relativePath = path.relative(rootDir, sourcePath);
            return !shouldExcludeFromPackage(relativePath);
        },
    });
}

async function copyLocalDependencyAssets() {
    await Promise.all(
        localDependencyAssets.map((asset) => copyIntoPackage(asset.source, asset.target))
    );
}

async function writePackagedManifest() {
    const manifest = JSON.parse(await readFile(path.join(rootDir, 'manifest.json'), 'utf8'));
    await writeFile(
        path.join(packageDir, 'manifest.json'),
        JSON.stringify(createPackagedManifest(manifest), null, 2) + '\n',
        'utf8'
    );
}

async function writeContentBundle() {
    /** @type {string[]} */
    const contentScriptOrder = CONTENT_SCRIPT_ORDER;
    const segments = await Promise.all(
        contentScriptOrder.map(async (relativePath) => ({
            relativePath,
            source: await readFile(path.join(rootDir, relativePath), 'utf8'),
        }))
    );

    const target = path.join(packageDir, 'content/index.js');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, formatContentBundle(segments), 'utf8');
}

/**
 * @param {string} directory
 */
async function removeJunkFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    await Promise.all(
        entries.map(async (entry) => {
            const fullPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                await removeJunkFiles(fullPath);
                return;
            }

            if (entry.name === '.DS_Store') {
                await rm(fullPath, { force: true });
            }
        })
    );
}

async function main() {
    for (const relativePath of requiredPaths) {
        await ensureExists(relativePath);
    }
    for (const relativePath of CONTENT_SCRIPT_ORDER) {
        await ensureExists(relativePath);
    }
    for (const asset of localDependencyAssets) {
        await ensureExists(asset.source);
    }

    await rm(packageDir, { recursive: true, force: true });
    await mkdir(packageDir, { recursive: true });

    await Promise.all([
        writePackagedManifest(),
        copyIntoPackage('logo.png'),
        copyIntoPackage('background'),
        writeContentBundle(),
        copyIntoPackage('shared'),
        copyIntoPackage('services'),
        copyLocalDependencyAssets(),
        copyIntoPackage('dist/assets', 'assets'),
        copyIntoPackage('dist/sidepanel/index.html', 'sidepanel/index.html'),
        copyIntoPackage('dist/sandbox/index.html', 'sandbox/index.html'),
    ]);

    await removeJunkFiles(packageDir);

    const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
    await writeFile(
        path.join(packageDir, 'build-info.json'),
        JSON.stringify(
            {
                name: packageJson.name,
                version: packageJson.version,
                builtAt: new Date().toISOString(),
            },
            null,
            2
        ) + '\n',
        'utf8'
    );

    console.log(`Extension package prepared at ${path.relative(rootDir, packageDir)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
