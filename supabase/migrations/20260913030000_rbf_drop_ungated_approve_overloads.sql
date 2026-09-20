/*
# Drop the ungated approve_member overloads

## Why this mattered
The passcode gate was added to approve_member as a NEW overload with an extra
leading p_passcode argument. PostgreSQL treats that as a separate function, so
the two older signatures — which perform NO access check at all — remained
callable through /rest/v1/rpc/approve_member by anyone with the public anon
key. That fully bypassed the gate it was meant to enforce.

Dropping both old overloads leaves only the gated version.
*/

DROP FUNCTION IF EXISTS public.approve_member(integer, text, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.approve_member(integer, text, integer, integer, integer, integer, date, date);
