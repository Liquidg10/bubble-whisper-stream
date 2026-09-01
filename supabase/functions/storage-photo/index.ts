import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { verifiedBearerMindManualScope, wrapMindManualSubjectHandler } from "../_shared/migrationWriteFence.ts";
import { createStoragePhotoHandler } from "../_shared/storagePhotoGateway.ts";

const invalidStorageOperation = () => new Response(
  JSON.stringify({ error: 'INVALID_PHOTO_REQUEST' }),
  {
    status: 400,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type, x-storage-operation',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  },
);

serve(wrapMindManualSubjectHandler('storage-photo', verifiedBearerMindManualScope((request) => {
  const operation = request.headers.get('x-storage-operation');
  return operation === 'upload' || operation === 'delete' ? operation : invalidStorageOperation();
}), createStoragePhotoHandler()));
