import { createPrismaClient } from '/app/packages/database/dist/index.js';
import { createRequire } from 'node:module';
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== 'postgres' || url.pathname !== '/docversity_staging') {
  throw new Error('Recovery verification is staging-only');
}
const db = createPrismaClient({ connectionString: url.toString() });
try {
  const student = await db.student.findFirst();
  if ((await db.student.count()) !== 1 || student?.fullName !== 'SYNTHETIC Staging Student') {
    throw new Error('Restored synthetic database fixture mismatch');
  }
} finally {
  await db.$disconnect();
}
const { S3Client, GetObjectCommand } = createRequire('/app/packages/storage/package.json')(
  '@aws-sdk/client-s3',
);
const storage = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
try {
  const object = await storage.send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: 'synthetic/staging.txt' }),
  );
  if (
    (await object.Body.transformToString()) !==
    'SYNTHETIC PHASE 14A BACKUP FIXTURE — no university records\n'
  ) {
    throw new Error('Restored synthetic object fixture mismatch');
  }
} finally {
  storage.destroy();
}
console.log(
  'PASS: restored data is readable using the limited application database and storage credentials.',
);
