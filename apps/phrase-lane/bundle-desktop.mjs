import {readFile,writeFile} from 'node:fs/promises';
export async function bundleDesktop(){
 const names='DesktopError, desktopRoute, desktopSession, desktopNativeRequest, desktopAllowed';
 const desktop=await readFile('src/desktop.mjs','utf8');
 const worker=await readFile('dist/worker.mjs','utf8');
 const period=await readFile('src/revenue-period.mjs','utf8');
 await writeFile('dist/worker.mjs',worker.replace("import {revenuePeriod} from './revenue-period.mjs';",period.replace(/^export /gm,'' )).replace(`import {${names}} from './desktop.mjs';`,`const {${names}} = (() => {\n${desktop.replace(/^export /gm,'')}\nreturn {${names}};\n})();`));
}
