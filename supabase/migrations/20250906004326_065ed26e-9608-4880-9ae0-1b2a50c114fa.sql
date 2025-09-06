-- Fix security warnings by setting search_path on existing functions

-- Fix get_user_tenant_id function
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT tenant_id 
  FROM public.user_tenants 
  WHERE user_id = auth.uid() 
  LIMIT 1;
$function$;

-- Fix user_belongs_to_tenant function
CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(tenant_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_tenants 
    WHERE user_id = auth.uid() 
    AND tenant_id = tenant_uuid
  );
$function$;

-- Fix is_tenant_admin function
CREATE OR REPLACE FUNCTION public.is_tenant_admin(tenant_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_tenants 
    WHERE user_id = auth.uid() 
    AND tenant_id = tenant_uuid
    AND role = 'admin'
  );
$function$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;