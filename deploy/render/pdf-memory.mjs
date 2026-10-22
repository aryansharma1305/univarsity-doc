// Phase 14C (G4): peak memory of synthetic PDF preview rendering inside the API image, measured by
// the container's own cgroup (memory.peak). Runs the real renderers with synthetic fixtures only:
// each preview type alone, then the API's worst case — its two preview services at their limit of
// two concurrent renders each (four Chromium instances). Prints JSON; writes nothing.
//   docker run --rm --memory 2g --entrypoint node -v ./deploy/render/pdf-memory.mjs:/m.mjs:ro <api image> /m.mjs
import { readFileSync } from 'node:fs';
import * as docs from '@docversity/documents';

const mib = (bytes) => Math.round(bytes / 1048576);
const cgroup = (name) => Number(readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim());
const resetPeak = () => {
  try {
    // Linux ≥ 6.12 allows resetting the peak; otherwise peaks stay cumulative (still an upper bound).
    return readFileSync('/sys/fs/cgroup/memory.peak', 'utf8') && false;
  } catch {
    return false;
  }
};
const renders = {
  marksheetStress: () =>
    docs.renderMarksheetPreview(docs.syntheticMarksheet('stress'), docs.marksheetTemplates()[0]),
  trainingLongText: () => {
    const t = docs.trainingCertificateTemplates()[0];
    return docs.renderTrainingCertificatePreview(docs.syntheticTrainingCertificate('long-text'), t);
  },
  transcriptStress: () => {
    const t = docs.academicCertificateTemplates().find((x) => x.type === 'TRANSCRIPT');
    return docs.renderAcademicCertificatePreview(
      docs.syntheticAcademicCertificate('TRANSCRIPT', 'stress-semester'),
      t,
    );
  },
};
const result = {
  limitMiB: mib(cgroup('memory.max')),
  baselineMiB: mib(cgroup('memory.current')),
  runs: [],
};
for (const [name, render] of Object.entries(renders)) {
  const started = Date.now();
  const { bytes, pages } = await render();
  result.runs.push({
    name,
    pages,
    pdfKiB: Math.round(bytes.length / 1024),
    ms: Date.now() - started,
    peakSoFarMiB: mib(cgroup('memory.peak')),
  });
}
resetPeak();
const started = Date.now();
const outcomes = await Promise.allSettled([
  renders.marksheetStress(),
  renders.marksheetStress(),
  renders.transcriptStress(),
  renders.transcriptStress(),
]);
result.worstCaseConcurrent = {
  renders: 4,
  fulfilled: outcomes.filter((o) => o.status === 'fulfilled').length,
  ms: Date.now() - started,
  peakMiB: mib(cgroup('memory.peak')),
};
const events = Object.fromEntries(
  readFileSync('/sys/fs/cgroup/memory.events', 'utf8')
    .trim()
    .split('\n')
    .map((l) => l.split(' ')),
);
result.oomKills = Number(events.oom_kill ?? 0);
result.afterMiB = mib(cgroup('memory.current'));
console.log(JSON.stringify(result, null, 2));
