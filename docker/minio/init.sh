#!/bin/sh
# Idempotent MinIO bootstrap for local development (run by the `minio-init` compose service).
#   1. create the private application bucket and the separate automated-test bucket
#   2. ensure anonymous access is disabled on both
#   3. create a least-privilege application user limited to those two buckets
# Tests (API integration and e2e) write only to S3_TEST_BUCKET, never to the development bucket.
# The image is minimal (no sed/awk), so only POSIX shell built-ins and `mc` are used.
set -eu

: "${S3_BUCKET:?S3_BUCKET is required}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"
S3_TEST_BUCKET="${S3_TEST_BUCKET:-${S3_BUCKET}-test}"
if [ "${S3_TEST_BUCKET}" = "${S3_BUCKET}" ]; then
  echo "minio-init: S3_TEST_BUCKET must differ from S3_BUCKET" >&2
  exit 1
fi

echo "minio-init: ensuring bucket '${S3_BUCKET}'"
mc mb --ignore-existing "local/${S3_BUCKET}"
mc anonymous set none "local/${S3_BUCKET}"
echo "minio-init: ensuring test bucket '${S3_TEST_BUCKET}'"
mc mb --ignore-existing "local/${S3_TEST_BUCKET}"
mc anonymous set none "local/${S3_TEST_BUCKET}"

policy_file="$(mktemp)"
cat > "${policy_file}" <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::${S3_BUCKET}", "arn:aws:s3:::${S3_TEST_BUCKET}"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::${S3_BUCKET}/*", "arn:aws:s3:::${S3_TEST_BUCKET}/*"]
    }
  ]
}
POLICY

echo "minio-init: ensuring application user and bucket-scoped policy"
mc admin policy create local docversity-app "${policy_file}"
mc admin user add local "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}"
if ! mc admin policy attach local docversity-app --user "${S3_ACCESS_KEY}" >/dev/null 2>&1; then
  echo "minio-init: policy already attached"
fi

rm -f "${policy_file}"
echo "minio-init: done"
