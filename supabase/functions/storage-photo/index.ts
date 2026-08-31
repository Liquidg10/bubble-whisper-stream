import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { wrapMindManualHandler } from "../_shared/migrationWriteFence.ts";
import { createStoragePhotoHandler } from "../_shared/storagePhotoGateway.ts";

serve(wrapMindManualHandler('storage-photo', createStoragePhotoHandler()));
