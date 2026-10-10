import { ImportStepper } from '@/features/imports/import-stepper';
export function PreviewNotice() {
  return (
    <p
      role="note"
      className="mb-6 rounded-md border border-warning-text/20 bg-warning-soft p-4 text-sm text-warning-text"
    >
      Preview only — no marks have been saved to official records.
    </p>
  );
}
export function PreviewSteps({ current }: { current: number }) {
  return (
    <ImportStepper
      current={current}
      steps={[
        'Select context',
        'Upload workbook',
        'Map columns',
        'Validate',
        'Preview rows',
        'Download error report',
      ]}
      shortLabels={['Context', 'Upload', 'Map', 'Validate', 'Preview', 'Report']}
    />
  );
}
