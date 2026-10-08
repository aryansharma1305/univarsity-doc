'use client';

import { DownloadIcon, Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@docversity/ui/components/card';
import { PageHeader } from '@/components/data/page-header';
import { ForbiddenState } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { importsApi, useCreateImport } from './api';
import { FileDropzone } from './file-dropzone';
import { ImportStepper } from './import-stepper';

/** Steps 1–2: download the template, choose and upload the workbook. */
export function NewImportView() {
  const canRun = useCan(PERMISSIONS.importsStudentsRun);
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const create = useCreateImport();

  if (!canRun) return <ForbiddenState />;

  const download = async () => {
    setDownloading(true);
    try {
      await importsApi.downloadTemplate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  const submit = () => {
    if (!file) return;
    setUploadError(null);
    create.mutate(file, {
      onSuccess: (job) => {
        router.push(`/admin/imports/${job.id}`);
      },
      onError: (error) => {
        setUploadError(errorMessage(error));
      },
    });
  };

  return (
    <>
      <PageHeader
        title="Import students"
        description="Add or update many students at once from an Excel workbook."
      />
      <ImportStepper current={file ? 1 : 0} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-card-title">1. Download the template</h2>
            </CardTitle>
            <CardDescription>
              The template lists every column, which ones are required and the accepted formats. You
              can also upload the university’s own workbook — you will map its columns next.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void download()} disabled={downloading}>
              {downloading ? (
                <Loader2Icon aria-hidden="true" className="animate-spin" />
              ) : (
                <DownloadIcon aria-hidden="true" />
              )}
              Download template
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-card-title">2. Upload the workbook</h2>
            </CardTitle>
            <CardDescription>
              Nothing is saved to student records yet: the file is checked and every row is
              validated first.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FileDropzone file={file} onFile={setFile} disabled={create.isPending} />
            {uploadError && (
              <p
                role="alert"
                className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text"
              >
                {uploadError}
              </p>
            )}
            <div>
              <Button onClick={submit} disabled={!file || create.isPending}>
                {create.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
                {create.isPending ? 'Uploading…' : 'Upload and continue'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
