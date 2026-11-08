import { scan, writeReports, type ScanOptions } from '@afkzona/brightline';

/** Scan a site and write report.json, report.html and screenshots to outDir. */
export async function scanSite(url: string, outDir: string, extra: Partial<ScanOptions> = {}) {
  const report = await scan({ url, maxPages: 5, outputDir: outDir, ...extra });
  await writeReports(report, outDir);
  for (const f of report.findings) {
    console.log(`[${f.confidence}] ${f.title}: ${f.pageUrl}`);
  }
  return report;
}
