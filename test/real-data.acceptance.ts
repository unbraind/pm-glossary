/** Measure a read-only public tracker copy; only the scratch copy receives glossary writes. */
import { writeFile } from 'node:fs/promises';
import { realData } from './corpus.ts';
const report=await realData(true);
await writeFile('real-data.local.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
