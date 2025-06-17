import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname as pathDirname } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { globSync } from 'glob';
// Removed: import { minify as jsMinify } from 'terser';
// Removed: import { minify as htmlMinify } from 'html-minifier';
import JSZip from "jszip";
// Removed: import obfs from 'javascript-obfuscator';

const env = process.env.NODE_ENV || 'production';
const devMode = env !== 'production'; // This variable will now effectively just determine if we use the original code

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const ASSET_PATH = join(__dirname, '../src/assets');
const DIST_PATH = join(__dirname, '../dist/');

async function processHtmlPages() {
    const indexFiles = globSync('**/index.html', { cwd: ASSET_PATH });
    const result = {};

    for (const relativeIndexPath of indexFiles) {
        const dir = pathDirname(relativeIndexPath);
        const base = (file) => join(ASSET_PATH, dir, file);

        const indexHtml = readFileSync(base('index.html'), 'utf8');
        const styleCode = readFileSync(base('style.css'), 'utf8');
        const scriptCode = readFileSync(base('script.js'), 'utf8');

        // Original scriptCode is used directly, no minification
        const finalScriptCode = scriptCode;
        const finalHtml = indexHtml
            .replace(/__STYLE__/g, `<style>${styleCode}</style>`)
            .replace(/__SCRIPT__/g, finalScriptCode); // Removed .code as it's not minified by terser

        // No HTML minification
        const unminifiedHtml = finalHtml; // Use the raw HTML

        result[dir] = JSON.stringify(unminifiedHtml); // Store the unminified HTML
    }

    console.log('✅ Assets bundled successfully!');
    return result;
}

async function buildWorker() {

    const htmls = await processHtmlPages();
    const faviconBuffer = readFileSync('./src/assets/favicon.ico');
    const faviconBase64 = faviconBuffer.toString('base64');

    const code = await build({
        entryPoints: [join(__dirname, '../src/worker.js')],
        bundle: true,
        format: 'esm',
        write: false,
        external: ['cloudflare:sockets'],
        platform: 'browser',
        target: 'es2020',
        define: {
            __PANEL_HTML_CONTENT__: htmls['panel'] ?? '""',
            __LOGIN_HTML_CONTENT__: htmls['login'] ?? '""',
            __ERROR_HTML_CONTENT__: htmls['error'] ?? '""',
            __SECRETS_HTML_CONTENT__: htmls['secrets'] ?? '""',
            __ICON__: JSON.stringify(faviconBase64)
        }
    });

    console.log('✅ Worker built successfully!');

    let finalCode;
    // The devMode check now just determines if we take the esbuild output directly
    // since minification and obfuscation steps are removed from the 'else' block.
    // For consistency, we'll assign directly.
    finalCode = code.outputFiles[0].text;

    // Removed the entire `else` block containing jsMinify and obfuscation
    // if (devMode) {
    //     finalCode = code.outputFiles[0].text;
    // } else {
    //     // ... minification and obfuscation code removed ...
    // }


    const worker = `// @ts-nocheck\n${finalCode}`;
    mkdirSync(DIST_PATH, { recursive: true });
    writeFileSync('./dist/worker.js', worker, 'utf8');

    const zip = new JSZip();
    zip.file('_worker.js', worker);
    zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE' // You could also set this to 'STORE' for no compression if you truly want everything raw
    }).then(nodebuffer => writeFileSync('./dist/worker.zip', nodebuffer));

    console.log('✅ Done!');
}

buildWorker().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
