revoke execute on function public.is_workspace_email_allowed(text) from anon;
grant execute on function public.is_workspace_email_allowed(text) to authenticated;
